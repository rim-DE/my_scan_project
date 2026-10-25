import { describe, expect, it } from "vitest";
import { cleanDetections, DetectionResultSchema, type DetectedBook } from "../vision";

const SIZE = { width: 1000, height: 2000 };

const quad = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

const book = (over: Partial<DetectedBook>): DetectedBook => ({
  title: "Festival Fairy Tales",
  author: null,
  publisher: null,
  isbn: null,
  spine_text: "Festival Fairy Tales",
  corners: quad(700, 1600, 740, 1980),
  text_direction: "bottom_to_top",
  confidence: "high",
  ...over,
});

describe("détection", () => {
  it("convertit les coins en pixels en contour normalisé et calcule le rectangle englobant", () => {
    const [d] = cleanDetections([book({})], SIZE);
    expect(d.polygon).toEqual([
      { x: 0.7, y: 0.8 },
      { x: 0.74, y: 0.8 },
      { x: 0.74, y: 0.99 },
      { x: 0.7, y: 0.99 },
    ]);
    expect(d.bbox!.x).toBeCloseTo(0.7);
    expect(d.bbox!.w).toBeCloseTo(0.04);
    expect(d.bbox!.h).toBeCloseTo(0.19);
  });

  it("supprime les doublons qui se recouvrent et les titres vides", () => {
    const out = cleanDetections(
      [book({}), book({ title: "  festival  fairy tales ", corners: quad(702, 1610, 741, 1975) }), book({ title: "x" }), book({ title: "Le Kit" })],
      SIZE,
    );
    expect(out.map((b) => b.title)).toEqual(["Festival Fairy Tales", "Le Kit"]);
  });

  it("garde deux livres de même titre rangés à deux endroits différents", () => {
    const out = cleanDetections(
      [book({ title: "Léonard de Vinci", corners: quad(100, 100, 140, 500) }), book({ title: "Léonard de Vinci", corners: quad(600, 1200, 650, 1600) })],
      SIZE,
    );
    expect(out).toHaveLength(2);
  });

  it("garde un livre même si sa forme est inutilisable (sans contour)", () => {
    const [d] = cleanDetections([book({ corners: [{ x: 1, y: 1 }] })], SIZE);
    expect(d.polygon).toBeNull();
    expect(d.bbox).toBeNull();
  });

  it("le schéma accepte une réponse type du modèle", () => {
    const parsed = DetectionResultSchema.parse({ books: [book({ author: "Kate Forrester" })] });
    expect(parsed.books[0].author).toBe("Kate Forrester");
  });
});
