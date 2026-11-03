// Traitement asynchrone d'un scan : détection -> identification -> prix.
// La "file d'attente" est la table Scan elle-même (statut PENDING), ce qui évite un service en plus.
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getStorage } from "./storage";
import { detectBooks, type CleanDetection } from "./vision";
import { findOrCreateBookByIsbn, findOrCreateBookByTitle, findOrCreateBookFromPepite } from "./catalog";
import { pepiteByTitle, pepiteOf } from "./pepites-file";
import { normalizeIsbn } from "./isbn";
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
/** Temps gardé après les identifications pour passer le scan en « terminé » et commencer les prix. */
const IDENTIFY_MARGIN_MS = 60_000;

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
            // Pépite reconnue par son ISBN ou son titre : livre créé depuis le fichier, sans attendre un catalogue.
            const isbn13 = d.isbn ? normalizeIsbn(d.isbn)?.isbn13 : null;
            const pepite = (isbn13 ? pepiteOf({ isbn13 }) : null) ?? pepiteByTitle(d.title, d.author);
            if (pepite) return await findOrCreateBookFromPepite(pepite);
            // Mode rapide : les autres livres ne sont cherchés dans les catalogues que si rim clique dessus (identifyDetectionAction).
            if (env.pepitesOnly()) return null;
            const book = d.isbn ? await findOrCreateBookByIsbn(d.isbn) : null;
            return book ?? (await findOrCreateBookByTitle({ title: d.title, author: d.author, publisher: d.publisher, language: scan.bookLanguage }));
          } catch (e) {
            console.warn("[scan] identification impossible", d.title, e);
            return null;
          }
        });
      // Google Vision lit toute la photo d'un coup (souvent plus de 100 livres) : on ne lance pas d'identification
      // pendant la lecture, ils sont identifiés ensuite par paquets (fillMissingPrices, relancé par la page du scan et par le cron).
      // Mode rapide : l'identification ne cherche que dans la liste de pépites (en mémoire, instantané), on la fait pour tous.
      const identifyNow = env.visionProvider() !== "google-vision" || env.pepitesOnly();
      // Identifications en cours : chaque livre est enregistré sans attendre la sienne, et complété dès qu'elle arrive.
      // Sinon, un catalogue en panne (Google Books 503, Sudoc injoignable) bloque l'enregistrement jusqu'à la coupure à 300 s.
      const pending: Promise<void>[] = [];
      await mapLimit(scan.photos, 2, async (photo) => {
        const jpeg = await getStorage().get(photo.storageKey);
        const early = new Map<CleanDetection, ReturnType<typeof identify>>();
        const detected = await detectBooks(jpeg, {
          language: scan.bookLanguage,
          mode: "shelf",
          onSure: identifyNow ? (books) => books.forEach((d) => early.set(d, identify(d))) : undefined,
        });
        // Enregistrés dans l'ordre de lecture, tout de suite : la page les affiche pendant qu'ils s'identifient.
        for (const d of detected) {
          const det = await prisma.detection.create({
            data: {
              scanId,
              photoId: photo.id,
              rawTitle: d.title,
              rawAuthor: d.author,
              bbox: (d.bbox as unknown as Prisma.InputJsonObject) ?? undefined,
              polygon: (d.polygon as unknown as Prisma.InputJsonArray) ?? undefined,
              textDirection: d.text_direction,
              confidence: d.confidence,
            },
          });
          if (!identifyNow) continue;
          // Les livres vus dans le recouvrement de deux bandes n'ont pas été identifiés pendant la lecture (doublons à retirer d'abord).
          pending.push(
            (early.get(d) ?? identify(d)).then(async (book) => {
              if (book) await prisma.detection.update({ where: { id: det.id }, data: { bookId: book.id } }).catch(() => undefined);
            }),
          );
        }
      });
      // On attend les identifications tant qu'il reste du temps ; celles qui traînent seront reprises en tâche de fond.
      const left = FUNCTION_BUDGET_MS - IDENTIFY_MARGIN_MS - (Date.now() - started);
      if (pending.length > 0 && left > 0) await Promise.race([Promise.all(pending), new Promise((r) => setTimeout(r, left))]);
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
