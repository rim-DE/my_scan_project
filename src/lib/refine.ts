// Recadrage des vignettes des meilleurs livres d'un scan : on renvoie à Gemini un zoom autour du livre
// en lui donnant le titre trouvé. Sur toute l'étagère il place parfois le rectangle sur un voisin ;
// sur un zoom, avec le titre en main, il retrouve la bonne tranche et son sens de lecture.
import sharp from "sharp";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { env } from "./env";
import { getStorage } from "./storage";
import { callGemini, GEMINI_SCALE } from "./vision-gemini";
import { toModelSize } from "./image";
import { boxToQuad, type NormalizedBox } from "./geometry";
import { createLimiter } from "./concurrency";
import { resaleSettings } from "./prices";
import { computeStats } from "./prices/stats";
import { computeMetrics, dropAberrantPrices } from "./prices/metrics";

/** Nombre de livres recadrés par scan : les mieux classés au BiblioRank, ceux que tu regardes vraiment. */
export const REFINE_TOP = 30;
const REFINE_CONCURRENCY = 4;
/** Marge du zoom autour du rectangle, en part de la photo : assez pour retrouver le livre s'il a été placé sur un voisin. */
const MARGIN_X = 0.12;
const MARGIN_Y = 0.08;

const RefineSchema = z.object({
  found: z.boolean().describe("true si la tranche de ce livre est visible sur l'image"),
  box_2d: z.array(z.number().int()).describe("Rectangle de la tranche : [ymin, xmin, ymax, xmax], chaque valeur de 0 à 1000"),
  text_direction: z.enum(["bottom_to_top", "top_to_bottom", "left_to_right", "right_to_left"]),
});

const PROMPT = (title: string, author: string | null) => `Cette image est un zoom sur une étagère ou une pile de livres.
Trouve la tranche (ou la couverture) du livre « ${title} »${author ? ` de ${author}` : ""}. Le texte de la tranche peut être
abrégé, coupé ou écrit verticalement.
- "found" : false si ce livre n'est pas sur l'image.
- "box_2d" : le rectangle de CETTE tranche uniquement, collé à ses bords, sans les livres voisins : [ymin, xmin, ymax, xmax],
  chaque valeur de 0 à ${GEMINI_SCALE} (0 = haut ou gauche de l'image, ${GEMINI_SCALE} = bas ou droite).
- "text_direction" : sens de lecture du titre sur l'image : "bottom_to_top", "top_to_bottom", "left_to_right"
  (horizontal, à l'endroit) ou "right_to_left" (horizontal mais à l'envers).`;

/** Zone du zoom autour d'un rectangle (coordonnées 0-1 de la photo). */
export function zoomArea(b: NormalizedBox): NormalizedBox {
  const x0 = Math.max(0, b.x - MARGIN_X);
  const y0 = Math.max(0, b.y - MARGIN_Y);
  const x1 = Math.min(1, b.x + b.w + MARGIN_X);
  const y1 = Math.min(1, b.y + b.h + MARGIN_Y);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Rectangle Gemini (0-1000 dans le zoom) -> rectangle 0-1 de la photo entière ; null s'il est inutilisable. */
export function zoomBoxToPhoto(box: number[], area: NormalizedBox): NormalizedBox | null {
  if (box.length !== 4) return null;
  const [ya, xa, yb, xb] = box.map((v) => Math.min(GEMINI_SCALE, Math.max(0, v)) / GEMINI_SCALE);
  const [x0, x1, y0, y1] = [Math.min(xa, xb), Math.max(xa, xb), Math.min(ya, yb), Math.max(ya, yb)];
  if (x1 - x0 < 0.005 || y1 - y0 < 0.005) return null;
  return { x: area.x + x0 * area.w, y: area.y + y0 * area.h, w: (x1 - x0) * area.w, h: (y1 - y0) * area.h };
}

/**
 * Recadre les vignettes des REFINE_TOP meilleurs livres du scan qui ne l'ont pas encore été.
 * Chaque livre n'est tenté qu'une fois (refinedAt), même si plusieurs pages lancent le recadrage en même temps.
 */
export async function refineSpines(scanId: string, budgetMs = 120_000): Promise<number> {
  if (env.visionProvider() !== "gemini") return 0;
  const deadline = Date.now() + budgetMs;
  const scan = await prisma.scan.findUniqueOrThrow({ where: { id: scanId }, select: { country: true } });
  const dets = await prisma.detection.findMany({
    where: { scanId, bookId: { not: null }, photoId: { not: null } },
    include: { book: { include: { prices: { where: { country: scan.country } } } }, photo: true },
  });
  const ranked = dets
    .map((d) => {
      const snaps = dropAberrantPrices(d.book!.prices, d.book!.listPriceCents);
      const m = computeMetrics(snaps, computeStats(snaps, resaleSettings()), d.book!);
      return { d, rank: m.biblioRank ?? -1 };
    })
    .filter((x) => x.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, REFINE_TOP)
    .filter((x) => !x.d.refinedAt && x.d.bbox);
  if (ranked.length === 0) return 0;

  const photos = new Map<string, Promise<{ data: Buffer; width: number; height: number }>>();
  const photoOf = (id: string, key: string) => {
    let p = photos.get(id);
    if (!p) {
      p = getStorage()
        .get(key)
        .then(async (data) => {
          const meta = await sharp(data).metadata();
          return { data, width: meta.width ?? 0, height: meta.height ?? 0 };
        });
      photos.set(id, p);
    }
    return p;
  };

  const limit = createLimiter(REFINE_CONCURRENCY);
  const results = await Promise.all(
    ranked.map(({ d }) =>
      limit(async () => {
        if (Date.now() > deadline) return false;
        // On réserve le livre : une autre page qui recadre en même temps le sautera.
        const claim = await prisma.detection.updateMany({ where: { id: d.id, refinedAt: null }, data: { refinedAt: new Date() } });
        if (claim.count === 0) return false;
        try {
          const photo = await photoOf(d.photoId!, d.photo!.storageKey);
          const area = zoomArea(d.bbox as unknown as NormalizedBox);
          const left = Math.round(area.x * photo.width);
          const top = Math.round(area.y * photo.height);
          const width = Math.max(1, Math.min(photo.width - left, Math.round(area.w * photo.width)));
          const height = Math.max(1, Math.min(photo.height - top, Math.round(area.h * photo.height)));
          const crop = await sharp(photo.data).extract({ left, top, width, height }).jpeg({ quality: 90 }).toBuffer();
          const image = await toModelSize(crop, width, height);
          const res = await callGemini(image.data, PROMPT(d.book!.title, d.book!.authors[0] ?? d.rawAuthor), RefineSchema);
          const bbox = res.found ? zoomBoxToPhoto(res.box_2d, { x: left / photo.width, y: top / photo.height, w: width / photo.width, h: height / photo.height }) : null;
          if (!bbox) return false;
          await prisma.detection.update({
            where: { id: d.id },
            data: {
              bbox: bbox as unknown as Prisma.InputJsonObject,
              polygon: boxToQuad(bbox) as unknown as Prisma.InputJsonArray,
              textDirection: res.text_direction,
            },
          });
          return true;
        } catch (e) {
          console.warn("[vignettes] recadrage impossible", d.id, e);
          return false;
        }
      }),
    ),
  );
  return results.filter(Boolean).length;
}
