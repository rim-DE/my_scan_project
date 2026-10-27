// Récupère en tâche de fond les prix qui manquent dans un scan (ex. jetons Keepa épuisés pendant le scan).
import { prisma } from "../db";
import { enabledProviders, refreshPrices } from ".";
import { needsFetch } from "./status";

/** Au-delà, une récupération est considérée comme interrompue (une fonction Vercel dure 5 min au plus). */
const CLAIM_MS = 6 * 60_000;
/** Pause quand Keepa n'a plus de jetons (il en redonne 20 par minute avec l'abonnement Starter). */
const RATE_LIMIT_PAUSE_MS = 30_000;

/** Livres du scan dont une source de prix n'a pas encore répondu, les jamais essayés d'abord. */
export async function booksMissingPrices(scanId: string, country: string): Promise<string[]> {
  const ids = enabledProviders().map((p) => p.id);
  if (ids.length === 0) return [];
  const books = await prisma.book.findMany({
    where: { detections: { some: { scanId } } },
    select: { id: true, fetches: { where: { country }, select: { provider: true, ok: true, fetchedAt: true } } },
  });
  const oldest = (b: (typeof books)[number]) => Math.min(Infinity, ...b.fetches.map((f) => f.fetchedAt.getTime()));
  return books
    .filter((b) => needsFetch(b.fetches, ids))
    .sort((a, b) => Math.sign(a.fetches.length) - Math.sign(b.fetches.length) || oldest(a) - oldest(b))
    .map((b) => b.id);
}

/**
 * Récupère les prix manquants d'un scan, un livre à la fois, en attendant quand Keepa n'a plus de jetons.
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
    const scan = await prisma.scan.findUniqueOrThrow({ where: { id: scanId }, select: { country: true } });
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
