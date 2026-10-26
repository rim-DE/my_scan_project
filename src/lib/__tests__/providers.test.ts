import { describe, expect, it } from "vitest";
import { parseEbayItems, mapEbayCondition } from "../prices/providers/ebay";
import { parseKeepaProduct, parseKeepaSales } from "../prices/providers/keepa";
import { demoPrices } from "../prices/providers/demo";
import { bestAmazonOffer, PLATFORMS, siteLinks } from "../prices/platforms";

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

describe("liens vers les annonces (fenêtre « … »)", () => {
  it("met le comparateur en premier, Keepa à la fin, et le meilleur prix de chaque site", () => {
    const links = siteLinks({ isbn13: "9782253088578", title: "Le livre" }, [
      { platform: "amazon", offerType: "USED", priceCents: 2640 },
      { platform: "amazon", offerType: "NEW", priceCents: 3100 },
      { platform: "momox", offerType: "BUYBACK", priceCents: 676 },
    ]);
    expect(links[0].id).toBe("chasseauxlivres");
    expect(links.at(-1)!.id).toBe("keepa");
    expect(links.at(-1)!.url).toContain("9782253088578");
    expect(links.find((l) => l.id === "amazon")).toMatchObject({ priceCents: 2640, priceKind: "offer" });
    expect(links.find((l) => l.id === "momox")).toMatchObject({ priceCents: 676, priceKind: "buyback" });
    expect(links.find((l) => l.id === "fnac")!.priceCents).toBeNull();
  });

  it("sans ISBN, cherche par titre et auteur et retire les sites qui exigent un ISBN", () => {
    const links = siteLinks({ isbn13: null, title: "L'Étranger", author: "Camus" }, []);
    expect(links.some((l) => l.id === "momox")).toBe(false);
    expect(links.find((l) => l.id === "amazon")!.url).toContain(encodeURIComponent("L'Étranger Camus"));
  });

  it("ouvre directement la fiche Amazon du livre (ASIN = ISBN-10)", () => {
    const amazon = (isbn13: string | null) => siteLinks({ isbn13, title: "Atlas 2000" }, []).find((l) => l.id === "amazon")!.url;
    expect(amazon("9782091810386")).toBe("https://www.amazon.fr/dp/209181038X");
    // Les ISBN en 979 n'ont pas d'ISBN-10 : on garde la recherche.
    expect(amazon("9791032902561")).toBe("https://www.amazon.fr/s?k=9791032902561&i=stripbooks");
  });

  it("choisit l'offre Amazon la moins chère", () => {
    expect(bestAmazonOffer([{ platform: "amazon", offerType: "NEW", priceCents: 900 }, { platform: "amazon", offerType: "USED", priceCents: 700 }, { platform: "ebay", offerType: "USED", priceCents: 100 }])?.priceCents).toBe(700);
    expect(bestAmazonOffer([])).toBeNull();
  });
});
