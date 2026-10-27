// Point d'entrée des prix : interroge les sources configurées, avec un cache en base.
import { prisma } from "../db";
import { env } from "../env";
import { demoProvider } from "./providers/demo";
import { ebayProvider } from "./providers/ebay";
import { keepaProvider } from "./providers/keepa";
import { computeStats, isFresh, type PriceStats } from "./stats";
import type { BookRef, PriceProvider } from "./types";

export const PROVIDERS: PriceProvider[] = [ebayProvider, keepaProvider, demoProvider];

export function enabledProviders(): PriceProvider[] {
  return PROVIDERS.filter((p) => p.enabled());
}

export function resaleSettings() {
  return { feeRate: env.resaleFeeRate(), fixedCostCents: env.resaleFixedCostCents(), targetRoi: env.targetRoi() };
}

/**
 * Met à jour les prix d'un livre. Une source déjà interrogée depuis moins de PRICE_CACHE_TTL_HOURS
 * n'est pas rappelée (sauf force=true) : c'est ce qui limite les coûts et les quotas.
 */
export async function refreshPrices(bookId: string, country: string, opts: { force?: boolean } = {}): Promise<void> {
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book?.isbn13) return;
  const ref: BookRef = { isbn13: book.isbn13, isbn10: book.isbn10, title: book.title, authors: book.authors };
  const ttl = env.priceCacheTtlHours();

  for (const provider of enabledProviders()) {
    const last = await prisma.priceFetch.findUnique({
      where: { bookId_provider_country: { bookId, provider: provider.id, country } },
    });
    // Un appel raté (quota épuisé…) est retenté à la prochaine occasion, sans attendre la fin du cache.
    if (!opts.force && last?.ok && isFresh(last.fetchedAt, ttl)) continue;

    try {
      const { observations, sales, info } = await provider.fetch(ref, country);
      await prisma.$transaction([
        // On remplace les anciennes données de cette source (les prix saisis à la main sont conservés).
        prisma.priceSnapshot.deleteMany({ where: { bookId, country, source: provider.source, platform: { in: platformsOf(provider.id) } } }),
        prisma.priceSnapshot.createMany({
          data: observations.map((o) => ({
            bookId,
            country,
            platform: o.platform,
            offerType: o.offerType,
            condition: o.condition ?? null,
            priceCents: o.priceCents,
            currency: o.currency,
            url: o.url ?? null,
            source: provider.source,
            observedAt: o.observedAt,
          })),
        }),
        ...(sales || info
          ? [
              prisma.book.update({
                where: { id: bookId },
                data: {
                  ...(sales && { sales30d: sales.sales30d, sales12m: sales.sales12m }),
                  ...(info && {
                    offerCount: info.offerCount,
                    salesRank: info.salesRank,
                    rating: info.rating,
                    reviewCount: info.reviewCount,
                    // Le prix éditeur de Google Books reste prioritaire.
                    ...(book.listPriceCents === null && info.listPriceCents !== null && { listPriceCents: info.listPriceCents }),
                    ...(!book.coverUrl && info.coverUrl && { coverUrl: info.coverUrl }),
                  }),
                },
              }),
            ]
          : []),
        prisma.priceFetch.upsert({
          where: { bookId_provider_country: { bookId, provider: provider.id, country } },
          create: { bookId, provider: provider.id, country, ok: true },
          update: { fetchedAt: new Date(), ok: true, error: null },
        }),
      ]);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`[prices] ${provider.id} a échoué pour ${book.isbn13}: ${message}`);
      await prisma.priceFetch.upsert({
        where: { bookId_provider_country: { bookId, provider: provider.id, country } },
        create: { bookId, provider: provider.id, country, ok: false, error: message },
        update: { fetchedAt: new Date(), ok: false, error: message },
      });
    }
  }
}

/** Plateformes alimentées par chaque source (pour savoir quelles lignes remplacer). */
function platformsOf(providerId: string): string[] {
  switch (providerId) {
    case "ebay":
      return ["ebay"];
    case "keepa":
      return ["amazon"];
    default:
      return ["amazon", "fnac", "rakuten", "leboncoin", "vinted", "momox", "recyclivre", "abebooks", "ebay"];
  }
}

export async function getStats(bookId: string, country: string): Promise<PriceStats> {
  const snaps = await prisma.priceSnapshot.findMany({ where: { bookId, country } });
  return computeStats(snaps, resaleSettings());
}
