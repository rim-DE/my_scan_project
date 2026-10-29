import { describe, expect, it } from "vitest";
import { cleanDetections, DetectionResultSchema, mergeTiles, readingOrder, soloBooks, tileLayout, type DetectedBook } from "../vision";

const SIZE = { width: 1000, height: 2000 };

const quad = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

const book = (over: Partial<DetectedBook>): DetectedBook => ({
  shelf: 1,
  title: "Festival Fairy Tales",
  author: null,
  publisher: null,
  isbn: null,
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

describe("découpage en bandes", () => {
  it("coupe les grandes photos en 2 ou 3 bandes qui se recouvrent et couvrent toute la largeur", () => {
    expect(tileLayout(800)).toEqual([{ left: 0, width: 800 }]);
    for (const [w, n] of [
      [1456, 2],
      [2576, 3],
      [3024, 4],
      [4032, 5],
      [8000, 6],
    ]) {
      const tiles = tileLayout(w);
      expect(tiles).toHaveLength(n);
      expect(tiles[0].left).toBe(0);
      expect(tiles.at(-1)!.left + tiles.at(-1)!.width).toBe(w);
      for (let i = 1; i < tiles.length; i++) {
        // Recouvrement d'au moins 20 % d'une bande entre deux bandes voisines.
        expect(tiles[i - 1].left + tiles[i - 1].width - tiles[i].left).toBeGreaterThanOrEqual(Math.round(tiles[i].width * 0.2));
      }
    }
  });

  it("garde une seule fois un livre vu dans deux bandes, et deux livres voisins distincts", () => {
    const full = cleanDetections([book({ title: "Les Misérables", corners: quad(480, 100, 520, 900) })], SIZE);
    const cut = cleanDetections([book({ title: "Les Misér", corners: quad(480, 100, 500, 900) })], SIZE);
    const other = cleanDetections([book({ title: "Notre-Dame de Paris", corners: quad(520, 100, 560, 900) })], SIZE);
    const out = mergeTiles([[...full], [...cut, ...other]]);
    expect(out.map((b) => b.title)).toEqual(["Les Misérables", "Notre-Dame de Paris"]);
  });

  it("ne lance tôt que les livres qu'aucune autre bande ne voit", () => {
    const tiles = [
      { left: 0, width: 600 },
      { left: 400, width: 600 },
    ];
    const books = cleanDetections(
      [
        book({ title: "Seul à gauche", corners: quad(100, 100, 140, 900) }),
        book({ title: "Dans le recouvrement", corners: quad(450, 100, 480, 900) }),
        book({ title: "À cheval sur la limite", corners: quad(380, 100, 420, 900) }),
      ],
      SIZE,
    );
    expect(soloBooks(books, 0, tiles, SIZE.width).map((b) => b.title)).toEqual(["Seul à gauche"]);
    // Ce qui est solo est forcément gardé par la fusion des bandes.
    const merged = mergeTiles([books, cleanDetections([book({ title: "Dans le recouvrement", corners: quad(450, 100, 482, 900) })], SIZE)]);
    expect(merged.map((b) => b.title)).toContain("Seul à gauche");
  });

  it("ne fusionne pas un livre penché avec son voisin d'une autre bande sans mot en commun", () => {
    const tilted = cleanDetections([book({ title: "Germinal", corners: [{ x: 400, y: 100 }, { x: 440, y: 100 }, { x: 560, y: 900 }, { x: 520, y: 900 }] })], SIZE);
    const thin = cleanDetections([book({ title: "Nana", corners: quad(470, 300, 490, 700) })], SIZE);
    expect(mergeTiles([tilted, thin])).toHaveLength(2);
  });

  it("remet les livres dans l'ordre : étagère par étagère, de gauche à droite", () => {
    const b = (title: string, x: number, y: number) => cleanDetections([book({ title, corners: quad(x, y, x + 30, y + 400) })], SIZE)[0];
    const out = readingOrder([b("DD", 100, 1200), b("BB", 300, 100), b("CC", 50, 1180), b("AA", 100, 120)]);
    expect(out.map((x) => x.title)).toEqual(["AA", "BB", "CC", "DD"]);
  });
});
