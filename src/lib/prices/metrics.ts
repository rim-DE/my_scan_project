// Indicateurs "façon BiblioScan" calculés à partir des prix et des ventes connus d'un livre.
import type { PriceStats } from "./stats";
import type { OfferType } from "./types";

export interface SalePoint {
  platform?: string;
  offerType: OfferType;
  priceCents: number;
  observedAt: Date | string;
}

export interface SaleRow {
  priceCents: number;
  soldAt: string;
  platform?: string;
}

export interface BookMetrics {
  /** Nombre de ventes sur 12 mois / 30 jours (source : Keepa si configuré, sinon les ventes enregistrées). */
  sales12m: number | null;
  sales30d: number | null;
  /** Les 5 ventes les plus récentes, de la plus récente à la plus ancienne. */
  lastSales: SaleRow[];
  /** Toutes les ventes des 12 derniers mois (historique), de la plus récente à la plus ancienne. */
  sales: SaleRow[];
  /** Profit net × probabilité de vendre dans les 30 jours (plafonnée à 1). */
  weightedProfit30dCents: number | null;
  /** Prix médian d'occasion ÷ prix éditeur. */
  ratio: number | null;
  /** Offre la moins chère en ce moment (neuf ou occasion) et nombre d'offres. */
  currentPriceCents: number | null;
  currentOfferCount: number;
}

const DAY = 24 * 3600 * 1000;

export function computeMetrics(
  points: SalePoint[],
  stats: PriceStats,
  book: { listPriceCents: number | null; sales12m: number | null; sales30d: number | null },
  now = new Date(),
): BookMetrics {
  const sold = points
    .filter((p) => p.offerType === "SOLD")
    .map((p) => ({ priceCents: p.priceCents, soldAt: new Date(p.observedAt), platform: p.platform }))
    .filter((p) => now.getTime() - p.soldAt.getTime() <= 365 * DAY)
    .sort((a, b) => b.soldAt.getTime() - a.soldAt.getTime());
  const recorded30d = sold.filter((p) => now.getTime() - p.soldAt.getTime() <= 30 * DAY).length;

  // Une source de ventes (Keepa) l'emporte sur nos propres relevés, forcément incomplets.
  const sales12m = book.sales12m ?? (sold.length > 0 ? sold.length : null);
  const sales30d = book.sales30d ?? (sold.length > 0 ? recorded30d : null);

  // Probabilité de vendre dans le mois : ventes mensuelles moyennes, plafonnées à 1.
  const perMonth = sales12m !== null ? sales12m / 12 : null;
  const weightedProfit30dCents =
    stats.netAfterFeesCents !== null && perMonth !== null ? Math.round(stats.netAfterFeesCents * Math.min(1, perMonth)) : null;

  const offers = points.filter((p) => p.offerType === "USED" || p.offerType === "NEW");
  const ratio =
    stats.medianCents !== null && book.listPriceCents ? Math.round((stats.medianCents / book.listPriceCents) * 100) / 100 : null;

  const rows = sold.map((p) => ({ priceCents: p.priceCents, soldAt: p.soldAt.toISOString(), platform: p.platform }));
  return {
    sales12m,
    sales30d,
    lastSales: rows.slice(0, 5),
    sales: rows,
    weightedProfit30dCents,
    ratio,
    currentPriceCents: offers.length ? Math.min(...offers.map((p) => p.priceCents)) : null,
    currentOfferCount: offers.length,
  };
}

/** "il y a 3 j", "2 m", "1 a 4 m" : âge court d'une vente, comme dans BiblioScan. */
export function shortAge(date: Date | string, now = new Date(), locale = "fr"): string {
  const days = Math.max(0, Math.floor((now.getTime() - new Date(date).getTime()) / DAY));
  const [d, m, y] = locale === "en" ? ["d", "mo", "y"] : ["j", "m", "a"];
  if (days < 30) return `${days}${d}`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months}${m}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years}${y} ${rest}${m}` : `${years}${y}`;
}
