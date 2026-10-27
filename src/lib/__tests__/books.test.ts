import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogUnavailableError, lookupByTitle, lookupCacheKey, normalizeText, parseGoogleVolume, parseOpenLibraryDoc, scoreCandidate, similarity, MIN_MATCH_SCORE } from "../books";

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

  it("préfère l'édition dans la langue du scan", () => {
    const base = { isbn10: null, authors: ["Nicolas Vanier"], publisher: null, publishedDate: null, pageCount: null, coverUrl: null, listPriceCents: null, source: "google" as const };
    const polish = { ...base, isbn13: "9788381880466", title: "Bella i Sebastian - Nicolas Vanier [KSIĄŻKA]", language: "pl" };
    // Seul le nom de l'auteur était lisible sur la tranche : il ne suffit pas à valider une édition dont le titre le contient.
    expect(scoreCandidate({ title: "Nicolas Vanier", language: "fr" }, polish)).toBeLessThan(MIN_MATCH_SCORE);
    expect(scoreCandidate({ title: "Nicolas Vanier", author: "Nicolas Vanier", language: "fr" }, polish)).toBeLessThan(MIN_MATCH_SCORE);
    // ... même quand le catalogue ne donne pas (ou mal) la langue de l'édition.
    expect(scoreCandidate({ title: "Nicolas Vanier", author: "Nicolas Vanier", language: "fr" }, { ...polish, language: null })).toBeLessThan(MIN_MATCH_SCORE);
    const french = { ...base, isbn13: "9782081297159", title: "Belle et Sébastien", language: "fr" };
    const englishTitle = { ...french, language: "en" };
    expect(scoreCandidate({ title: "Belle et Sébastien", author: "Nicolas Vanier", language: "fr" }, french)).toBeGreaterThan(
      scoreCandidate({ title: "Belle et Sébastien", author: "Nicolas Vanier", language: "fr" }, englishTitle),
    );
    // Un livre en anglais sur une étagère française reste identifiable si le titre correspond bien.
    expect(scoreCandidate({ title: "Belle et Sébastien", author: "Nicolas Vanier", language: "fr" }, englishTitle)).toBeGreaterThan(MIN_MATCH_SCORE);
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
    const b = parseOpenLibraryDoc({ title: "Rester en vie", author_name: ["Matt Haig"], isbn: ["notanisbn", "9782070368228"], cover_i: 42, language: ["fre"] });
    expect(b).toMatchObject({ isbn13: "9782070368228", coverUrl: "https://covers.openlibrary.org/b/id/42-M.jpg", language: "fr" });
  });

  it("clé de cache stable", () => {
    expect(lookupCacheKey("Rester EN vie", "Matt Haig", "fr")).toBe(lookupCacheKey("rester en vie ", "matt haig", "fr"));
  });
});

describe("recherche par titre quand Google Books sature", () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const volume = { volumeInfo: { title: "Sans un mot", authors: ["Harlan Coben"], language: "fr", industryIdentifiers: [{ type: "ISBN_13", identifier: "9782266215893" }] } };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("réessaie après un 429 au lieu de conclure « non identifié »", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(json({}, 429)).mockResolvedValueOnce(json({ items: [volume] }));
    vi.stubGlobal("fetch", fetchMock);
    const p = lookupByTitle({ title: "Sans un mot", author: "Harlan Coben", language: "fr" });
    await vi.runAllTimersAsync();
    expect((await p)?.isbn13).toBe("9782266215893");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ne renvoie pas « introuvable » (mis en cache) quand Google reste saturé et qu'Open Library ne trouve rien", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) => (String(url).includes("googleapis") ? json({}, 429) : json({ docs: [] }))),
    );
    const p = lookupByTitle({ title: "Sans un mot", author: "Harlan Coben", language: "fr" });
    const check = expect(p).rejects.toBeInstanceOf(CatalogUnavailableError);
    await vi.runAllTimersAsync();
    await check;
  });
});
