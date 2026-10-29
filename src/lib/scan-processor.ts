// Traitement asynchrone d'un scan : détection -> identification -> prix.
// La "file d'attente" est la table Scan elle-même (statut PENDING), ce qui évite un service en plus.
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getStorage } from "./storage";
import { detectBooks, type CleanDetection } from "./vision";
import { findOrCreateBookByIsbn, findOrCreateBookByTitle } from "./catalog";
import { refreshPrices } from "./prices";
import { fillMissingPrices } from "./prices/fill";
import { refineSpines } from "./refine";
import { createLimiter, mapLimit } from "./concurrency";
import { env } from "./env";

const STALE_PROCESSING_MS = 15 * 60 * 1000;
/** Livres identifiés en même temps, toutes photos confondues (Google Books / BnF réessaient s'ils saturent). */
const IDENTIFY_CONCURRENCY = 8;
/** Une fonction Vercel dure 300 s au plus : on garde de la marge avant d'enchaîner sur les prix. */
const FUNCTION_BUDGET_MS = 280_000;

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
  const started = Date.now();
  const scan = await prisma.scan.findUniqueOrThrow({ where: { id: scanId }, include: { photos: { orderBy: { position: "asc" } } } });

  try {
    if (scan.kind === "PHOTO") {
      // On repart de zéro si le scan est relancé.
      await prisma.detection.deleteMany({ where: { scanId } });
      // Les photos sont analysées 2 par 2. Chaque livre est identifié dès que sa bande est lue, sans attendre
      // le reste de la photo ; les prix viennent après, pour que le scan se termine plus vite.
      const limit = createLimiter(IDENTIFY_CONCURRENCY);
      // Ne lève jamais d'erreur : une identification lancée tôt ne doit pas faire planter le scan avant d'être attendue.
      const identify = (d: CleanDetection) =>
        limit(async () => {
          try {
            const book = d.isbn ? await findOrCreateBookByIsbn(d.isbn) : null;
            return book ?? (await findOrCreateBookByTitle({ title: d.title, author: d.author, publisher: d.publisher, language: scan.bookLanguage }));
          } catch (e) {
            console.warn("[scan] identification impossible", d.title, e);
            return null;
          }
        });
      // Google Vision lit toute la photo d'un coup (souvent plus de 100 livres) : tout identifier avant d'enregistrer
      // dépasserait les 5 minutes d'une fonction Vercel. On enregistre donc les livres tout de suite, et ils sont
      // identifiés ensuite par paquets (fillMissingPrices, relancé par la page du scan et par le cron).
      const identifyNow = env.visionProvider() !== "google-vision";
      await mapLimit(scan.photos, 2, async (photo) => {
        const jpeg = await getStorage().get(photo.storageKey);
        const early = new Map<CleanDetection, ReturnType<typeof identify>>();
        const detected = await detectBooks(jpeg, {
          language: scan.bookLanguage,
          mode: "shelf",
          onSure: identifyNow ? (books) => books.forEach((d) => early.set(d, identify(d))) : undefined,
        });
        // Les livres vus dans le recouvrement de deux bandes ne sont identifiés qu'une fois les doublons retirés.
        const books = detected.map((d) => (identifyNow ? (early.get(d) ?? identify(d)) : Promise.resolve(null)));
        // Enregistrés dans l'ordre de lecture, au fur et à mesure : la page les affiche pendant que les suivants s'identifient.
        for (const [i, d] of detected.entries()) {
          const book = await books[i];
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
        }
      });
    } else {
      // Scan par code-barres : la détection existe déjà, on rafraîchit les prix.
      const dets = await prisma.detection.findMany({ where: { scanId, bookId: { not: null } } });
      for (const d of dets) await refreshPrices(d.bookId!, scan.country);
    }

    await prisma.scan.update({ where: { id: scanId }, data: { status: "DONE", finishedAt: new Date() } });
    // Les livres sont visibles : on récupère maintenant leurs prix avec le temps qui reste à la fonction.
    // Ce qui n'est pas fini sera repris quand la page du scan est ouverte (ou par le cron).
    if (scan.kind === "PHOTO") {
      const budget = FUNCTION_BUDGET_MS - (Date.now() - started);
      if (budget > 10_000) await fillMissingPrices(scanId, budget).catch((e) => console.warn("[scan] prix", e));
      // Puis les vignettes des meilleurs livres (il faut leurs prix pour savoir lesquels) ; sinon la page le fera.
      const left = FUNCTION_BUDGET_MS - (Date.now() - started);
      if (left > 20_000) await refineSpines(scanId, left).catch((e) => console.warn("[scan] vignettes", e));
    }
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
