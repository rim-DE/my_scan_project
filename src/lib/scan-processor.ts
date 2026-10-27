// Traitement asynchrone d'un scan : détection -> identification -> prix.
// La "file d'attente" est la table Scan elle-même (statut PENDING), ce qui évite un service en plus.
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getStorage } from "./storage";
import { detectBooks } from "./vision";
import { findOrCreateBookByIsbn, findOrCreateBookByTitle } from "./catalog";
import { refreshPrices } from "./prices";
import { mapLimit } from "./concurrency";

const STALE_PROCESSING_MS = 15 * 60 * 1000;

/** Réserve le scan (PENDING -> PROCESSING) de façon atomique : un seul traitement à la fois. */
async function claim(scanId: string): Promise<boolean> {
  const res = await prisma.scan.updateMany({
    where: {
      id: scanId,
      OR: [{ status: "PENDING" }, { status: "PROCESSING", startedAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) } }],
    },
    data: { status: "PROCESSING", startedAt: new Date(), error: null },
  });
  return res.count === 1;
}

export async function processScan(scanId: string): Promise<void> {
  if (!(await claim(scanId))) return;
  const scan = await prisma.scan.findUniqueOrThrow({ where: { id: scanId }, include: { photos: { orderBy: { position: "asc" } } } });

  try {
    if (scan.kind === "PHOTO") {
      // On repart de zéro si le scan est relancé.
      await prisma.detection.deleteMany({ where: { scanId } });
      // Les photos sont analysées 2 par 2, et les livres identifiés 4 à la fois (au-delà, Google Books sature).
      await mapLimit(scan.photos, 2, async (photo) => {
        const jpeg = await getStorage().get(photo.storageKey);
        const detected = await detectBooks(jpeg, { language: scan.bookLanguage, mode: "shelf" });

        await mapLimit(detected, 4, async (d) => {
          let book = d.isbn ? await findOrCreateBookByIsbn(d.isbn) : null;
          if (!book) {
            book = await findOrCreateBookByTitle({ title: d.title, author: d.author, publisher: d.publisher, language: scan.bookLanguage }).catch((e) => {
              console.warn("[scan] identification impossible", d.title, e);
              return null;
            });
          }
          if (book) await refreshPrices(book.id, scan.country).catch((e) => console.warn("[scan] prix", e));
          await prisma.detection.create({
            data: {
              scanId,
              photoId: photo.id,
              bookId: book?.id ?? null,
              rawTitle: d.title,
              rawAuthor: d.author,
              bbox: (d.bbox as unknown as Prisma.InputJsonObject) ?? undefined,
              polygon: (d.polygon as unknown as Prisma.InputJsonArray) ?? undefined,
              textDirection: d.text_direction,
              confidence: d.confidence,
            },
          });
        });
      });
    } else {
      // Scan par code-barres : la détection existe déjà, on rafraîchit les prix.
      const dets = await prisma.detection.findMany({ where: { scanId, bookId: { not: null } } });
      for (const d of dets) await refreshPrices(d.bookId!, scan.country);
    }

    await prisma.scan.update({ where: { id: scanId }, data: { status: "DONE", finishedAt: new Date() } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[scan] ${scanId} en erreur`, e);
    await prisma.scan.update({ where: { id: scanId }, data: { status: "ERROR", error: message, finishedAt: new Date() } });
  }
}

/** Traite les scans en attente (appelé par le worker ou la route cron). */
export async function processPendingScans(limit = 5): Promise<number> {
  const pending = await prisma.scan.findMany({
    where: {
      OR: [{ status: "PENDING" }, { status: "PROCESSING", startedAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) } }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  for (const s of pending) await processScan(s.id);
  return pending.length;
}
