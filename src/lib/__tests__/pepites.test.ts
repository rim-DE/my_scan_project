import { afterEach, describe, expect, it, vi } from "vitest";
import { BANDS, MIN_SALES_180, sellsEnough, findPepite, findPepiteByTitle, isAdultTitle, finderSelection, pepiteTitles, indexPepites, isFreshPepite, mergeRows, parseCsv, pepiteResult, pepiteRow, toCsv } from "../pepites";

// Temps Keepa = minutes depuis 2011 ; 2026-10-01 ≈ 8 207 000.
const t = (iso: string) => new Date(iso).getTime() / 60000 - 21564000;
const now = new Date("2026-11-02T00:00:00Z");

const product = {
  asin: "2070360024",
  title: "L'Étranger; édition \"collector\"",
  author: "Albert Camus",
  manufacturer: "Gallimard",
  binding: "Broché",
  publicationDate: 19720115,
  numberOfPages: 186,
  languages: [["Français", "Publié"]],
  eanList: ["9782070360024"],
  imagesCSV: "abc.jpg",
  csv: [
    null,
    [t("2026-01-01"), 5000],
    [t("2026-01-01"), 4200],
    [t("2026-01-01"), 90000, t("2026-09-01"), 30000, t("2026-09-10"), 80000, t("2026-10-01"), 20000],
  ],
  stats: {
    current: [-1, 5000, 4200, 20000, 5500, 0, 0, 0, 0, 0, 0, 3, 7],
    avg90: [-1, 5000, 4100],
    avg180: [-1, 5000, 4000],
    salesRankDrops30: 1,
    salesRankDrops90: 2,
    salesRankDrops180: 4,
    salesRankDrops365: 6,
  },
};

describe("pépites", () => {
  it("transforme une fiche Keepa en ligne", () => {
    const row = pepiteRow(product, now)!;
    expect(row).toMatchObject({
      ean: "9782070360024",
      isbn10: "2070360024",
      annee: "1972",
      langue: "Français",
      prix_neuf: "50,00",
      amazon_vend_neuf: "non",
      prix_editeur: "55,00",
      prix_occasion: "42,00",
      occasion_moy90: "41,00",
      ventes_180j: "4",
      nb_offres_occasion: "7",
      derniere_vente: "2026-10-01",
      dernieres_ventes: "2026-09-01=42,00|2026-10-01=42,00",
      maj: "2026-11-02",
    });
  });

  it("écarte les DVD et les prix d'occasion absurdes", () => {
    expect(pepiteRow({ ...product, binding: "DVD" }, now)).toBeNull();
    const absurd = { ...product, stats: { ...product.stats, current: [-1, 5000, 203900] } };
    expect(pepiteRow(absurd, now)!.prix_occasion).toBe("");
  });

  it("relit le CSV qu'il écrit (guillemets, point-virgule) et fusionne", () => {
    const row = pepiteRow(product, now)!;
    const back = parseCsv(toCsv([row]));
    expect(back).toEqual([row]);
    const merged = mergeRows([{ ...row, prix_occasion: "1,00" }, { ...row, asin: "X" }], [row]);
    expect(merged.map((r) => [r.asin, r.prix_occasion])).toEqual([
      ["2070360024", "42,00"],
      ["X", "42,00"],
    ]);
  });

  it("borne la tranche de prix quand il y a un maximum", () => {
    expect(finderSelection({ min: 2500, max: 3499 }, 0, 100)).toMatchObject({ current_USED_gte: 2500, current_USED_lte: 3499, avg90_NEW_gte: 2500 });
    expect(finderSelection({ min: 3500 }, 0, 100)).not.toHaveProperty("current_USED_lte");
    expect(finderSelection({ min: 3500 }, 0, 100)).toMatchObject({ languages: ["french"], avg180_SALES_lte: 400000 });
    const english = BANDS.find((b) => b.language === "english")!;
    expect(finderSelection(english, 0, 100)).toMatchObject({ languages: ["english"], avg180_SALES_lte: 150000, current_USED_gte: 2500 });
  });

  it("remplace un appel Keepa par la ligne du fichier", () => {
    const row = pepiteRow(product, now)!;
    const r = pepiteResult(row);
    expect(r.observations.map((o) => [o.offerType, o.priceCents])).toEqual([
      ["NEW", 5000],
      ["USED", 4200],
      ["SOLD", 4200],
      ["SOLD", 4200],
    ]);
    expect(r.observations[2].observedAt?.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(r.sales).toEqual({ sales30d: 1, sales12m: 6 });
    expect(r.info).toMatchObject({ offerCount: 7, salesRank: 20000, listPriceCents: 5500 });
    expect(r.info).not.toHaveProperty("rating");
    expect(isFreshPepite(row, new Date("2026-11-10"))).toBe(true);
    expect(isFreshPepite(row, new Date("2026-11-25"))).toBe(false);
  });

  it("retrouve un livre du fichier par ISBN-13 ou ASIN", () => {
    const index = indexPepites([pepiteRow(product, now)!]);
    expect(findPepite(index, { isbn13: "9782070360024" })?.asin).toBe("2070360024");
    expect(findPepite(index, { isbn13: null, asin: "2070360024" })).not.toBeNull();
    expect(findPepite(index, { isbn13: "9780000000000" })).toBeNull();
  });
});

describe("mode rapide", () => {
  const book = { isbn13: "9780000000000", isbn10: null, asin: null };
  afterEach(() => vi.unstubAllEnvs());

  it("ne demande pas les prix d'un livre hors liste, sauf PEPITES_ONLY=false", async () => {
    const { wantsPrices } = await import("../prices");
    expect(wantsPrices(book)).toBe(false);
    vi.stubEnv("PEPITES_ONLY", "false");
    expect(wantsPrices(book)).toBe(true);
  });
});

describe("reconnaissance par le titre", () => {
  const base = pepiteRow(product, now)!;
  const row = (titre: string, auteur: string, asin: string) => ({ ...base, titre, auteur, asin });
  const titles = pepiteTitles([
    row("Frieren T14 - édition collector", "Kanehito Yamada", "A1"),
    row("Frieren T13", "Kanehito Yamada", "A2"),
    row("Dicobat visuel: Dictionnaire illustré du bâtiment", "Jean de Vigan", "A3"),
    row("Paris", "Collectif", "A4"),
    row("La Chambre claire : Note sur la photographie", "Roland Barthes", "A5"),
    row("La Philosophie Pour les Nuls, Nouvelle édition augmentée", "Christian Godin", "A6"),
  ]);
  const find = (t: string, a?: string) => findPepiteByTitle(titles, t, a)?.asin ?? null;

  it("retrouve la bonne pépite, même tome", () => {
    expect(find("Frieren 14", "Yamada")).toBe("A1");
    expect(find("FRIEREN T13", "Kanehito Yamada")).toBe("A2");
    expect(find("Dicobat visuel", "J. de Vigan")).toBe("A3");
    expect(find("Dicobat visuel")).toBe("A3");
    // Nom de l'auteur écrit sur la tranche avec le titre, mention d'édition absente de la tranche.
    expect(find("Roland Barthes LA CHAMBRE CLAIRE")).toBe("A5");
    expect(find("La Philosophie POUR LES NULS")).toBe("A6");
  });

  it("refuse les correspondances douteuses", () => {
    expect(find("Frieren")).toBeNull(); // quel tome ?
    expect(find("Frieren 15", "Yamada")).toBeNull();
    expect(find("Dicobat visuel", "Dupont")).toBeNull(); // autre auteur
    expect(find("Paris")).toBeNull(); // un seul mot, sans auteur
    expect(find("Le guide de Paris", "Collectif")).toBeNull(); // « guide » absent du titre
  });
});

describe("livres pour adultes", () => {
  it("écarte les titres érotiques, pas les autres", () => {
    for (const t of ["Coffret Sexy Cosplay Doll T15", "Contes érotiques", "Erotisme et littérature", "Hentai collection", "Le Kama Sutra illustré"]) {
      expect(isAdultTitle(t)).toBe(true);
    }
    for (const t of ["Pérotin et l'école de Notre-Dame", "Essex : histoire d'un comté", "Frieren T14", "Le syndrome de Peter Pan"]) {
      expect(isAdultTitle(t)).toBe(false);
    }
  });

  it("exclut les catégories érotiques de la recherche Keepa", () => {
    expect(finderSelection({ min: 1000, max: 1499 }, 0, 500).categories_exclude).toContain(588062);
  });
});

describe("règle de ventes", () => {
  it("garde les livres vendus au moins 3 fois en 6 mois", () => {
    expect(MIN_SALES_180).toBe(3);
    expect(sellsEnough({ ventes_180j: "3" } as never)).toBe(true);
    expect(sellsEnough({ ventes_180j: "2" } as never)).toBe(false);
    expect(sellsEnough({ ventes_180j: "" } as never)).toBe(false);
  });
});
