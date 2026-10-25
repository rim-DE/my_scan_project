import { describe, expect, it } from "vitest";
import { lookupCacheKey, normalizeText, parseGoogleVolume, parseOpenLibraryDoc, scoreCandidate, similarity, MIN_MATCH_SCORE } from "../books";

describe("identification des livres", () => {
  it("normalise le texte (accents, ponctuation)", () => {
    expect(normalizeText("L'Admirable Machine Humaine !")).toBe("l admirable machine humaine");
    expect(normalizeText("Société")).toBe("societe");
  });

  it("mesure la similarité des titres", () => {
    expect(similarity("L'admirable machine humaine", "L'Admirable Machine humaine")).toBe(1);
    expect(similarity("Les lieux communs d'aujourd'hui", "Rester en vie")).toBe(0);
    expect(similarity("James Bond n'existe pas", "James Bond n'existe pas : roman")).toBeGreaterThan(0.8);
  });

  it("tient compte de l'auteur", () => {
    const c = { isbn13: "9782070368228", isbn10: null, title: "Rester en vie", authors: ["Matt Haig"], publisher: null, publishedDate: null, language: null, pageCount: null, coverUrl: null, listPriceCents: null, source: "google" as const };
    expect(scoreCandidate({ title: "Rester en vie", author: "Matt Haig" }, c)).toBeGreaterThan(0.95);
    expect(scoreCandidate({ title: "Rester en vie", author: "Quelqu'un d'autre" }, c)).toBeGreaterThan(MIN_MATCH_SCORE);
    expect(scoreCandidate({ title: "Pirates corsaires et flibustiers", author: null }, c)).toBeLessThan(MIN_MATCH_SCORE);
  });

  it("lit une réponse Google Books", () => {
    const b = parseGoogleVolume({
      volumeInfo: {
        title: "Celtic Tales",
        subtitle: "Fairy Tales and Stories of Enchantment",
        authors: ["Kate Forrester"],
        publisher: "Chronicle Books",
        industryIdentifiers: [
          { type: "ISBN_10", identifier: "145215175X" },
          { type: "ISBN_13", identifier: "9781452151755" },
        ],
        imageLinks: { thumbnail: "http://books.google.com/x.jpg" },
      },
      saleInfo: { listPrice: { amount: 25, currencyCode: "EUR" } },
    });
    expect(b).toMatchObject({
      isbn13: "9781452151755",
      isbn10: "145215175X",
      title: "Celtic Tales : Fairy Tales and Stories of Enchantment",
      coverUrl: "https://books.google.com/x.jpg",
      listPriceCents: 2500,
    });
  });

  it("lit une réponse Open Library", () => {
    const b = parseOpenLibraryDoc({ title: "Rester en vie", author_name: ["Matt Haig"], isbn: ["notanisbn", "9782070368228"], cover_i: 42 });
    expect(b).toMatchObject({ isbn13: "9782070368228", coverUrl: "https://covers.openlibrary.org/b/id/42-M.jpg" });
  });

  it("clé de cache stable", () => {
    expect(lookupCacheKey("Rester EN vie", "Matt Haig", "fr")).toBe(lookupCacheKey("rester en vie ", "matt haig", "fr"));
  });
});
