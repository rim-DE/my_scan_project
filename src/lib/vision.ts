// Détection des livres sur une photo avec l'API Claude (vision + sortie JSON structurée).
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "./env";
import { iou, normalizeQuad, overlapOfSmaller, quadToBox, type NormalizedBox, type Point } from "./geometry";

export type { NormalizedBox } from "./geometry";

const CornerSchema = z.object({ x: z.number().int(), y: z.number().int() });

export const DetectedBookSchema = z.object({
  title: z.string().describe("Titre lu sur la tranche ou la couverture"),
  author: z.string().nullable().describe("Auteur si lisible, sinon null"),
  publisher: z.string().nullable().describe("Éditeur ou collection si lisible, sinon null"),
  isbn: z.string().nullable().describe("ISBN seulement s'il est lisible sur la photo, sinon null"),
  corners: z
    .array(CornerSchema)
    .describe(
      "Les 4 coins de la tranche (ou de la couverture) tels qu'ils apparaissent sur la photo, en suivant l'inclinaison du livre. Coordonnées en pixels de l'image",
    ),
  text_direction: z
    .enum(["bottom_to_top", "top_to_bottom", "left_to_right", "right_to_left"])
    .describe("Sens de lecture du texte de la tranche sur la photo"),
  confidence: z.enum(["high", "medium", "low"]),
});

export const DetectionResultSchema = z.object({
  books: z.array(DetectedBookSchema),
});

export type DetectedBook = z.infer<typeof DetectedBookSchema>;

/** Livre détecté avec sa forme convertie (coordonnées 0-1). */
export interface CleanDetection extends DetectedBook {
  polygon: Point[] | null;
  bbox: NormalizedBox | null;
}

const titleKey = (b: DetectedBook) =>
  b.title.toLowerCase().replace(/\s+/g, " ").trim() + "|" + (b.author ?? "").toLowerCase().trim();

/**
 * Écarte les détections vides et les doublons. Deux livres ne sont des doublons que s'ils ont
 * le même titre ET se recouvrent sur la photo : deux exemplaires différents de « Léonard de Vinci »
 * rangés à deux endroits de l'étagère sont bien deux livres.
 */
export function cleanDetections(books: DetectedBook[], size: { width: number; height: number }): CleanDetection[] {
  const out: CleanDetection[] = [];
  for (const b of books) {
    const title = b.title.trim();
    if (title.length < 2) continue;
    const polygon = normalizeQuad(b.corners, size.width, size.height);
    const bbox = polygon ? quadToBox(polygon) : null;
    const dup = out.some(
      (o) => titleKey(o) === titleKey({ ...b, title }) && (!bbox || !o.bbox || iou(o.bbox, bbox) > 0.3),
    );
    if (dup) continue;
    out.push({ ...b, title, polygon, bbox });
  }
  return out;
}

/** Bande verticale de la photo envoyée seule au modèle (en pixels de la photo entière). */
export interface Tile {
  left: number;
  width: number;
}

/** Recouvrement entre deux bandes voisines : plus large qu'une tranche, pour qu'aucun livre ne soit coupé partout. */
const TILE_OVERLAP = 0.15;

/**
 * Découpe une photo d'étagère en bandes verticales analysées en parallèle : le modèle écrit sa réponse
 * livre par livre, donc 2 ou 3 bandes vont 2 à 3 fois plus vite qu'une seule grande réponse.
 * Les tranches étant surtout verticales, une coupe verticale avec recouvrement les garde entières dans une bande.
 */
export function tileLayout(width: number, height: number): Tile[] {
  const n = width < 1200 ? 1 : width / height > 1.6 ? 3 : 2;
  if (n === 1) return [{ left: 0, width }];
  const overlap = Math.round(width * TILE_OVERLAP);
  const w = Math.ceil((width + overlap * (n - 1)) / n);
  return Array.from({ length: n }, (_, i) => {
    const left = Math.min(i * (w - overlap), width - w);
    return { left, width: w };
  });
}

/**
 * Rassemble les livres des différentes bandes. Un livre vu dans le recouvrement de deux bandes n'est gardé qu'une fois
 * (celui dont la forme est la plus grande, donc la moins coupée), puis tout est remis dans l'ordre de lecture :
 * étagère par étagère, de gauche à droite.
 */
export function mergeTiles(perTile: CleanDetection[][]): CleanDetection[] {
  const all = perTile.flatMap((books, tile) => books.map((b) => ({ b, tile })));
  const area = (b: CleanDetection) => (b.bbox ? b.bbox.w * b.bbox.h : 0);
  const kept: { b: CleanDetection; tile: number }[] = [];
  for (const x of [...all].sort((p, q) => area(q.b) - area(p.b))) {
    const dup = kept.some(
      (k) =>
        k.tile !== x.tile &&
        k.b.bbox &&
        x.b.bbox &&
        overlapOfSmaller(k.b.bbox, x.b.bbox) > 0.6 &&
        // Le rectangle d'un livre penché peut englober son voisin : il faut aussi un mot du titre en commun.
        (iou(k.b.bbox, x.b.bbox) > 0.5 || shareWord(k.b, x.b)),
    );
    if (!dup) kept.push(x);
  }
  return readingOrder(kept.map((k) => k.b));
}

const words = (b: DetectedBook) =>
  new Set(`${b.title} ${b.author ?? ""}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 3));

function shareWord(a: DetectedBook, b: DetectedBook): boolean {
  const wa = words(a);
  return [...words(b)].some((w) => wa.has(w));
}

/** Ordre de lecture : on regroupe les livres par étagère (centres à la même hauteur), puis de gauche à droite. */
export function readingOrder(books: CleanDetection[]): CleanDetection[] {
  const withBox = books.filter((b) => b.bbox);
  const rows: CleanDetection[][] = [];
  for (const b of [...withBox].sort((p, q) => p.bbox!.y + p.bbox!.h / 2 - (q.bbox!.y + q.bbox!.h / 2))) {
    const cy = b.bbox!.y + b.bbox!.h / 2;
    const row = rows.at(-1);
    const ref = row?.[0].bbox;
    if (row && ref && cy >= ref.y && cy <= ref.y + ref.h) row.push(b);
    else rows.push([b]);
  }
  return [...rows.flatMap((r) => r.sort((p, q) => p.bbox!.x - q.bbox!.x)), ...books.filter((b) => !b.bbox)];
}

const LANGUAGE_NAMES: Record<string, string> = {
  fr: "français",
  en: "anglais",
  de: "allemand",
  es: "espagnol",
  it: "italien",
};

const SHELF_PROMPT = (language: string, w: number, h: number) => `Tu analyses la photo d'une ou plusieurs étagères ou piles de livres.
Sois EXHAUSTIF : repère chaque livre dont on peut lire au moins un mot sur la tranche ou la couverture (titre, auteur ou éditeur),
y compris les livres fins, penchés, couchés à plat, sur un meuble voisin ou coupés par le bord de la photo.
Les livres sont majoritairement en ${LANGUAGE_NAMES[language] ?? language}.
L'image fait ${w} × ${h} pixels.

Pour chaque livre :
- "title" : le titre tel que tu le lis (corrige seulement les erreurs évidentes de lecture) ;
- "author", "publisher" : si lisibles, sinon null ;
- "isbn" : uniquement s'il est réellement lisible, sinon null (n'invente jamais d'ISBN) ;
- "corners" : les 4 coins de la tranche (ou de la couverture si le livre est vu de face), tels qu'ils sont sur la photo,
  dans l'ordre haut-gauche, haut-droit, bas-droit, bas-gauche. Coordonnées en pixels (0,0 = coin haut gauche,
  ${w},${h} = coin bas droit de l'image). Si le livre est penché, les coins suivent son inclinaison : la forme n'est pas
  forcément un rectangle droit. Colle aux bords réels de la tranche, sans déborder sur les livres voisins ;
- "text_direction" : sens de lecture du titre sur la photo : "bottom_to_top" (de bas en haut), "top_to_bottom" (de haut
  en bas), "left_to_right" (horizontal, à l'endroit, y compris une étiquette horizontale sur une tranche debout)
  ou "right_to_left" (horizontal mais à l'envers, par exemple un livre couché tête-bêche dans une pile) ;
- "confidence" : "high" si le titre est net, "medium" si partiellement lisible, "low" si tu devines.

Ignore les livres dont aucun texte n'est lisible. Liste-les de gauche à droite, étagère par étagère, de haut en bas.`;

const SINGLE_PROMPT = (w: number, h: number) => `Cette photo montre un seul livre (couverture, dos ou code-barres).
Lis le titre, l'auteur, l'éditeur et l'ISBN s'il est visible (souvent sous le code-barres, commence par 978 ou 979).
Retourne exactement un élément dans "books" (ou aucun si ce n'est pas un livre).
Pour "corners", donne les 4 coins du livre en pixels (l'image fait ${w} × ${h} pixels), ordre haut-gauche, haut-droit, bas-droit, bas-gauche.`;

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!env.anthropicApiKey()) throw new Error("ANTHROPIC_API_KEY n'est pas configurée.");
  // Les bandes partent en parallèle : on laisse le SDK réessayer plus longtemps en cas de limite de débit (429).
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey(), maxRetries: 5 });
  return client;
}

export async function detectBooks(
  jpeg: Buffer,
  opts: { language: string; mode: "shelf" | "single" },
): Promise<CleanDetection[]> {
  const meta = await sharp(jpeg).metadata();
  const size = { width: meta.width ?? 0, height: meta.height ?? 0 };
  if (opts.mode === "single") {
    const books = await callModel(jpeg, SINGLE_PROMPT(size.width, size.height));
    return cleanDetections(books, size);
  }
  const tiles = tileLayout(size.width, size.height);
  const perTile = await Promise.all(
    tiles.map(async (tile) => {
      const image =
        tiles.length === 1
          ? jpeg
          : await sharp(jpeg).extract({ left: tile.left, top: 0, width: tile.width, height: size.height }).jpeg({ quality: 90 }).toBuffer();
      const books = await callModel(image, SHELF_PROMPT(opts.language, tile.width, size.height));
      // Coordonnées de la bande -> coordonnées de la photo entière.
      const shifted = books.map((b) => ({ ...b, corners: b.corners.map((c) => ({ x: c.x + tile.left, y: c.y })) }));
      return cleanDetections(shifted, size);
    }),
  );
  return tiles.length === 1 ? perTile[0] : mergeTiles(perTile);
}

async function callModel(jpeg: Buffer, prompt: string): Promise<DetectedBook[]> {
  // Une étagère pleine peut contenir plus de 100 livres : on laisse de la place à la réponse
  // et on passe en streaming, obligatoire pour les réponses longues.
  const stream = anthropic().messages.stream({
    model: env.anthropicModel(),
    max_tokens: 48000,
    // Effort "high" par défaut : la précision des coins vaut le surcoût. ANTHROPIC_EFFORT=medium va plus vite.
    output_config: { effort: env.anthropicEffort(), format: zodOutputFormat(DetectionResultSchema) },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });
  const response = await stream.finalMessage();

  if (response.stop_reason === "refusal") throw new Error("L'analyse de la photo a été refusée par le modèle.");
  if (response.stop_reason === "max_tokens") {
    throw new Error("Trop de livres sur une seule photo : essaie de photographier moins d'étagères à la fois.");
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Réponse du modèle illisible.");
  return parsed.books;
}
