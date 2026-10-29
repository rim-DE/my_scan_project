// Indicateurs "façon BiblioScan" calculés à partir des prix et des ventes connus d'un livre.
import { median, type PriceStats } from "./stats";
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
  /** Les 5 ventes les plus récentes, de la plus récente à la plus ancienne (même au-delà de 12 mois). */
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
  /** Gain espéré sur 3 mois : profit net × chance de vendre ton exemplaire (au moins le prix de rachat). */
  expected90dCents: number | null;
  /** Score de 0 à 100 qui classe les livres à acheter en premier (voir biblioRank). */
  biblioRank: number | null;
  /** « Pépite » : livre « intéressant » à la revente selon les critères de BiblioScan (voir isInteresting). */
  banger: boolean;
}

/** Critères BiblioScan d'un livre « intéressant » à la revente. */
export const INTERESTING = { minMedianCents: 3500, minSales12m: 3, minRatio: 1.2, minCurrentOfferCents: 2700 };

/**
 * Livre « intéressant » (BiblioScan) : prix ≥ 35 €, au moins 3 ventes sur 12 mois, ratio ≥ 1,2,
 * et offre actuelle absente ou ≥ 27 € (personne ne le brade en ce moment).
 */
export function isInteresting(x: { medianCents: number | null; sales12m: number | null; ratio: number | null; currentPriceCents: number | null }): boolean {
  return (
    x.medianCents !== null &&
    x.medianCents >= INTERESTING.minMedianCents &&
    (x.sales12m ?? 0) >= INTERESTING.minSales12m &&
    (x.ratio ?? 0) >= INTERESTING.minRatio &&
    (x.currentPriceCents === null || x.currentPriceCents >= INTERESTING.minCurrentOfferCents)
  );
}

/** Échelle du score : un gain espéré de 10 € donne environ 63/100, 20 € environ 86/100. */
const RANK_SCALE_CENTS = 1000;
/** Sans aucune vente sur 12 mois, le score ne dépasse jamais 5, quel que soit le prix. */
const NO_SALE_MAX_RANK = 5;

/** Petit bonus par livre vendu : les petits prix qui partent vite remontent, comme dans le classement de BiblioScan. */
const SALE_BONUS_CENTS = 50;

/**
 * « BiblioRank » maison, calé sur le classement de BiblioScan (ses exports de 62 et 211 livres) :
 * - rythme de vente = moitié ventes sur 6 mois, moitié ventes sur 12 mois (par mois) ;
 * - chance de vendre = 1 − e^(−4 × rythme mensuel) ;
 * - gain espéré = (profit net + 0,50 €) × chance de vendre ;
 * - concurrence : si une offre actuelle est sous la médiane, le gain baisse (× √(offre / médiane)) ;
 * - 0 vente sur 12 mois : score plafonné à 5 (choix de rim, BiblioScan les classe parfois haut) ;
 * - un prix de rachat (Momox…) est un gain sûr : il sert de plancher.
 * Sans nombre de ventes connu (pas de Keepa) ni rachat, pas de score.
 */
export function biblioRank(input: {
  netAfterFeesCents: number | null;
  sales12m: number | null;
  sales6m?: number | null;
  /** Offre la moins chère en ce moment, et prix médian de vente. */
  currentPriceCents?: number | null;
  medianCents?: number | null;
  buybackCents: number | null;
}): { expected90dCents: number | null; biblioRank: number | null } {
  const { netAfterFeesCents: net, sales12m, currentPriceCents: cur, medianCents: med, buybackCents } = input;
  let expected: number | null = null;
  if (net !== null && sales12m !== null) {
    const s6 = Math.min(input.sales6m ?? sales12m / 2, sales12m);
    const pace = 0.5 * (s6 / 6) + 0.5 * (sales12m / 12);
    const chance = 1 - Math.exp(-4 * pace);
    const competition = cur && med && cur < med ? Math.sqrt(cur / med) : 1;
    expected = Math.round((Math.max(0, net) + SALE_BONUS_CENTS) * chance * competition);
  }
  if (buybackCents !== null) expected = Math.max(expected ?? 0, buybackCents);
  if (expected === null) return { expected90dCents: null, biblioRank: null };
  let rank = Math.round(100 * (1 - Math.exp(-expected / RANK_SCALE_CENTS)));
  if (sales12m === 0) rank = Math.min(rank, NO_SALE_MAX_RANK);
  return { expected90dCents: expected, biblioRank: rank };
}

/** Un prix plus de 5 fois au-dessus de la référence est une offre « bouche-trou » (2 034 €…), pas un vrai prix. */
const ABERRANT_FACTOR = 5;

/**
 * Retire les prix aberrants (offres et ventes) : au-delà de 5 × le prix éditeur, ou à défaut
 * 5 × la médiane de tous les prix du livre. Les prix de rachat ne sont jamais retirés.
 */
export function dropAberrantPrices<T extends { offerType: string; priceCents: number }>(points: T[], listPriceCents?: number | null): T[] {
  const priced = points.filter((p) => p.offerType !== "BUYBACK").map((p) => p.priceCents);
  const ref = listPriceCents && listPriceCents > 0 ? listPriceCents : median(priced);
  if (!ref) return points;
  return points.filter((p) => p.offerType === "BUYBACK" || p.priceCents <= ref * ABERRANT_FACTOR);
}

const DAY = 24 * 3600 * 1000;

export function computeMetrics(
  points: SalePoint[],
  stats: PriceStats,
  book: { listPriceCents: number | null; sales12m: number | null; sales30d: number | null; offerCount?: number | null },
  now = new Date(),
): BookMetrics {
  const allSold = points
    .filter((p) => p.offerType === "SOLD")
    .map((p) => ({ priceCents: p.priceCents, soldAt: new Date(p.observedAt), platform: p.platform }))
    .sort((a, b) => b.soldAt.getTime() - a.soldAt.getTime());
  const sold = allSold.filter((p) => now.getTime() - p.soldAt.getTime() <= 365 * DAY);
  const recorded30d = sold.filter((p) => now.getTime() - p.soldAt.getTime() <= 30 * DAY).length;

  // Une source de ventes (Keepa) l'emporte sur nos propres relevés, forcément incomplets.
  const sales12m = book.sales12m ?? (sold.length > 0 ? sold.length : null);
  const sales30d = book.sales30d ?? (sold.length > 0 ? recorded30d : null);

  // Probabilité de vendre dans le mois = ventes par mois, plafonnées à 1. Comme BiblioScan (vérifié sur
  // ses exports), on prend le rythme des 5 dernières ventes : leur nombre divisé par le nombre de mois
  // depuis la plus ancienne (5 ventes en 2 ans ≈ 0,2 par mois). Sans historique, les ventes sur 12 mois.
  const last5 = allSold.slice(0, 5);
  const pace = last5.length > 0 ? last5.length / Math.max(1, (now.getTime() - last5[last5.length - 1].soldAt.getTime()) / (30.44 * DAY)) : null;
  const perMonth = pace ?? (sales12m !== null ? sales12m / 12 : null);
  const weightedProfit30dCents =
    stats.netAfterFeesCents !== null && perMonth !== null ? Math.round(stats.netAfterFeesCents * Math.min(1, perMonth)) : null;

  const offers = points.filter((p) => p.offerType === "USED" || p.offerType === "NEW");
  const ratio =
    stats.medianCents !== null && book.listPriceCents ? Math.round((stats.medianCents / book.listPriceCents) * 100) / 100 : null;

  const currentOfferCount = book.offerCount ?? offers.length;
  const sales6m = sold.filter((p) => now.getTime() - p.soldAt.getTime() <= 182 * DAY).length;
  const currentPriceCents = offers.length ? Math.min(...offers.map((p) => p.priceCents)) : null;
  const rank = biblioRank({
    netAfterFeesCents: stats.netAfterFeesCents,
    sales12m,
    sales6m: sales12m !== null ? Math.min(sales6m, sales12m) : null,
    currentPriceCents,
    medianCents: stats.medianCents,
    buybackCents: stats.buybackMaxCents,
  });

  const toRow = (p: (typeof allSold)[number]) => ({ priceCents: p.priceCents, soldAt: p.soldAt.toISOString(), platform: p.platform });
  return {
    sales12m,
    sales30d,
    // Même sans vente cette année, on montre les dernières connues, comme BiblioScan.
    lastSales: allSold.slice(0, 5).map(toRow),
    sales: sold.map(toRow),
    weightedProfit30dCents,
    ratio,
    currentPriceCents,
    // Le nombre réel d'offres (Keepa) quand on le connaît, sinon les offres relevées.
    currentOfferCount,
    ...rank,
    banger: isInteresting({ medianCents: stats.medianCents, sales12m, ratio, currentPriceCents }),
  };
}

/** "il y a 3 j", "2 m", "1 a 4 m" : âge court d'une vente, comme dans BiblioScan. */
export function shortAge(date: Date | string, now = new Date(), locale = "fr"): string {
  const ms = Math.max(0, now.getTime() - new Date(date).getTime());
  const days = Math.floor(ms / DAY);
  // Moins d'un jour : en heures, comme « il y a 2h » dans BiblioScan.
  if (days === 0) return `${Math.floor(ms / 3600000)}h`;
  const [d, m, y] = locale === "en" ? ["d", "mo", "y"] : ["j", "m", "a"];
  // En jours jusqu'à 2 mois : « 1m » répété dans le tableau des ventes ne dirait rien.
  if (days < 60) return `${days}${d}`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months}${m}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years}${y} ${rest}${m}` : `${years}${y}`;
}
