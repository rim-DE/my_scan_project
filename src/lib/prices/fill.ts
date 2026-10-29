// Récupère en tâche de fond les prix qui manquent dans un scan (ex. jetons Keepa épuisés pendant le scan).
import { prisma } from "../db";
import { CatalogUnavailableError } from "../books";
import { findOrCreateBookByTitle } from "../catalog";
import { enabledProviders, refreshPrices } from ".";
import { needsFetch } from "./status";

/** Au-delà, une récupération est considérée comme interrompue (une fonction Vercel dure 5 min au plus). */
const CLAIM_MS = 6 * 60_000;
/** Pause quand Keepa n'a plus de jetons (il en redonne 20 par minute avec l'abonnement Starter). */
const RATE_LIMIT_PAUSE_MS = 30_000;

/** Nombre de fois qu'un livre non identifié est recherché à nouveau en tâche de fond. */
export const MAX_LOOKUP_TRIES = 4;

/** Livres lus sur la photo mais pas encore trouvés, dont la recherche peut être relancée. */
export function retryableDetections(scanId: string) {
  return prisma.detection.findMany({
    where: { scanId, bookId: null, rawTitle: { not: null }, lookupTries: { lt: MAX_LOOKUP_TRIES } },
    select: { id: true, rawTitle: true, rawAuthor: true },
  });
}

/** Livres non identifiés recherchés en même temps : au-delà, Google Books sature. */
const IDENTIFY_BATCH = 4;

/**
 * Relance la recherche des livres non identifiés : pendant le scan, les jetons Keepa (recherche Amazon) ou un catalogue
 * ont pu manquer, ou le scan les a enregistrés sans les chercher (Google Vision). Un livre vraiment introuvable est mis
 * en cache et ne coûte plus rien ; les autres sont réessayés au plus MAX_LOOKUP_TRIES fois.
 */
async function identifyMissing(scanId: string, language: string, deadline: number): Promise<void> {
  const queue = await retryableDetections(scanId);
  // Une tentative comptée par livre et par passage, même si on attend qu'un catalogue se libère entre-temps.
  const counted = new Set<string>();
  while (queue.length > 0 && Date.now() < deadline) {
    const batch = queue.splice(0, IDENTIFY_BATCH);
    const fresh = batch.filter((d) => !counted.has(d.id)).map((d) => d.id);
    fresh.forEach((id) => counted.add(id));
    if (fresh.length > 0) await prisma.detection.updateMany({ where: { id: { in: fresh } }, data: { lookupTries: { increment: 1 } } });
    const busy = await Promise.all(
      batch.map(async (d) => {
        try {
          const book = await findOrCreateBookByTitle({ title: d.rawTitle!, author: d.rawAuthor, language });
          if (book) await prisma.detection.update({ where: { id: d.id }, data: { bookId: book.id } });
          return false;
        } catch (e) {
          console.warn("[scan] identification impossible", d.rawTitle, e);
          return e instanceof CatalogUnavailableError;
        }
      }),
    );
    // Plus de jetons Keepa (ou catalogue saturé) : on réessaie ces livres quand il y en aura.
    const retry = batch.filter((_, i) => busy[i]);
    if (retry.length > 0) {
      queue.unshift(...retry);
      if (Date.now() + RATE_LIMIT_PAUSE_MS >= deadline) break;
      await new Promise((r) => setTimeout(r, RATE_LIMIT_PAUSE_MS));
    }
  }
}

/** Livres du scan dont une source de prix n'a pas encore répondu, les jamais essayés d'abord. */
export async function booksMissingPrices(scanId: string, country: string): Promise<string[]> {
  const ids = enabledProviders().map((p) => p.id);
  if (ids.length === 0) return [];
  const books = await prisma.book.findMany({
    where: { detections: { some: { scanId } } },
    select: {
      id: true,
      fetches: { where: { country }, select: { provider: true, ok: true, fetchedAt: true } },
      _count: { select: { prices: { where: { country } } } },
    },
  });
  const oldest = (b: (typeof books)[number]) => Math.min(Infinity, ...b.fetches.map((f) => f.fetchedAt.getTime()));
  return books
    .filter((b) => needsFetch(b.fetches, ids, b._count.prices))
    .sort((a, b) => Math.sign(a.fetches.length) - Math.sign(b.fetches.length) || oldest(a) - oldest(b))
    .map((b) => b.id);
}

/**
 * Relance la recherche des livres non identifiés, puis récupère les prix manquants d'un scan, un livre à la fois, en attendant quand Keepa n'a plus de jetons.
 * S'arrête au bout de `budgetMs` ; la page du scan en relance une tant qu'il reste des livres sans prix.
 */
export async function fillMissingPrices(scanId: string, budgetMs = 270_000): Promise<number> {
  const deadline = Date.now() + budgetMs;
  // Une seule récupération à la fois par scan, même si plusieurs pages sont ouvertes.
  const claim = await prisma.scan.updateMany({
    where: { id: scanId, OR: [{ pricesFillAt: null }, { pricesFillAt: { lt: new Date(Date.now() - CLAIM_MS) } }] },
    data: { pricesFillAt: new Date() },
  });
  if (claim.count === 0) return 0;

  let done = 0;
  try {
    const scan = await prisma.scan.findUniqueOrThrow({ where: { id: scanId }, select: { country: true, bookLanguage: true } });
    // D'abord les livres pas encore trouvés (la moitié du temps au plus) : une fois trouvés, leurs prix suivent.
    await identifyMissing(scanId, scan.bookLanguage, Date.now() + budgetMs / 2);
    const queue = await booksMissingPrices(scanId, scan.country);
    while (queue.length > 0 && Date.now() < deadline) {
      const { rateLimited } = await refreshPrices(queue[0], scan.country).catch((e) => {
        console.warn("[prix] récupération", queue[0], e);
        return { rateLimited: false };
      });
      if (rateLimited) {
        // On réessaie le même livre quand Keepa aura redonné des jetons.
        if (Date.now() + RATE_LIMIT_PAUSE_MS >= deadline) break;
        await new Promise((r) => setTimeout(r, RATE_LIMIT_PAUSE_MS));
        continue;
      }
      queue.shift();
      done++;
    }
  } finally {
    await prisma.scan.update({ where: { id: scanId }, data: { pricesFillAt: null } });
  }
  return done;
}
