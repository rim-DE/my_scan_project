import { describe, expect, it } from "vitest";
import { biblioRank, computeMetrics, dropAberrantPrices, isInteresting, shortAge, type SalePoint } from "../prices/metrics";
import { computeStats } from "../prices/stats";

const NOW = new Date("2026-10-25T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 3600 * 1000);
const SETTINGS = { feeRate: 0, fixedCostCents: 0, targetRoi: 1 };

describe("indicateurs façon BiblioScan", () => {
  it("compte les ventes de l'année, garde les 5 dernières et pondère le profit", () => {
    const points: (SalePoint & { platform: string })[] = [
      { platform: "ebay", offerType: "SOLD", priceCents: 2500, observedAt: daysAgo(10) },
      { platform: "ebay", offerType: "SOLD", priceCents: 2300, observedAt: daysAgo(60) },
      { platform: "ebay", offerType: "SOLD", priceCents: 2400, observedAt: daysAgo(200) },
      { platform: "ebay", offerType: "SOLD", priceCents: 9900, observedAt: daysAgo(500) }, // hors des 12 mois, mais montrée dans les dernières ventes
      { platform: "ebay", offerType: "USED", priceCents: 2600, observedAt: daysAgo(1) },
      { platform: "ebay", offerType: "NEW", priceCents: 3000, observedAt: daysAgo(1) },
    ];
    const stats = computeStats(points, SETTINGS, NOW);
    const m = computeMetrics(points, stats, { listPriceCents: 3000, sales12m: null, sales30d: null }, NOW);
    expect(m.sales12m).toBe(3);
    expect(m.sales30d).toBe(1);
    expect(m.lastSales.map((s) => s.priceCents)).toEqual([2500, 2300, 2400, 9900]);
    expect(m.sales).toHaveLength(3);
    expect(m.sales[0].platform).toBe("ebay");
    // Médiane des 5 dernières ventes, même anciennes, comme BiblioScan : 2450 (les offres en cours ne comptent pas).
    // Rythme des 5 dernières ventes, comme BiblioScan : 4 ventes en 500 jours ≈ 0,24 vente par mois.
    expect(stats.medianCents).toBe(2450);
    expect(m.weightedProfit30dCents).toBe(Math.round(2450 * (4 / (500 / 30.44))));
    expect(m.banger).toBe(false);
    expect(m.ratio).toBe(0.82);
    expect(m.currentPriceCents).toBe(2600);
    expect(m.currentOfferCount).toBe(2);
  });

  it("préfère le nombre de ventes fourni par une source (Keepa) et plafonne la probabilité à 1", () => {
    const points: (SalePoint & { platform: string })[] = [{ platform: "ebay", offerType: "USED", priceCents: 1000, observedAt: NOW }];
    const stats = computeStats(points, SETTINGS);
    const m = computeMetrics(points, stats, { listPriceCents: null, sales12m: 40, sales30d: 4 }, NOW);
    expect(m.sales12m).toBe(40);
    expect(m.weightedProfit30dCents).toBe(1000);
    expect(m.ratio).toBeNull();
  });

  it("sans vente cette année, prend le rythme des dernières ventes (comme BiblioScan)", () => {
    // « La peur exponentielle » : 0 vente sur 12 mois, 5 ventes il y a 22 à 29 mois → environ 0,17 vente par mois.
    const sold = (days: number): SalePoint & { platform: string } => ({ platform: "amazon", offerType: "SOLD", priceCents: 1191, observedAt: daysAgo(days) });
    const points = [sold(640), sold(700), sold(770), sold(800), sold(870)];
    const stats = computeStats(points, SETTINGS, NOW);
    const m = computeMetrics(points, stats, { listPriceCents: 2100, sales12m: 0, sales30d: 0 }, NOW);
    const pace = 5 / (870 / 30.44);
    expect(m.weightedProfit30dCents).toBe(Math.round(stats.netAfterFeesCents! * pace));
    // Pas de vente sur 12 mois : le BiblioRank reste au plancher, même si le profit pondéré existe.
    expect(m.biblioRank).toBeLessThanOrEqual(5);
  });

  it("sans information de ventes, pas de profit pondéré", () => {
    const points: (SalePoint & { platform: string })[] = [{ platform: "ebay", offerType: "USED", priceCents: 1000, observedAt: NOW }];
    const m = computeMetrics(points, computeStats(points, SETTINGS), { listPriceCents: null, sales12m: null, sales30d: null }, NOW);
    expect(m.sales12m).toBeNull();
    expect(m.weightedProfit30dCents).toBeNull();
  });

  it("affiche l'âge d'une vente en format court", () => {
    expect(shortAge(daysAgo(3), NOW)).toBe("3j");
    expect(shortAge(daysAgo(41), NOW)).toBe("41j");
    expect(shortAge(new Date(NOW.getTime() - 2.5 * 3600 * 1000), NOW)).toBe("2h");
    expect(shortAge(daysAgo(65), NOW)).toBe("2m");
    expect(shortAge(daysAgo(400), NOW)).toBe("1a 1m");
    expect(shortAge(daysAgo(65), NOW, "en")).toBe("2mo");
  });
});

describe("nombre d'offres", () => {
  it("préfère le nombre réel d'offres de la fiche Amazon (Keepa)", () => {
    const points: (SalePoint & { platform: string })[] = [{ platform: "amazon", offerType: "USED", priceCents: 2500, observedAt: NOW }];
    const stats = computeStats(points, SETTINGS, NOW);
    const m = computeMetrics(points, stats, { listPriceCents: 2800, sales12m: 126, sales30d: 10, offerCount: 14 }, NOW);
    expect(m.currentOfferCount).toBe(14);
    expect(m.currentPriceCents).toBe(2500);
  });
});

describe("BiblioRank", () => {
  it("suit le classement de BiblioScan sur son export (Bambous > Larousse grossesse > Bouger en accouchant)", () => {
    const bambous = biblioRank({ netAfterFeesCents: 7116, sales12m: 2, sales6m: 1, currentPriceCents: 8200, medianCents: 9700, buybackCents: null });
    const larousse = biblioRank({ netAfterFeesCents: 1899, sales12m: 19, sales6m: 9, currentPriceCents: 3167, medianCents: 3167, buybackCents: null });
    const bouger = biblioRank({ netAfterFeesCents: 1367, sales12m: 29, sales6m: 14, currentPriceCents: 2850, medianCents: 2280, buybackCents: null });
    expect(bambous.biblioRank!).toBeGreaterThan(larousse.biblioRank!);
    expect(larousse.biblioRank!).toBeGreaterThan(bouger.biblioRank!);
  });

  it("fait baisser un livre quand quelqu'un le vend bien sous la médiane", () => {
    // La mesure des médias : médiane 54 €, en vente à 6 €.
    const base = { netAfterFeesCents: 3700, sales12m: 3, sales6m: 1, medianCents: 5404, buybackCents: null };
    const cheap = biblioRank({ ...base, currentPriceCents: 599 }).biblioRank!;
    const fair = biblioRank({ ...base, currentPriceCents: 5404 }).biblioRank!;
    expect(cheap).toBeLessThan(fair * 0.6);
  });

  it("plafonne à 5 un livre sans vente sur 12 mois, même très cher ou avec un rachat", () => {
    expect(biblioRank({ netAfterFeesCents: 5516, sales12m: 0, sales6m: 0, buybackCents: null })).toEqual({ expected90dCents: 0, biblioRank: 0 });
    expect(biblioRank({ netAfterFeesCents: 199000, sales12m: 0, buybackCents: null }).biblioRank!).toBeLessThanOrEqual(5);
    const buyback = biblioRank({ netAfterFeesCents: 7388, sales12m: 0, buybackCents: 751 });
    expect(buyback.expected90dCents).toBe(751);
    expect(buyback.biblioRank).toBe(5);
  });

  it("n'invente pas de score sans nombre de ventes ni rachat", () => {
    expect(biblioRank({ netAfterFeesCents: 1500, sales12m: null, buybackCents: null })).toEqual({ expected90dCents: null, biblioRank: null });
  });
});

describe("prix aberrants", () => {
  it("ignore les offres et ventes à plus de 5 × le prix éditeur, garde le rachat", () => {
    const pts = [
      { offerType: "USED", priceCents: 1500 },
      { offerType: "SOLD", priceCents: 203400 },
      { offerType: "BUYBACK", priceCents: 300 },
    ];
    expect(dropAberrantPrices(pts, 1690).map((p) => p.priceCents)).toEqual([1500, 300]);
  });

  it("sans prix éditeur, compare à la médiane des prix du livre", () => {
    const pts = [1500, 1600, 1700, 203400].map((priceCents) => ({ offerType: "SOLD", priceCents }));
    expect(dropAberrantPrices(pts, null).map((p) => p.priceCents)).toEqual([1500, 1600, 1700]);
  });
});

describe("pépites (livres « intéressants » selon BiblioScan)", () => {
  const base = { medianCents: 4000, sales12m: 5, ratio: 1.5, currentPriceCents: null };

  it("retient un livre à 40 €, 5 ventes, ratio 1,5 et aucune offre en cours", () => {
    expect(isInteresting(base)).toBe(true);
    expect(isInteresting({ ...base, currentPriceCents: 3000 })).toBe(true);
  });

  it("écarte un livre si un seul critère manque", () => {
    expect(isInteresting({ ...base, medianCents: 3400 })).toBe(false);
    expect(isInteresting({ ...base, sales12m: 2 })).toBe(false);
    expect(isInteresting({ ...base, ratio: 1.1 })).toBe(false);
    expect(isInteresting({ ...base, ratio: null })).toBe(false);
    expect(isInteresting({ ...base, currentPriceCents: 2500 })).toBe(false);
  });

  it("calcule la pépite dans les indicateurs du livre", () => {
    const sale = (days: number, priceCents: number): SalePoint & { platform: string } => ({ platform: "amazon", offerType: "SOLD", priceCents, observedAt: daysAgo(days) });
    const points = [sale(5, 4000), sale(60, 4200), sale(200, 3800)];
    const stats = computeStats(points, SETTINGS, NOW);
    const m = computeMetrics(points, stats, { listPriceCents: 2500, sales12m: 3, sales30d: 1 }, NOW);
    expect(m.banger).toBe(true);
    expect(computeMetrics(points, stats, { listPriceCents: 3800, sales12m: 3, sales30d: 1 }, NOW).banger).toBe(false);
  });
});
