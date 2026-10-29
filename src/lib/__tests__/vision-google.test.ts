import { describe, expect, it } from "vitest";
import { groupSpines, parseVisionResponse, type TextPiece } from "../vision-google";

/** Mot lu de bas en haut sur une tranche debout : x de x0 à x0+h (hauteur des lettres), y de y0 (haut) à y1 (bas). */
const up = (text: string, x0: number, h: number, y0: number, y1: number): TextPiece => ({
  text,
  confidence: 0.95,
  vertices: [
    { x: x0, y: y1 },
    { x: x0, y: y0 },
    { x: x0 + h, y: y0 },
    { x: x0 + h, y: y1 },
  ],
});
/** Mot horizontal à l'endroit. */
const flat = (text: string, x0: number, x1: number, y0: number, h: number): TextPiece => ({
  text,
  confidence: 0.95,
  vertices: [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y0 + h },
    { x: x0, y: y0 + h },
  ],
});

describe("Google Vision : mots regroupés en tranches", () => {
  it("sépare deux tranches voisines et trouve titre et auteur à la taille des lettres", () => {
    const books = groupSpines([
      // Tranche 1 (x ≈ 100-130) : « Bambous rustiques » en gros, « Paul Whittaker » en petit, lus de bas en haut.
      up("rustiques", 100, 30, 200, 420),
      up("Bambous", 100, 30, 430, 600),
      up("Whittaker", 108, 14, 650, 760),
      up("Paul", 108, 14, 770, 820),
      // Tranche 2 (x ≈ 170-200) : « Reine rouge ».
      up("rouge", 170, 30, 250, 380),
      up("Reine", 170, 30, 390, 520),
    ]);
    expect(books).toHaveLength(2);
    const bambous = books.find((b) => b.title.includes("Bambous"))!;
    expect(bambous.title).toBe("Bambous rustiques");
    expect(bambous.author).toBe("Paul Whittaker");
    expect(bambous.text_direction).toBe("bottom_to_top");
    expect(books.find((b) => b.title === "Reine rouge")).toBeTruthy();
  });

  it("garde un titre sur deux lignes dans le même livre", () => {
    const books = groupSpines([up("Le grand", 100, 30, 300, 500), up("Larousse", 136, 30, 300, 520)]);
    expect(books).toHaveLength(1);
    expect(books[0].title).toBe("Le grand Larousse");
  });

  it("lit un livre couché (texte horizontal) et ignore les miettes de texte", () => {
    const books = groupSpines([flat("Atlas", 100, 200, 900, 25), flat("zoologique", 215, 420, 900, 25), flat("x", 800, 810, 100, 10)]);
    expect(books.map((b) => b.title)).toEqual(["Atlas zoologique"]);
    expect(books[0].text_direction).toBe("left_to_right");
  });

  it("lit la réponse de l'API (mots et positions)", () => {
    const pieces = parseVisionResponse({
      responses: [
        {
          fullTextAnnotation: {
            pages: [
              {
                blocks: [
                  {
                    paragraphs: [
                      {
                        words: [
                          { confidence: 0.9, boundingBox: { vertices: [{ x: 1, y: 2 }, { x: 50, y: 2 }, { x: 50, y: 20 }, { y: 20 }] }, symbols: [{ text: "O" }, { text: "k" }] },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    });
    expect(pieces).toEqual([{ text: "Ok", confidence: 0.9, vertices: [{ x: 1, y: 2 }, { x: 50, y: 2 }, { x: 50, y: 20 }, { x: 0, y: 20 }] }]);
  });
});
