import { describe, expect, it } from "vitest";
import { pickKeepaMatch } from "../prices/providers/keepa";

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
