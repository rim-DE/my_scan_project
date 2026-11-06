import { describe, expect, it } from "vitest";
import { cleanDetections, DetectionResultSchema, mergeTiles, readingOrder, soloBooks, tightenBoxes, tileLayout, type CleanDetection, type DetectedBook } from "../vision";

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
  it("coupe les grandes photos en morceaux qui se recouvrent et couvrent toute la photo", () => {
    expect(tileLayout(800, 1000)).toEqual([{ left: 0, width: 800 }]);
    for (const [w, h, cols, rows] of [
      [3000, 4000, 2, 3], // bibliothèque en portrait : 6 morceaux d'environ 40 livres
      [1456, 2576, 2, 3],
      [2576, 1456, 3, 2],
      [2000, 1000, 3, 1],
    ]) {
      const tiles = tileLayout(w, h);
      expect(tiles).toHaveLength(cols * rows);
      expect(Math.max(...tiles.map((t) => t.left + t.width))).toBe(w);
      expect(Math.min(...tiles.map((t) => t.left))).toBe(0);
      if (rows > 1) {
        expect(Math.min(...tiles.map((t) => t.top!))).toBe(0);
        expect(Math.max(...tiles.map((t) => t.top! + t.height!))).toBe(h);
        // Deux rangées voisines se recouvrent d'au moins 20 % de la hauteur (un livre debout entier).
        const tops = [...new Set(tiles.map((t) => t.top!))].sort((a, b) => a - b);
        expect(tops[0] + tiles[0].height! - tops[1]).toBeGreaterThanOrEqual(Math.round(h * 0.2));
      }
      const lefts = [...new Set(tiles.map((t) => t.left))].sort((a, b) => a - b);
      for (let i = 1; i < lefts.length; i++) expect(lefts[i - 1] + tiles[0].width - lefts[i]).toBeGreaterThanOrEqual(Math.round(w * 0.15));
    }
  });

  it("ne lance tôt que les livres qu'aucun autre morceau ne voit, aussi en hauteur", () => {
    const tiles = [
      { left: 0, width: 1000, top: 0, height: 600 },
      { left: 0, width: 1000, top: 400, height: 600 },
    ];
    const books = cleanDetections(
      [book({ title: "En haut", corners: quad(100, 50, 140, 350) }), book({ title: "Entre deux", corners: quad(300, 350, 340, 550) })],
      SIZE,
    );
    expect(soloBooks(books, 0, tiles, SIZE.width, SIZE.height).map((b) => b.title)).toEqual(["En haut"]);
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

  it("garde une seule fois un titre lu par deux morceaux même si les rectangles sont décalés", () => {
    const a = cleanDetections([book({ title: "SERVICES SPÉCIAUX", corners: quad(400, 100, 440, 900) })], SIZE);
    const b = cleanDetections([book({ title: "Services spéciaux", corners: quad(430, 500, 470, 1300) })], SIZE);
    expect(mergeTiles([a, b])).toHaveLength(1);
    const c = cleanDetections([book({ title: "Bonsaï", corners: quad(405, 150, 440, 850) })], SIZE);
    const d = cleanDetections([book({ title: "Bonsaï d'intérieur", corners: quad(400, 100, 440, 900) })], SIZE);
    expect(mergeTiles([c, d]).map((x) => x.title)).toEqual(["Bonsaï d'intérieur"]);
  });

  it("garde deux exemplaires du même titre rangés à deux endroits", () => {
    const a = cleanDetections([book({ title: "La Belle Époque", corners: quad(100, 100, 140, 900) })], SIZE);
    const b = cleanDetections([book({ title: "La Belle Époque", corners: quad(600, 100, 640, 900) })], SIZE);
    expect(mergeTiles([a, b])).toHaveLength(2);
  });

  it("remet les livres dans l'ordre : étagère par étagère, de gauche à droite", () => {
    const b = (title: string, x: number, y: number) => cleanDetections([book({ title, corners: quad(x, y, x + 30, y + 400) })], SIZE)[0];
    const out = readingOrder([b("DD", 100, 1200), b("BB", 300, 100), b("CC", 50, 1180), b("AA", 100, 120)]);
    expect(out.map((x) => x.title)).toEqual(["AA", "BB", "CC", "DD"]);
  });
});

describe("tightenBoxes", () => {
  const size = { width: 1000, height: 1000 };
  const book = (title: string, x: number, w: number, shelf = 1, y = 0.1, h = 0.3): CleanDetection => ({
    shelf,
    title,
    author: null,
    publisher: null,
    isbn: null,
    corners: [],
    text_direction: "bottom_to_top",
    confidence: "high",
    bbox: { x, y, w, h },
    polygon: null,
  });

  it("ramène un rectangle qui couvre plusieurs livres à la place laissée par ses voisins", () => {
    const books = [book("A", 0.1, 0.02), book("B", 0.12, 0.02), book("Gros", 0.1, 0.1), book("C", 0.14, 0.02), book("D", 0.3, 0.02)];
    tightenBoxes(books, size);
    const fat = books[2].bbox!;
    expect(fat.x).toBeCloseTo(0.16);
    expect(fat.w).toBeCloseTo(0.04);
    expect(books[2].polygon).toHaveLength(4);
  });

  it("coupe au milieu le petit chevauchement de deux tranches voisines", () => {
    const books = [book("A", 0.1, 0.03), book("B", 0.12, 0.03), book("C", 0.5, 0.03)];
    tightenBoxes(books, size);
    expect(books[0].bbox!.x + books[0].bbox!.w).toBeCloseTo(0.125);
    expect(books[1].bbox!.x).toBeCloseTo(0.125);
  });

  it("laisse tranquille un gros livre sans voisin qui le chevauche", () => {
    const books = [book("A", 0.1, 0.02), book("B", 0.13, 0.02), book("Encyclopédie", 0.2, 0.1), book("C", 0.4, 0.02)];
    tightenBoxes(books, size);
    const b = books[2].bbox!;
    expect([b.x, b.y, b.w, b.h].map((v) => Math.round(v * 1000) / 1000)).toEqual([0.2, 0.1, 0.1, 0.3]);
  });
});

describe("tightenBoxes sans deviner", () => {
  const size = { width: 1000, height: 1000 };
  const book = (title: string, x: number, w: number): CleanDetection => ({
    shelf: 1,
    title,
    author: null,
    publisher: null,
    isbn: null,
    corners: [],
    text_direction: "bottom_to_top",
    confidence: "high",
    bbox: { x, y: 0.1, w, h: 0.3 },
    polygon: null,
  });

  it("laisse tel quel un gros rectangle entièrement couvert par ses voisins (pas de livre du milieu)", () => {
    const books = [book("A", 0.1, 0.02), book("B", 0.12, 0.02), book("C", 0.14, 0.02), book("Gros", 0.1, 0.06), book("D", 0.3, 0.02)];
    tightenBoxes(books, size);
    expect(books[3].bbox!.x).toBeCloseTo(0.1);
    expect(books[3].bbox!.w).toBeCloseTo(0.06);
  });

  it("laisse tel quel un gros rectangle quand la place libre est trop large pour un seul livre", () => {
    const books = [book("A", 0.1, 0.02), book("Gros", 0.1, 0.12), book("C", 0.3, 0.02), book("D", 0.4, 0.02)];
    tightenBoxes(books, size);
    expect(books[1].bbox!.w).toBeCloseTo(0.12);
  });
});
