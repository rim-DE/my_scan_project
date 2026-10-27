import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, activeFilterCount, passesFilters, smallSpines, type Filters } from "../filters";
import type { DetectionView } from "../queries";

function det(id: string, over: Partial<DetectionView> = {}, book: Record<string, unknown> | null = null): DetectionView {
  return {
    id,
    photoId: "p1",
    rawTitle: "Un titre bien lisible",
    rawAuthor: null,
    bbox: null,
    polygon: null,
    textDirection: null,
    confidence: "high",
    note: null,
    inStock: false,
    book: book as DetectionView["book"],
    ...over,
  };
}

const book = (medianCents: number | null, extra: Record<string, unknown> = {}) => ({
  stats: { medianCents, buybackMaxCents: null },
  metrics: { currentPriceCents: null, sales12m: 5, ratio: 1, banger: false },
  listPriceCents: 2000,
  salesRank: 1000,
  prices: [],
  ...extra,
});

const box = (h: number) => ({ x: 0, y: 0, w: 0.05, h });

describe("filtres du scan", () => {
  it("cache par défaut les textes trop courts et les petites tranches", () => {
    const dets = [det("a", { bbox: box(0.8) }), det("b", { bbox: box(0.8) }), det("c", { bbox: box(0.8) }), det("tiny", { bbox: box(0.3) }), det("short", { rawTitle: "Higgins", bbox: box(0.8) })];
    const small = smallSpines(dets, [{ id: "p1", width: 1000, height: 1000 }]);
    expect([...small]).toEqual(["tiny"]);
    expect(dets.filter((d) => passesFilters(d, DEFAULT_FILTERS, small)).map((d) => d.id)).toEqual(["a", "b", "c"]);
  });

  it("garde un livre scanné au code-barres même sans texte lu", () => {
    expect(passesFilters(det("bar", { photoId: null, rawTitle: null }), DEFAULT_FILTERS, new Set())).toBe(true);
  });

  it("applique les cases à cocher et les fourchettes", () => {
    const cheap = det("cheap", {}, book(800));
    const good = det("good", {}, book(4000, { metrics: { currentPriceCents: null, sales12m: 5, ratio: 2, banger: true } }));
    const unknown = det("unknown", {}, book(null));
    const f = (x: Partial<Filters["flags"]>, ranges: Filters["ranges"] = {}): Filters => ({ flags: { ...DEFAULT_FILTERS.flags, ...x }, ranges });
    const keep = (fl: Filters) => [cheap, good, unknown].filter((d) => passesFilters(d, fl, new Set())).map((d) => d.id);

    expect(keep(f({ hideUnder12: true }))).toEqual(["good", "unknown"]);
    expect(keep(f({ onlyInteresting: true }))).toEqual(["good"]);
    // Une fourchette réglée écarte aussi les livres sans prix connu.
    expect(keep(f({}, { median: [10, 50] }))).toEqual(["good"]);
    expect(activeFilterCount(f({ hideUnder12: true }, { median: [10, 50] }))).toBe(2);
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
  });
});
