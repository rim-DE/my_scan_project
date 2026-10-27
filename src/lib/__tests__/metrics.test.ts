import { describe, expect, it } from "vitest";
import { biblioRank, computeMetrics, shortAge, type SalePoint } from "../prices/metrics";
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
      { platform: "ebay", offerType: "SOLD", priceCents: 9900, observedAt: daysAgo(500) }, // trop ancienne
      { platform: "ebay", offerType: "USED", priceCents: 2600, observedAt: daysAgo(1) },
      { platform: "ebay", offerType: "NEW", priceCents: 3000, observedAt: daysAgo(1) },
    ];
    const stats = computeStats(points, SETTINGS, NOW);
    const m = computeMetrics(points, stats, { listPriceCents: 3000, sales12m: null, sales30d: null }, NOW);
    expect(m.sales12m).toBe(3);
    expect(m.sales30d).toBe(1);
    expect(m.lastSales.map((s) => s.priceCents)).toEqual([2500, 2300, 2400]);
    expect(m.sales).toHaveLength(3);
    expect(m.sales[0].platform).toBe("ebay");
    // Médiane des ventes de l'année 2400 (les offres en cours ne comptent pas), 3 ventes par an = 0,25 vente par mois.
    expect(stats.medianCents).toBe(2400);
    expect(m.weightedProfit30dCents).toBe(600);
    expect(m.ratio).toBe(0.8);
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
  it("classe d'abord le livre qui rapporte ET se vend vite", () => {
    // Power : 15 € net, 126 ventes/an, 14 offres → beaucoup mieux qu'un livre à 18 € qui se vend peu face à 16 offres.
    const power = biblioRank({ netAfterFeesCents: 1500, sales12m: 126, offerCount: 14, buybackCents: null });
    const slow = biblioRank({ netAfterFeesCents: 1791, sales12m: 25, offerCount: 16, buybackCents: null });
    expect(power.biblioRank!).toBeGreaterThan(slow.biblioRank!);
    expect(power.expected90dCents).toBe(1316);
    expect(power.biblioRank).toBe(73);
    expect(slow.biblioRank).toBe(42);
  });

  it("vaut 0 sans vente, sauf si un site de rachat sert de plancher", () => {
    expect(biblioRank({ netAfterFeesCents: 7388, sales12m: 0, offerCount: 2, buybackCents: null })).toEqual({ expected90dCents: 0, biblioRank: 0 });
    expect(biblioRank({ netAfterFeesCents: 7388, sales12m: 0, offerCount: 2, buybackCents: 751 }).expected90dCents).toBe(751);
  });

  it("n'invente pas de score sans nombre de ventes ni rachat", () => {
    expect(biblioRank({ netAfterFeesCents: 1500, sales12m: null, offerCount: null, buybackCents: null })).toEqual({ expected90dCents: null, biblioRank: null });
  });
});
