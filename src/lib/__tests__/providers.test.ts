import { describe, expect, it } from "vitest";
import { parseEbayItems, mapEbayCondition } from "../prices/providers/ebay";
import { keepaTimeToDate, parseKeepaInfo, parseKeepaProduct, parseKeepaSaleHistory, parseKeepaSales } from "../prices/providers/keepa";
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

  it("lit la fiche Amazon de Keepa : offres, rang, note, prix éditeur", () => {
    const current = Array(18).fill(-1);
    Object.assign(current, { 3: 636, 4: 2800, 11: 4, 12: 10, 16: 46, 17: 3605 });
    expect(parseKeepaInfo({ stats: { current } })).toEqual({
      offerCount: 14,
      salesRank: 636,
      rating: 4.6,
      reviewCount: 3605,
      listPriceCents: 2800,
      coverUrl: null,
    });
    expect(parseKeepaInfo({})).toEqual({ offerCount: null, salesRank: null, rating: null, reviewCount: null, listPriceCents: null, coverUrl: null });
    expect(parseKeepaInfo({ imagesCSV: "51abc.jpg,41def.jpg" }).coverUrl).toBe("https://m.media-amazon.com/images/I/51abc.jpg");
    expect(parseKeepaInfo({ images: [{ l: "71big.jpg", m: "41mid.jpg" }] }).coverUrl).toBe("https://m.media-amazon.com/images/I/71big.jpg");
  });

  it("déduit les ventes Amazon datées de l'historique du classement Keepa", () => {
    const now = new Date("2026-10-26T12:00:00Z");
    // Temps Keepa (minutes depuis 2011) pour "il y a n jours".
    const k = (days: number) => Math.round((now.getTime() - days * 86400000) / 60000) - 21564000;
    const product = {
      asin: "2848992549",
      csv: [
        null,
        [k(400), 3000, k(6), 2600],
        [k(400), 2000, k(8), 2300, k(4), 2500],
        // Classement : améliorations à 500 j (trop ancien), 7 j et 3 j ; dégradation à 5 j.
        [k(600), 9000, k(500), 5000, k(10), 8000, k(7), 1200, k(5), 4000, k(3), 636],
      ],
    };
    const sales = parseKeepaSaleHistory(product, "FR", now);
    expect(sales.map((s) => [Math.round((now.getTime() - s.observedAt!.getTime()) / 86400000), s.priceCents])).toEqual([
      [7, 2300],
      [3, 2500],
    ]);
    expect(sales[0]).toMatchObject({ platform: "amazon", offerType: "SOLD", url: "https://www.amazon.fr/dp/2848992549" });
    expect(keepaTimeToDate(0).toISOString()).toBe("2011-01-01T00:00:00.000Z");
    expect(parseKeepaSaleHistory({}, "FR", now)).toEqual([]);
  });

  it("garde les dernières ventes même anciennes quand rien ne s'est vendu cette année", () => {
    const now = new Date("2026-10-26T12:00:00Z");
    const k = (days: number) => Math.round((now.getTime() - days * 86400000) / 60000) - 21564000;
    // Une seule vente, il y a ~5 ans, à 3 €.
    const product = { csv: [null, null, [k(2000), 300], [k(2000), 9000, k(1890), 5000]] };
    const sales = parseKeepaSaleHistory(product, "FR", now);
    expect(sales.map((s) => [Math.round((now.getTime() - s.observedAt!.getTime()) / 86400000), s.priceCents])).toEqual([[1890, 300]]);
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
