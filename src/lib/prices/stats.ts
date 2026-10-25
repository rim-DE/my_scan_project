// Calculs de prix : min / médiane / max, fourchette de revente, prix d'achat max conseillé.
import type { Condition, OfferType } from "./types";

export interface PricePoint {
  platform: string;
  offerType: OfferType;
  priceCents: number;
}

export interface ResaleSettings {
  /** Commission moyenne des plateformes (0.15 = 15 %). */
  feeRate: number;
  /** Frais fixes par vente (emballage, etc.), en centimes. */
  fixedCostCents: number;
  /** Rentabilité visée sur le prix d'achat (1 = 100 %, tu veux doubler ta mise). */
  targetRoi: number;
}

export interface PriceStats {
  count: number;
  usedCount: number;
  minCents: number | null;
  medianCents: number | null;
  maxCents: number | null;
  newMinCents: number | null;
  buybackMaxCents: number | null;
  /** Fourchette de revente conseillée [bas, haut]. */
  resaleRange: [number, number] | null;
  /** Ce que tu touches après frais si tu vends au prix médian. */
  netAfterFeesCents: number | null;
  /** Prix maximum à payer pour atteindre la rentabilité visée. */
  maxBuyCents: number | null;
}

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) throw new Error("liste vide");
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  return quantile([...values].sort((a, b) => a - b), 0.5);
}

export function netAfterFees(priceCents: number, s: ResaleSettings): number {
  return Math.max(0, Math.round(priceCents * (1 - s.feeRate) - s.fixedCostCents));
}

export function computeStats(points: PricePoint[], s: ResaleSettings): PriceStats {
  // Base de revente : prix d'occasion et ventes réalisées ; à défaut, tous les prix "vente" (neuf inclus).
  const resale = points.filter((p) => p.offerType === "USED" || p.offerType === "SOLD").map((p) => p.priceCents);
  const base = resale.length > 0 ? resale : points.filter((p) => p.offerType === "NEW").map((p) => p.priceCents);
  const sorted = [...base].sort((a, b) => a - b);
  const newPrices = points.filter((p) => p.offerType === "NEW").map((p) => p.priceCents);
  const buyback = points.filter((p) => p.offerType === "BUYBACK").map((p) => p.priceCents);

  const med = sorted.length ? quantile(sorted, 0.5) : null;
  const net = med !== null ? netAfterFees(med, s) : null;
  const buybackMax = buyback.length ? Math.max(...buyback) : null;
  let maxBuy = net !== null ? Math.floor(net / (1 + s.targetRoi)) : null;
  // Si un site de rachat (Momox…) paie plus, c'est un plancher sûr.
  if (buybackMax !== null) maxBuy = Math.max(maxBuy ?? 0, buybackMax);

  return {
    count: points.length,
    usedCount: resale.length,
    minCents: sorted.length ? sorted[0] : null,
    medianCents: med,
    maxCents: sorted.length ? sorted[sorted.length - 1] : null,
    newMinCents: newPrices.length ? Math.min(...newPrices) : null,
    buybackMaxCents: buybackMax,
    resaleRange: sorted.length ? [quantile(sorted, 0.25), med!] : null,
    netAfterFeesCents: net,
    maxBuyCents: maxBuy,
  };
}

/** Coefficient appliqué au prix médian d'occasion selon l'état (référence : "très bon état"). */
export const CONDITION_FACTORS: Record<Condition, number> = {
  NEW: 1.25,
  LIKE_NEW: 1.1,
  VERY_GOOD: 1,
  GOOD: 0.85,
  ACCEPTABLE: 0.6,
};

export function estimateForCondition(stats: PriceStats, condition: Condition): number | null {
  if (condition === "NEW" && stats.newMinCents !== null) return stats.newMinCents;
  if (stats.medianCents === null) return null;
  return Math.round(stats.medianCents * CONDITION_FACTORS[condition]);
}

/** Garde le prix le plus bas par (plateforme, type) : utile pour l'affichage par site. */
export function bestByPlatform<T extends PricePoint>(points: T[]): T[] {
  const map = new Map<string, T>();
  for (const p of points) {
    const k = `${p.platform}|${p.offerType}`;
    const cur = map.get(k);
    const better = p.offerType === "BUYBACK" ? !cur || p.priceCents > cur.priceCents : !cur || p.priceCents < cur.priceCents;
    if (better) map.set(k, p);
  }
  return [...map.values()];
}

export function isFresh(fetchedAt: Date, ttlHours: number, now = new Date()): boolean {
  return now.getTime() - fetchedAt.getTime() < ttlHours * 3600 * 1000;
}
