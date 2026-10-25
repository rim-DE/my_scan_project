// Keepa (payant, https://keepa.com/#!api) : données Amazon sous licence.
// C'est l'alternative légale au scraping d'Amazon, interdit par ses CGU.
import { env } from "../../env";
import type { PriceObservation, PriceProvider, SalesEstimate } from "../types";

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
  stats?: { current?: number[]; salesRankDrops30?: number; salesRankDrops365?: number };
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
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Keepa HTTP ${res.status}`);
    const json = (await res.json()) as { products?: KeepaProduct[] };
    const products = json.products ?? [];
    return {
      observations: products.flatMap((p) => parseKeepaProduct(p, country)),
      sales: products[0] ? parseKeepaSales(products[0]) : undefined,
    };
  },
};
