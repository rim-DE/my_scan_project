import { describe, expect, it } from "vitest";
import { bestByPlatform, computeStats, estimateForCondition, isFresh, median, netAfterFees, quantile } from "../prices/stats";

const settings = { feeRate: 0.15, fixedCostCents: 150, targetRoi: 1 };

describe("statistiques de prix", () => {
  it("calcule médiane et quantiles", () => {
    expect(median([300, 100, 200])).toBe(200);
    expect(median([100, 200, 300, 400])).toBe(250);
    expect(median([])).toBeNull();
    expect(quantile([100, 200, 300, 400, 500], 0.25)).toBe(200);
  });

  it("déduit les frais", () => {
    expect(netAfterFees(2200, settings)).toBe(1720);
    expect(netAfterFees(100, settings)).toBe(0);
  });

  it("calcule min/médiane/max sur l'occasion, fourchette et prix d'achat max", () => {
    const s = computeStats(
      [
        { platform: "ebay", offerType: "USED", priceCents: 1700 },
        { platform: "amazon", offerType: "USED", priceCents: 2200 },
        { platform: "vinted", offerType: "USED", priceCents: 2200 },
        { platform: "fnac", offerType: "NEW", priceCents: 2500 },
        { platform: "momox", offerType: "BUYBACK", priceCents: 277 },
      ],
      settings,
    );
    expect(s.count).toBe(5);
    expect(s.usedCount).toBe(3);
    expect(s.minCents).toBe(1700);
    expect(s.medianCents).toBe(2200);
    expect(s.maxCents).toBe(2200);
    expect(s.newMinCents).toBe(2500);
    expect(s.buybackMaxCents).toBe(277);
    expect(s.resaleRange).toEqual([1950, 2200]);
    expect(s.netAfterFeesCents).toBe(1720);
    expect(s.maxBuyCents).toBe(860);
  });

  it("utilise les prix neufs s'il n'y a pas d'occasion", () => {
    const s = computeStats([{ platform: "fnac", offerType: "NEW", priceCents: 1000 }], settings);
    expect(s.medianCents).toBe(1000);
  });

  it("ne renvoie rien sans prix", () => {
    const s = computeStats([], settings);
    expect(s.medianCents).toBeNull();
    expect(s.maxBuyCents).toBeNull();
    expect(s.resaleRange).toBeNull();
  });

  it("le prix de rachat sert de plancher au prix d'achat max", () => {
    const s = computeStats(
      [
        { platform: "ebay", offerType: "USED", priceCents: 400 },
        { platform: "momox", offerType: "BUYBACK", priceCents: 500 },
      ],
      settings,
    );
    expect(s.maxBuyCents).toBe(500);
  });

  it("estime selon l'état", () => {
    const s = computeStats([{ platform: "ebay", offerType: "USED", priceCents: 1000 }], settings);
    expect(estimateForCondition(s, "VERY_GOOD")).toBe(1000);
    expect(estimateForCondition(s, "ACCEPTABLE")).toBe(600);
    expect(estimateForCondition(s, "NEW")).toBe(1250);
  });

  it("garde le meilleur prix par plateforme", () => {
    const best = bestByPlatform([
      { platform: "ebay", offerType: "USED" as const, priceCents: 900 },
      { platform: "ebay", offerType: "USED" as const, priceCents: 700 },
      { platform: "momox", offerType: "BUYBACK" as const, priceCents: 100 },
      { platform: "momox", offerType: "BUYBACK" as const, priceCents: 300 },
    ]);
    expect(best).toHaveLength(2);
    expect(best.find((b) => b.platform === "ebay")!.priceCents).toBe(700);
    expect(best.find((b) => b.platform === "momox")!.priceCents).toBe(300);
  });

  it("gère l'expiration du cache", () => {
    const now = new Date("2026-01-02T12:00:00Z");
    expect(isFresh(new Date("2026-01-02T00:00:00Z"), 24, now)).toBe(true);
    expect(isFresh(new Date("2026-01-01T00:00:00Z"), 24, now)).toBe(false);
  });
});
