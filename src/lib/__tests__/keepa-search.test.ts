import { describe, expect, it } from "vitest";
import { keepaBookInfo, pickKeepaMatch, romanOrdinal } from "../prices/providers/keepa";

const book = { title: "Dictionnaire des mots, des phrases, des images", authors: ["Aimé Gabillon"] };

describe("pickKeepaMatch (livres sans ISBN)", () => {
  it("prend la fiche dont le titre et l'auteur correspondent", () => {
    const p = pickKeepaMatch(book, [
      { asin: "X1", title: "Dictionnaire des synonymes", author: "Gabillon" },
      { asin: "X2", title: "Dictionnaire des mots, des phrases, des images", author: "Aimé Gabillon" },
    ]);
    expect(p?.asin).toBe("X2");
  });
  it("accepte l'auteur écrit dans le titre Amazon", () => {
    expect(pickKeepaMatch(book, [{ asin: "X3", title: "Dictionnaire des mots des phrases des images - Gabillon" }])?.asin).toBe("X3");
  });
  it("refuse un autre auteur ou un titre trop différent", () => {
    expect(pickKeepaMatch(book, [{ asin: "X4", title: "Dictionnaire des mots, des phrases, des images", author: "Dupont" }])).toBeNull();
    expect(pickKeepaMatch(book, [{ asin: "X5", title: "Dictionnaire des images", author: "Gabillon" }])).toBeNull();
  });
});

describe("pickKeepaMatch (autre édition)", () => {
  it("relie XXIe à 21e et prend l'édition la plus vendue", () => {
    const kit = { title: "Le Kit du XXIe siècle", authors: ["François Reynaert", "Vincent Brocvielle"] };
    const p = pickKeepaMatch(kit, [
      { asin: "A", title: "Le kit du 21e siècle", author: "Reynaert", stats: { current: [0, 0, 0, 900000] } },
      { asin: "B", title: "Le kit du 21e siècle (poche)", author: "François Reynaert", stats: { current: [0, 0, 0, 120000] } },
      { asin: "C", title: "Le kit du 21e siècle", author: "Reynaert" },
    ]);
    expect(p?.asin).toBe("B");
  });
});

describe("romanOrdinal", () => {
  it("convertit les siècles en chiffres romains", () => {
    expect(romanOrdinal("xxie")).toBe("21e");
    expect(romanOrdinal("xixe")).toBe("19e");
    expect(romanOrdinal("siecle")).toBe("siecle");
  });
});

describe("keepaBookInfo (identification par Amazon)", () => {
  it("lit le titre sans la mention de format, les auteurs et l'ISBN", () => {
    const info = keepaBookInfo({
      title: "Survivre sans écrans (quand on est ado) - Broché",
      author: "Jean Dupont, Marie Durand",
      eanList: ["3000000000001", "9782000000001"],
    });
    expect(info?.title).toBe("Survivre sans écrans (quand on est ado)");
    expect(info?.authors).toEqual(["Jean Dupont", "Marie Durand"]);
    expect(info?.isbn13).toBe("9782000000001");
  });
});
