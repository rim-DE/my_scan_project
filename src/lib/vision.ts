// Détection des livres sur une photo avec l'API Claude (vision + sortie JSON structurée).
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "./env";

export const DetectedBookSchema = z.object({
  title: z.string().describe("Titre lu sur la tranche ou la couverture"),
  author: z.string().nullable().describe("Auteur si lisible, sinon null"),
  publisher: z.string().nullable().describe("Éditeur ou collection si lisible, sinon null"),
  isbn: z.string().nullable().describe("ISBN seulement s'il est lisible sur la photo, sinon null"),
  spine_text: z.string().describe("Tout le texte lisible sur la tranche, tel quel"),
  box: z
    .object({
      x0: z.number().int(),
      y0: z.number().int(),
      x1: z.number().int(),
      y1: z.number().int(),
    })
    .describe("Rectangle autour du livre, coordonnées entières de 0 à 1000 relatives à la largeur/hauteur de l'image"),
  confidence: z.enum(["high", "medium", "low"]),
});

export const DetectionResultSchema = z.object({
  books: z.array(DetectedBookSchema),
});

export type DetectedBook = z.infer<typeof DetectedBookSchema>;

export interface NormalizedBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Convertit une boîte 0-1000 (éventuellement inversée ou hors cadre) en boîte normalisée 0-1. */
export function normalizeBox(box: DetectedBook["box"]): NormalizedBox | null {
  const clamp = (v: number) => Math.min(1000, Math.max(0, v));
  const x0 = clamp(Math.min(box.x0, box.x1));
  const x1 = clamp(Math.max(box.x0, box.x1));
  const y0 = clamp(Math.min(box.y0, box.y1));
  const y1 = clamp(Math.max(box.y0, box.y1));
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;
  return { x: x0 / 1000, y: y0 / 1000, w: (x1 - x0) / 1000, h: (y1 - y0) / 1000 };
}

/** Écarte les détections vides et les doublons (même titre normalisé). */
export function cleanDetections(books: DetectedBook[]): DetectedBook[] {
  const seen = new Set<string>();
  const out: DetectedBook[] = [];
  for (const b of books) {
    const title = b.title.trim();
    if (title.length < 2) continue;
    const key = title.toLowerCase().replace(/\s+/g, " ") + "|" + (b.author ?? "").toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...b, title });
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

const SHELF_PROMPT = (language: string) => `Tu analyses la photo d'une étagère ou d'une pile de livres.
Repère CHAQUE livre visible dont on peut lire au moins une partie du titre sur la tranche ou la couverture.
Les livres sont majoritairement en ${LANGUAGE_NAMES[language] ?? language}.

Pour chaque livre :
- "title" : le titre tel que tu le lis (corrige seulement les erreurs évidentes de lecture) ;
- "author", "publisher" : si lisibles, sinon null ;
- "isbn" : uniquement s'il est réellement lisible, sinon null (n'invente jamais d'ISBN) ;
- "spine_text" : tout le texte lisible sur la tranche ;
- "box" : le rectangle qui entoure la tranche/couverture, en coordonnées entières de 0 à 1000 (0,0 = coin haut gauche, 1000,1000 = coin bas droit de l'image) ;
- "confidence" : "high" si le titre est net, "medium" si partiellement lisible, "low" si tu devines.

Ignore les livres dont aucun texte n'est lisible. Liste-les de gauche à droite, étagère par étagère, de haut en bas.`;

const SINGLE_PROMPT = `Cette photo montre un seul livre (couverture, dos ou code-barres).
Lis le titre, l'auteur, l'éditeur et l'ISBN s'il est visible (souvent sous le code-barres, commence par 978 ou 979).
Retourne exactement un élément dans "books" (ou aucun si ce n'est pas un livre). Pour "box", entoure le livre (0 à 1000).`;

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!env.anthropicApiKey()) throw new Error("ANTHROPIC_API_KEY n'est pas configurée.");
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey() });
  return client;
}

export async function detectBooks(
  jpeg: Buffer,
  opts: { language: string; mode: "shelf" | "single" },
): Promise<DetectedBook[]> {
  const response = await anthropic().messages.parse({
    model: env.anthropicModel(),
    max_tokens: 16000,
    output_config: { format: zodOutputFormat(DetectionResultSchema) },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
          { type: "text", text: opts.mode === "shelf" ? SHELF_PROMPT(opts.language) : SINGLE_PROMPT },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("L'analyse de la photo a été refusée par le modèle.");
  if (response.stop_reason === "max_tokens") {
    throw new Error("Trop de livres sur une seule photo : essaie de photographier moins d'étagères à la fois.");
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Réponse du modèle illisible.");
  return cleanDetections(parsed.books);
}
