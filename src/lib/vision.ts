// Détection des livres sur une photo par un modèle de vision (Gemini par défaut, ou Claude), en sortie JSON structurée.
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "./env";
import { callGemini, GEMINI_SCALE } from "./vision-gemini";
import { toModelSize } from "./image";
import { iou, normalizeQuad, overlapOfSmaller, quadToBox, type NormalizedBox, type Point } from "./geometry";

export type { NormalizedBox } from "./geometry";

const CornerSchema = z.object({ x: z.number().int(), y: z.number().int() });

export const DetectedBookSchema = z.object({
  // En premier : le modèle décide de l'étagère avant de lire le titre, ce qui l'oblige à parcourir la photo rangée par rangée.
  shelf: z
    .number()
    .int()
    .describe("Numéro de l'étagère (ou de la pile), compté depuis le haut de la photo : 1 = la plus haute"),
  title: z.string().describe("Titre lu sur la tranche ou la couverture"),
  author: z.string().nullable().describe("Auteur si lisible, sinon null"),
  publisher: z.string().nullable().describe("Éditeur ou collection si lisible, sinon null"),
  isbn: z.string().nullable().describe("ISBN seulement s'il est lisible sur la photo, sinon null"),
  corners: z
    .array(CornerSchema)
    .describe(
      "Les 4 coins de la tranche (ou de la couverture) tels qu'ils apparaissent sur la photo, en suivant l'inclinaison du livre, dans le repère de coordonnées indiqué par la consigne",
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

/**
 * Repère des coordonnées demandé au modèle. Claude donne des pixels ; Gemini est entraîné à donner des positions
 * ramenées de 0 à 1000 sur chaque axe, quelle que soit la taille de l'image : il y est bien plus précis.
 */
interface Frame {
  w: number;
  h: number;
  normalized: boolean;
}

const frameLines = (f: Frame) =>
  f.normalized
    ? {
        size: `Les coordonnées sont normalisées de 0 à ${f.w} sur chaque axe, quelle que soit la taille réelle de l'image.`,
        coords: `Coordonnées normalisées (0,0 = coin haut gauche, ${f.w},${f.h} = coin bas droit de l'image)`,
      }
    : {
        size: `L'image fait ${f.w} × ${f.h} pixels.`,
        coords: `Coordonnées en pixels (0,0 = coin haut gauche, ${f.w},${f.h} = coin bas droit de l'image)`,
      };

const SHELF_PROMPT = (language: string, f: Frame) => `Tu analyses la photo d'une ou plusieurs étagères ou piles de livres.
Sois EXHAUSTIF : repère chaque livre dont on peut lire au moins un mot sur la tranche ou la couverture (titre, auteur ou éditeur),
y compris les livres fins, penchés, couchés à plat, sur un meuble voisin ou coupés par le bord de la photo.

Méthode, à suivre dans l'ordre, sans sauter d'étape :
1. Repère d'abord toutes les étagères (ou piles) de la photo et numérote-les de haut en bas : 1 = la plus haute.
2. Prends l'étagère 1 et parcours-la de gauche à droite, tranche après tranche, sans en sauter aucune :
   chaque tranche dont un mot est lisible devient un livre de la liste, dans cet ordre.
3. Quand tu arrives au bout à droite, passe à l'étagère suivante (2, puis 3…) et recommence à gauche.
4. Une pile de livres couchés se lit de haut en bas, livre par livre.
5. À la fin, reprends chaque étagère et vérifie qu'aucune tranche lisible n'a été oubliée, surtout les tranches fines
   et celles collées à une tranche de même couleur ; ajoute celles qui manquent à leur place.
Deux tranches voisines de la même couleur sont deux livres distincts : sépare-les dès que le texte, la police, l'éditeur
ou le sens de lecture change, et ne réunis jamais deux livres dans une même forme.
Les livres sont majoritairement en ${LANGUAGE_NAMES[language] ?? language}.
${frameLines(f).size}

Pour chaque livre :
- "title" : le titre complet tel que tu le lis, y compris les petits mots écrits au-dessus ou à côté du mot principal
  (« Le Grand Larousse de la grossesse », pas seulement « Grossesse ») ; corrige seulement les erreurs évidentes de lecture.
  Si un mot est coupé par le bord de la photo ou caché par un autre livre, complète-le seulement si tu reconnais le titre
  avec certitude (« …mbous rustiques » → « Bambous rustiques ») ; sinon laisse-le tel quel ;
- "author", "publisher" : si lisibles, sinon null ; regarde bien les petits caractères de la tranche, l'auteur y est souvent
  écrit plus petit que le titre ;
- "isbn" : uniquement s'il est réellement lisible, sinon null (n'invente jamais d'ISBN) ;
- "corners" : les 4 coins de la tranche (ou de la couverture si le livre est vu de face), tels qu'ils sont sur la photo,
  dans l'ordre haut-gauche, haut-droit, bas-droit, bas-gauche. ${frameLines(f).coords}. Si le livre est penché, les coins suivent son inclinaison : la forme n'est pas
  forcément un rectangle droit. Colle aux bords réels de la tranche, sans déborder sur les livres voisins ;
- "text_direction" : sens de lecture du titre sur la photo : "bottom_to_top" (de bas en haut), "top_to_bottom" (de haut
  en bas), "left_to_right" (horizontal, à l'endroit, y compris une étiquette horizontale sur une tranche debout)
  ou "right_to_left" (horizontal mais à l'envers, par exemple un livre couché tête-bêche dans une pile) ;
- "confidence" : "high" si le titre est net, "medium" si partiellement lisible, "low" si tu devines.

- "shelf" : le numéro de l'étagère où se trouve le livre (étape 1).

Ignore les livres dont aucun texte n'est lisible. La liste suit l'ordre de la méthode : étagère 1 de gauche à droite,
puis étagère 2 de gauche à droite, et ainsi de suite jusqu'en bas.`;

const SINGLE_PROMPT = (f: Frame) => `Cette photo montre un seul livre (couverture, dos ou code-barres).
Lis le titre, l'auteur, l'éditeur et l'ISBN s'il est visible (souvent sous le code-barres, commence par 978 ou 979).
Retourne exactement un élément dans "books" (ou aucun si ce n'est pas un livre), avec "shelf" = 1.
Pour "corners", donne les 4 coins du livre, ordre haut-gauche, haut-droit, bas-droit, bas-gauche. ${frameLines(f).coords}.`;

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
    // La photo gardée est plus grande que ce que lit le modèle : on la réduit (coordonnées dans l'image réduite).
    const small = await toModelSize(jpeg, size.width, size.height);
    const books = await callModel(small, (f) => SINGLE_PROMPT(f));
    return cleanDetections(books, small);
  }
  const tiles = tileLayout(size.width, size.height);
  const perTile = await Promise.all(
    tiles.map(async (tile) => {
      const crop =
        tiles.length === 1
          ? jpeg
          : await sharp(jpeg).extract({ left: tile.left, top: 0, width: tile.width, height: size.height }).jpeg({ quality: 90 }).toBuffer();
      // Chaque bande est réduite à la taille maximale lue par le modèle.
      const image = await toModelSize(crop, tile.width, size.height);
      const books = await callModel(image, (f) => SHELF_PROMPT(opts.language, f));
      // Coordonnées de la bande réduite -> coordonnées de la photo entière.
      const sx = tile.width / image.width;
      const sy = size.height / image.height;
      const shifted = books.map((b) => ({ ...b, corners: b.corners.map((c) => ({ x: c.x * sx + tile.left, y: c.y * sy })) }));
      return cleanDetections(shifted, size);
    }),
  );
  return tiles.length === 1 ? perTile[0] : mergeTiles(perTile);
}

/**
 * Envoie l'image au fournisseur choisi (VISION_PROVIDER) et renvoie les livres avec leurs coins en pixels de cette image.
 */
async function callModel(
  image: { data: Buffer; width: number; height: number },
  prompt: (f: Frame) => string,
): Promise<DetectedBook[]> {
  if (env.visionProvider() === "claude") {
    return callClaude(image.data, prompt({ w: image.width, h: image.height, normalized: false }));
  }
  const { books } = await callGemini(
    image.data,
    prompt({ w: GEMINI_SCALE, h: GEMINI_SCALE, normalized: true }),
    DetectionResultSchema,
  );
  // Repère 0-1000 -> pixels de l'image envoyée.
  const sx = image.width / GEMINI_SCALE;
  const sy = image.height / GEMINI_SCALE;
  return books.map((b) => ({ ...b, corners: b.corners.map((c) => ({ x: Math.round(c.x * sx), y: Math.round(c.y * sy) })) }));
}

async function callClaude(jpeg: Buffer, prompt: string): Promise<DetectedBook[]> {
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
