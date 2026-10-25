// Détection des livres sur une photo avec l'API Claude (vision + sortie JSON structurée).
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "./env";
import { iou, normalizeQuad, quadToBox, type NormalizedBox, type Point } from "./geometry";

export type { NormalizedBox } from "./geometry";

const CornerSchema = z.object({ x: z.number().int(), y: z.number().int() });

export const DetectedBookSchema = z.object({
  title: z.string().describe("Titre lu sur la tranche ou la couverture"),
  author: z.string().nullable().describe("Auteur si lisible, sinon null"),
  publisher: z.string().nullable().describe("Éditeur ou collection si lisible, sinon null"),
  isbn: z.string().nullable().describe("ISBN seulement s'il est lisible sur la photo, sinon null"),
  spine_text: z.string().describe("Tout le texte lisible sur la tranche, tel quel"),
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
- "spine_text" : tout le texte lisible sur la tranche ;
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
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey() });
  return client;
}

export async function detectBooks(
  jpeg: Buffer,
  opts: { language: string; mode: "shelf" | "single" },
): Promise<CleanDetection[]> {
  const meta = await sharp(jpeg).metadata();
  const size = { width: meta.width ?? 0, height: meta.height ?? 0 };
  // Une étagère pleine peut contenir plus de 100 livres : on laisse de la place à la réponse
  // et on passe en streaming, obligatoire pour les réponses longues.
  const stream = anthropic().messages.stream({
    model: env.anthropicModel(),
    max_tokens: 48000,
    // Effort "high" : la précision des coins vaut le surcoût (le défaut de ce modèle est "medium").
    output_config: { effort: "high", format: zodOutputFormat(DetectionResultSchema) },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
          { type: "text", text: opts.mode === "shelf" ? SHELF_PROMPT(opts.language, size.width, size.height) : SINGLE_PROMPT(size.width, size.height) },
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
  return cleanDetections(parsed.books, size);
}
