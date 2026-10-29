// Lecture des tranches par Google Cloud Vision (OCR) : 1 000 photos gratuites par mois, puis ~0,15 centime la photo.
// Vision lit les lignes de texte et leur position, mais ne sait pas ce qu'est un livre : on regroupe ici
// les lignes tranche par tranche (même axe, même étagère), puis on en tire titre, auteur et éditeur.
import sharp from "sharp";
import type { DetectedBook } from "./vision";
import { env } from "./env";

type P = { x: number; y: number };

/** Un mot lu par Vision : ses 4 coins dans le sens de lecture (haut-gauche du texte en premier). */
export interface TextPiece {
  text: string;
  vertices: P[];
  confidence: number;
}

interface Piece extends TextPiece {
  /** Le texte se lit le long d'un axe vertical (tranche debout) ou horizontal (livre couché, étiquette). */
  vertical: boolean;
  direction: DetectedBook["text_direction"];
  /** Centre, et hauteur des lettres (épaisseur de la ligne). */
  cx: number;
  cy: number;
  thick: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

function describe(t: TextPiece): Piece {
  const [v0, v1, , v3] = t.vertices;
  const ux = v1.x - v0.x;
  const uy = v1.y - v0.y;
  const vertical = Math.abs(uy) > Math.abs(ux);
  const direction = vertical ? (uy < 0 ? "bottom_to_top" : "top_to_bottom") : ux >= 0 ? "left_to_right" : "right_to_left";
  const xs = t.vertices.map((v) => v.x);
  const ys = t.vertices.map((v) => v.y);
  return {
    ...t,
    vertical,
    direction,
    cx: xs.reduce((s, x) => s + x, 0) / 4,
    cy: ys.reduce((s, y) => s + y, 0) / 4,
    thick: Math.max(1, dist(v0, v3)),
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    y0: Math.min(...ys),
    y1: Math.max(...ys),
  };
}

/** Écart entre deux intervalles (0 s'ils se chevauchent). */
const gap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.max(a0, b0) - Math.min(a1, b1));

/** Deux lignes sont sur la même tranche : même axe, alignées, et proches le long de la tranche. */
function sameSpine(a: Piece, b: Piece): boolean {
  if (a.vertical !== b.vertical) return false;
  const t = Math.max(a.thick, b.thick);
  // Un titre sur deux lignes : lignes voisines (à ~1 hauteur de lettre) dans le même sens. Sinon, même axe.
  const across = a.direction === b.direction ? 1.3 * t : 0.7 * t;
  if (a.vertical) return Math.abs(a.cx - b.cx) < across && gap(a.y0, a.y1, b.y0, b.y1) < 5 * t;
  // Livres couchés : lignes de texte à la même hauteur et proches, comme les mots d'un même titre.
  return Math.abs(a.cy - b.cy) < across && gap(a.x0, a.x1, b.x0, b.x1) < 3 * t;
}

const AUTHOR_LIKE = /^[^\d]{3,40}$/;
const letters = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, "").length;

/** Regroupe les lignes lues en livres (une tranche = un livre). */
export function groupSpines(pieces: TextPiece[]): DetectedBook[] {
  const ps = pieces.filter((p) => p.vertices.length === 4 && letters(p.text) > 0).map(describe);
  // Regroupement par proximité (union-find).
  const parent = ps.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) if (sameSpine(ps[i], ps[j])) parent[find(i)] = find(j);
  const groups = new Map<number, Piece[]>();
  ps.forEach((p, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), p]));

  const books: DetectedBook[] = [];
  for (const g of groups.values()) {
    if (letters(g.map((p) => p.text).join("")) < 3) continue;
    const { vertical, direction: dir0 } = g[0];
    // Position le long de la ligne (sens de lecture) et en travers (d'une ligne à la suivante).
    const along = (p: Piece) => (vertical ? (dir0 === "bottom_to_top" ? -p.cy : p.cy) : dir0 === "right_to_left" ? -p.cx : p.cx);
    const across = (p: Piece) => (vertical ? (dir0 === "bottom_to_top" ? p.cx : -p.cx) : dir0 === "right_to_left" ? -p.cy : p.cy);
    // Les mots en lignes : même position en travers (à une demi-hauteur de lettre près) et même taille de lettres,
    // pour ne pas mélanger un auteur écrit en petit au milieu de la tranche avec le titre écrit en gros.
    const lines: Piece[][] = [];
    const sameSize = (a: Piece, b: Piece) => Math.min(a.thick, b.thick) >= 0.75 * Math.max(a.thick, b.thick);
    for (const p of [...g].sort((a, b) => across(a) - across(b))) {
      const line = lines.find((l) => sameSize(l[0], p) && Math.abs(across(l[0]) - across(p)) < 0.5 * Math.max(l[0].thick, p.thick));
      if (line) line.push(p);
      else lines.push([p]);
    }
    const lineText = (l: Piece[]) => l.sort((a, b) => along(a) - along(b)).map((p) => p.text).join(" ").replace(/\s+([.,;:!?)])/g, "$1").trim();
    const lineThick = (l: Piece[]) => Math.max(...l.map((p) => p.thick));
    const big = Math.max(...lines.map(lineThick));
    // Le titre est écrit en plus gros ; les lignes presque aussi grosses en font partie (titre sur deux lignes).
    const titleLines = lines.filter((l) => lineThick(l) >= 0.75 * big);
    const others = lines.filter((l) => lineThick(l) < 0.75 * big).sort((a, b) => lineThick(b) - lineThick(a));
    const author = others.find((l) => AUTHOR_LIKE.test(lineText(l)));
    const publisher = others.find((l) => l !== author);
    const directions = titleLines.flat().map((p) => p.direction);
    const direction = directions.sort((a, b) => directions.filter((d) => d === b).length - directions.filter((d) => d === a).length)[0];
    // La tranche est plus large que ses lignes de texte : on élargit un peu le rectangle autour du texte.
    const pad = 0.35 * big;
    const x0 = Math.min(...g.map((p) => p.x0)) - pad;
    const x1 = Math.max(...g.map((p) => p.x1)) + pad;
    const y0 = Math.min(...g.map((p) => p.y0)) - pad;
    const y1 = Math.max(...g.map((p) => p.y1)) + pad;
    const conf = g.reduce((s, p) => s + p.confidence, 0) / g.length;
    books.push({
      shelf: 1,
      title: titleLines.map(lineText).join(" "),
      author: author ? lineText(author) : null,
      publisher: publisher ? lineText(publisher) : null,
      isbn: null,
      corners: [
        { x: Math.round(x0), y: Math.round(y0) },
        { x: Math.round(x1), y: Math.round(y0) },
        { x: Math.round(x1), y: Math.round(y1) },
        { x: Math.round(x0), y: Math.round(y1) },
      ],
      text_direction: direction,
      confidence: conf >= 0.9 ? "high" : conf >= 0.7 ? "medium" : "low",
    });
  }
  return books;
}

interface VisionVertex {
  x?: number;
  y?: number;
}
interface VisionResponse {
  responses?: {
    error?: { message?: string };
    fullTextAnnotation?: {
      pages?: {
        blocks?: {
          paragraphs?: {
            confidence?: number;
            boundingBox?: { vertices?: VisionVertex[] };
            words?: { confidence?: number; boundingBox?: { vertices?: VisionVertex[] }; symbols?: { text?: string }[] }[];
          }[];
        }[];
      }[];
    };
  }[];
}

/**
 * Mots lus par Vision, avec leur position. On repart des mots et non des paragraphes de Vision : sur une étagère
 * serrée, Vision met souvent dans un même paragraphe les lignes de plusieurs tranches voisines.
 */
export function parseVisionResponse(json: VisionResponse): TextPiece[] {
  const res = json.responses?.[0];
  if (res?.error) throw new Error(`Google Vision : ${res.error.message ?? "erreur"}`);
  const out: TextPiece[] = [];
  for (const page of res?.fullTextAnnotation?.pages ?? [])
    for (const block of page.blocks ?? [])
      for (const para of block.paragraphs ?? [])
        for (const w of para.words ?? []) {
          const text = (w.symbols ?? []).map((s) => s.text ?? "").join("");
          const vertices = (w.boundingBox?.vertices ?? []).map((v) => ({ x: v.x ?? 0, y: v.y ?? 0 }));
          out.push({ text, vertices, confidence: w.confidence ?? para.confidence ?? 0.8 });
        }
  return out;
}

/** Envoie la photo entière à Vision (une seule unité facturée par photo) et renvoie les livres en pixels de la photo. */
export async function detectWithGoogleVision(jpeg: Buffer, language: string): Promise<DetectedBook[]> {
  const key = env.googleVisionApiKey();
  if (!key) throw new Error("GOOGLE_VISION_API_KEY n'est pas configurée.");
  // Vision refuse les requêtes de plus de 10 Mo (photo en base64 comprise) : même taille, compression un peu plus forte.
  if (jpeg.length > 7_000_000) jpeg = await sharp(jpeg).jpeg({ quality: 75 }).toBuffer();
  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          image: { content: jpeg.toString("base64") },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          imageContext: { languageHints: [language] },
        },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Erreur de Google Vision (${res.status}) : ${detail.slice(0, 300)}`);
  }
  return groupSpines(parseVisionResponse((await res.json()) as VisionResponse));
}
