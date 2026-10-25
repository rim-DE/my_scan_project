// Fournisseur de DÉMONSTRATION : génère des prix FAUX mais stables (calculés à partir de l'ISBN)
// pour tester l'interface sans clé d'API. Activé seulement si PRICE_DEMO_MODE=true.
import { env } from "../../env";
import { PLATFORMS } from "../platforms";
import type { PriceObservation, PriceProvider } from "../types";

function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function demoPrices(isbn13: string, country: string): PriceObservation[] {
  const rnd = seeded(isbn13 + country);
  const base = 300 + Math.floor(rnd() * 2500); // entre 3 € et 28 €
  const out: PriceObservation[] = [];
  for (const p of PLATFORMS) {
    if (p.id === "momox" || p.id === "recyclivre") {
      if (p.id === "momox") out.push({ platform: p.id, offerType: "BUYBACK", priceCents: Math.round(base * (0.08 + rnd() * 0.15)), currency: "EUR", url: p.searchUrl({ isbn13, title: "" }) });
      continue;
    }
    if (rnd() < 0.3) continue;
    out.push({ platform: p.id, offerType: "USED", priceCents: Math.round(base * (0.7 + rnd() * 0.6)), currency: "EUR", url: p.searchUrl({ isbn13, title: "" }) });
    if (p.id === "amazon" || p.id === "fnac") {
      out.push({ platform: p.id, offerType: "NEW", priceCents: Math.round(base * 1.4), currency: "EUR", url: p.searchUrl({ isbn13, title: "" }) });
    }
  }
  return out;
}

export const demoProvider: PriceProvider = {
  id: "demo",
  source: "demo",
  enabled: () => env.priceDemoMode(),
  async fetch(book, country) {
    return demoPrices(book.isbn13, country);
  },
};
