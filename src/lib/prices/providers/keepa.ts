// Keepa (payant, https://keepa.com/#!api) : données Amazon sous licence.
// C'est l'alternative légale au scraping d'Amazon, interdit par ses CGU.
import { env } from "../../env";
import type { BookInfo, PriceObservation, PriceProvider, SalesEstimate } from "../types";

// Identifiants de marketplace Amazon chez Keepa.
const DOMAINS: Record<string, { id: number; currency: string; host: string }> = {
  US: { id: 1, currency: "USD", host: "amazon.com" },
  GB: { id: 2, currency: "GBP", host: "amazon.co.uk" },
  DE: { id: 3, currency: "EUR", host: "amazon.de" },
  FR: { id: 4, currency: "EUR", host: "amazon.fr" },
  JP: { id: 5, currency: "JPY", host: "amazon.co.jp" },
  CA: { id: 6, currency: "CAD", host: "amazon.ca" },
  IT: { id: 8, currency: "EUR", host: "amazon.it" },
  ES: { id: 9, currency: "EUR", host: "amazon.es" },
};

interface KeepaProduct {
  asin?: string;
  /** Historiques : csv[type] = [temps Keepa, valeur, temps Keepa, valeur, …]. */
  csv?: (number[] | null)[];
  stats?: { current?: number[]; salesRankDrops30?: number; salesRankDrops365?: number };
}

// Index des séries Keepa (dans "csv" et "stats.current").
const AMAZON = 0;
const NEW = 1;
const USED = 2;
const SALES_RANK = 3;
const LIST_PRICE = 4;
const COUNT_NEW = 11;
const COUNT_USED = 12;
const RATING = 16;
const COUNT_REVIEWS = 17;

/** Keepa compte le temps en minutes depuis le 1er janvier 2011. */
export function keepaTimeToDate(t: number): Date {
  return new Date((t + 21564000) * 60000);
}

const pos = (n: number | undefined) => (typeof n === "number" && n > 0 ? n : null);

/** Infos de la fiche Amazon : nombre d'offres, classement, note, prix éditeur. */
export function parseKeepaInfo(p: KeepaProduct): BookInfo {
  const cur = p.stats?.current ?? [];
  const offers = [cur[COUNT_NEW], cur[COUNT_USED]].filter((n): n is number => typeof n === "number" && n >= 0);
  const rating = pos(cur[RATING]);
  return {
    offerCount: offers.length ? offers.reduce((a, b) => a + b, 0) : null,
    salesRank: pos(cur[SALES_RANK]),
    // Keepa stocke la note sur 50 (45 = 4,5 étoiles).
    rating: rating !== null ? rating / 10 : null,
    reviewCount: typeof cur[COUNT_REVIEWS] === "number" && cur[COUNT_REVIEWS] >= 0 ? cur[COUNT_REVIEWS] : null,
    listPriceCents: pos(cur[LIST_PRICE]),
  };
}

/** Valeur d'une série Keepa à un instant donné (dernier point connu avant cet instant). */
function valueAt(series: number[] | null | undefined, t: number): number | null {
  if (!series) return null;
  let v: number | null = null;
  for (let i = 0; i + 1 < series.length && series[i] <= t; i += 2) v = series[i + 1];
  return v;
}

/**
 * Ventes Amazon déduites de l'historique : quand le classement des ventes s'améliore, un exemplaire
 * vient d'être vendu. Le prix retenu est l'offre la moins chère à ce moment-là.
 * On garde toutes les ventes des 12 derniers mois, et au moins les 5 dernières même plus anciennes
 * (comme BiblioScan, qui montre « vendu il y a 5a 2m » quand il n'y a rien de récent).
 */
const MIN_LAST_SALES = 5;

export function parseKeepaSaleHistory(p: KeepaProduct, country: string, now = new Date()): PriceObservation[] {
  const d = DOMAINS[country] ?? DOMAINS.FR;
  const rank = p.csv?.[SALES_RANK];
  if (!rank) return [];
  const url = p.asin ? `https://www.${d.host}/dp/${p.asin}` : null;
  const since = now.getTime() - 365 * 24 * 3600 * 1000;
  const out: PriceObservation[] = [];
  // Du plus récent au plus ancien, pour s'arrêter dès qu'on a l'année et au moins 5 ventes.
  for (let i = rank.length - 2; i >= 2; i -= 2) {
    const [prev, t, r] = [rank[i - 1], rank[i], rank[i + 1]];
    if (!(prev > 0 && r > 0 && r < prev)) continue;
    const soldAt = keepaTimeToDate(t);
    if (soldAt.getTime() < since && out.length >= MIN_LAST_SALES) break;
    const prices = [AMAZON, NEW, USED].map((k) => valueAt(p.csv?.[k], t)).filter((v): v is number => v !== null && v > 0);
    if (!prices.length) continue;
    out.push({ platform: "amazon", offerType: "SOLD", priceCents: Math.min(...prices), currency: d.currency, url, observedAt: soldAt });
  }
  return out.reverse();
}

/**
 * Keepa compte les baisses du classement des ventes Amazon : chaque baisse correspond à peu près à une vente.
 * C'est l'estimation de ventes la plus fiable disponible légalement. -1 = inconnu.
 */
export function parseKeepaSales(p: KeepaProduct): SalesEstimate {
  const v = (n: number | undefined) => (typeof n === "number" && n >= 0 ? n : null);
  return { sales30d: v(p.stats?.salesRankDrops30), sales12m: v(p.stats?.salesRankDrops365) };
}

/** Dans "stats.current" : index 0 = vendu par Amazon, 1 = neuf (tiers), 2 = occasion. -1 = pas d'offre. */
export function parseKeepaProduct(p: KeepaProduct, country: string): PriceObservation[] {
  const d = DOMAINS[country] ?? DOMAINS.FR;
  const cur = p.stats?.current ?? [];
  const url = p.asin ? `https://www.${d.host}/dp/${p.asin}` : null;
  const out: PriceObservation[] = [];
  const add = (idx: number, offerType: "NEW" | "USED") => {
    const v = cur[idx];
    if (typeof v === "number" && v > 0) {
      out.push({ platform: "amazon", offerType, priceCents: v, currency: d.currency, url });
    }
  };
  add(0, "NEW");
  add(1, "NEW");
  add(2, "USED");
  return out;
}

export const keepaProvider: PriceProvider = {
  id: "keepa",
  source: "api",
  enabled: () => Boolean(env.keepaApiKey()),
  async fetch(book, country) {
    const d = DOMAINS[country] ?? DOMAINS.FR;
    const url = new URL("https://api.keepa.com/product");
    url.searchParams.set("key", env.keepaApiKey()!);
    url.searchParams.set("domain", String(d.id));
    url.searchParams.set("code", book.isbn13);
    url.searchParams.set("stats", "90");
    // Note et nombre d'avis (coûte au plus 1 jeton de plus).
    url.searchParams.set("rating", "1");
    let res = await fetch(url);
    // 429 = plus de jetons : Keepa indique dans combien de temps il en redonne. On attend une fois (15 s max).
    if (res.status === 429) {
      const { refillIn } = (await res.json().catch(() => ({}))) as { refillIn?: number };
      await new Promise((r) => setTimeout(r, Math.min(Math.max(refillIn ?? 5000, 1000), 15000)));
      res = await fetch(url);
    }
    if (!res.ok) throw new Error(`Keepa HTTP ${res.status}`);
    const json = (await res.json()) as { products?: KeepaProduct[] };
    const p = json.products?.[0];
    if (!p) return { observations: [] };
    return {
      observations: [...parseKeepaProduct(p, country), ...parseKeepaSaleHistory(p, country)],
      sales: parseKeepaSales(p),
      info: parseKeepaInfo(p),
    };
  },
};
