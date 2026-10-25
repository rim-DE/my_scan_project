import { describe, expect, it } from "vitest";
import { cleanDetections, DetectionResultSchema, normalizeBox, type DetectedBook } from "../vision";

const book = (over: Partial<DetectedBook>): DetectedBook => ({
  title: "Festival Fairy Tales",
  author: null,
  publisher: null,
  isbn: null,
  spine_text: "Festival Fairy Tales",
  box: { x0: 700, y0: 800, x1: 740, y1: 990 },
  confidence: "high",
  ...over,
});

describe("détection", () => {
  it("normalise les boîtes (inversées, hors cadre, trop petites)", () => {
    expect(normalizeBox({ x0: 100, y0: 200, x1: 300, y1: 600 })).toEqual({ x: 0.1, y: 0.2, w: 0.2, h: 0.4 });
    expect(normalizeBox({ x0: 300, y0: 600, x1: 100, y1: 200 })).toEqual({ x: 0.1, y: 0.2, w: 0.2, h: 0.4 });
    expect(normalizeBox({ x0: -50, y0: 0, x1: 1200, y1: 1000 })).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(normalizeBox({ x0: 10, y0: 10, x1: 11, y1: 500 })).toBeNull();
  });

  it("supprime les doublons et les titres vides", () => {
    const out = cleanDetections([book({}), book({ title: "  festival  fairy tales " }), book({ title: "x" }), book({ title: "Le Kit" })]);
    expect(out.map((b) => b.title)).toEqual(["Festival Fairy Tales", "Le Kit"]);
  });

  it("le schéma accepte une réponse type du modèle", () => {
    const parsed = DetectionResultSchema.parse({ books: [book({ author: "Kate Forrester" })] });
    expect(parsed.books[0].author).toBe("Kate Forrester");
  });
});
