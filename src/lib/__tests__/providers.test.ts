import { describe, expect, it } from "vitest";
import { parseEbayItems, mapEbayCondition } from "../prices/providers/ebay";
import { parseKeepaProduct, parseKeepaSales } from "../prices/providers/keepa";
import { demoPrices } from "../prices/providers/demo";
import { PLATFORMS } from "../prices/platforms";

describe("sources de prix", () => {
  it("lit les annonces eBay", () => {
    const out = parseEbayItems(
      [
        { price: { value: "12.50", currency: "EUR" }, conditionId: "1000", itemWebUrl: "https://ebay.fr/1" },
        { price: { value: "8", currency: "EUR" }, conditionId: "5000" },
        { price: { value: "9", currency: "USD" }, conditionId: "5000" },
        { price: { value: "abc", currency: "EUR" } },
      ],
      "EUR",
    );
    expect(out).toEqual([
      { platform: "ebay", offerType: "NEW", condition: "NEW", priceCents: 1250, currency: "EUR", url: "https://ebay.fr/1" },
      { platform: "ebay", offerType: "USED", condition: "GOOD", priceCents: 800, currency: "EUR", url: null },
    ]);
    expect(mapEbayCondition("2750")).toBe("LIKE_NEW");
    expect(mapEbayCondition(undefined)).toBeNull();
  });

  it("lit un produit Keepa", () => {
    const out = parseKeepaProduct({ asin: "145215175X", stats: { current: [2500, -1, 1800] } }, "FR");
    expect(out).toEqual([
      { platform: "amazon", offerType: "NEW", priceCents: 2500, currency: "EUR", url: "https://www.amazon.fr/dp/145215175X" },
      { platform: "amazon", offerType: "USED", priceCents: 1800, currency: "EUR", url: "https://www.amazon.fr/dp/145215175X" },
    ]);
  });

  it("lit le nombre de ventes estimé par Keepa", () => {
    expect(parseKeepaSales({ stats: { salesRankDrops30: 2, salesRankDrops365: 24 } })).toEqual({ sales30d: 2, sales12m: 24 });
    expect(parseKeepaSales({ stats: { salesRankDrops30: -1 } })).toEqual({ sales30d: null, sales12m: null });
  });

  it("le mode démo est déterministe et invente aussi des ventes passées datées", () => {
    const now = new Date("2026-10-25T12:00:00Z");
    expect(demoPrices("9781452151755", "FR", now)).toEqual(demoPrices("9781452151755", "FR", now));
    const all = Array.from({ length: 20 }, (_, i) => demoPrices(`97814521517${String(i).padStart(2, "0")}`, "FR", now)).flat();
    const sold = all.filter((o) => o.offerType === "SOLD");
    expect(sold.length).toBeGreaterThan(0);
    expect(sold.every((o) => o.observedAt! <= now && now.getTime() - o.observedAt!.getTime() <= 365 * 24 * 3600 * 1000)).toBe(true);
  });

  it("chaque plateforme a un lien de recherche https", () => {
    for (const p of PLATFORMS) {
      expect(p.searchUrl({ isbn13: "9781452151755", title: "Celtic Tales" })).toMatch(/^https:\/\//);
    }
    expect(PLATFORMS.map((p) => p.id)).toEqual(["amazon", "fnac", "rakuten", "leboncoin", "vinted", "momox", "recyclivre", "abebooks", "ebay"]);
  });
});
