import { describe, expect, it } from "vitest";
import { finderSelection, mergeRows, parseCsv, pepiteRow, toCsv } from "../pepites";

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
  });
});
