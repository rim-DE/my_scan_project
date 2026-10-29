import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogUnavailableError, lookupByTitle, parseBnfRecords, lookupCacheKey, normalizeText, parseGoogleVolume, parseOpenLibraryDoc, scoreCandidate, similarity, MIN_MATCH_SCORE } from "../books";

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

  it("un seul mot lu ne suffit pas, sauf avec l'éditeur ou l'auteur", () => {
    const base = { isbn10: null, publishedDate: null, language: "fr", pageCount: null, coverUrl: null, listPriceCents: null, source: "google" as const };
    const osteo = { ...base, isbn13: "9791092847079", title: "Ostéopathie & grossesse", authors: ["Bernard Ferru"], publisher: "TITA éditions" };
    const larousse = { ...base, isbn13: "9782036054134", title: "Le Grand Larousse de la grossesse", authors: [], publisher: "Larousse" };
    expect(scoreCandidate({ title: "Grossesse" }, osteo)).toBeLessThan(MIN_MATCH_SCORE);
    expect(scoreCandidate({ title: "Grossesse", publisher: "Larousse" }, osteo)).toBeLessThan(MIN_MATCH_SCORE);
    expect(scoreCandidate({ title: "Grossesse", publisher: "Larousse" }, larousse)).toBeGreaterThan(MIN_MATCH_SCORE);
    expect(scoreCandidate({ title: "Grossesse", author: "Bernard Ferru" }, osteo)).toBeGreaterThan(MIN_MATCH_SCORE);
    expect(scoreCandidate({ title: "Grossesse" }, { ...osteo, title: "Grossesse" })).toBeGreaterThan(MIN_MATCH_SCORE);
  });

  it("ne prend pas le Petit Larousse pour le Grand, ni un tome pour un autre", () => {
    const base = { isbn13: null, isbn10: null, authors: [], publisher: "Larousse", publishedDate: null, language: "fr", pageCount: null, coverUrl: null, listPriceCents: null, source: "google" as const };
    const petit = { ...base, title: "Le Petit Larousse de la grossesse" };
    const grand = { ...base, title: "Le Grand Larousse de la grossesse" };
    const read = { title: "Grand Larousse de la grossesse", publisher: "Larousse" };
    expect(scoreCandidate(read, petit)).toBe(0);
    expect(scoreCandidate(read, grand)).toBeGreaterThan(0.95);
    expect(scoreCandidate({ title: "Larousse de la grossesse" }, petit)).toBeGreaterThan(MIN_MATCH_SCORE);
    expect(scoreCandidate({ title: "Harry Potter tome 3" }, { ...base, title: "Harry Potter tome 2" })).toBe(0);
    expect(scoreCandidate({ title: "Harry Potter tome 3" }, { ...base, title: "Harry Potter tome 3" })).toBeGreaterThan(0.95);
  });

  it("un mot coupé sur la tranche ne valide pas un autre titre", () => {
    const base = { isbn10: null, publishedDate: null, language: "fr", pageCount: null, coverUrl: null, listPriceCents: null, source: "google" as const, publisher: null };
    const jeux = { ...base, isbn13: null, title: "Les jeux rustiques", authors: ["Louis Beydts"] };
    const bambous = { ...base, isbn13: "9782841382958", title: "Bambous rustiques", authors: ["Paul Whittaker"] };
    expect(scoreCandidate({ title: "mbous rustiques" }, jeux)).toBeLessThan(MIN_MATCH_SCORE);
    expect(scoreCandidate({ title: "mbous rustiques" }, bambous)).toBeGreaterThan(MIN_MATCH_SCORE);
    expect(scoreCandidate({ title: "Bambous rustiques", author: "Paul Whittaker" }, bambous)).toBeGreaterThan(0.95);
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

describe("catalogue de la BnF", () => {
  const record = (body: string) =>
    `<srw:record><srw:recordData><oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/">${body}</oai_dc:dc></srw:recordData></srw:record>`;
  const xml = `<srw:searchRetrieveResponse><srw:records>${record(`
      <dc:title>Sans un mot / Harlan Coben ; traduit de l'anglais (États-Unis) par Roxane Azimi</dc:title>
      <dc:creator>Coben, Harlan (1962-....). Auteur du texte</dc:creator>
      <dc:creator>Azimi, Roxane. Traducteur</dc:creator>
      <dc:publisher>Pocket (Paris)</dc:publisher>
      <dc:date>2010</dc:date>
      <dc:identifier>https://catalogue.bnf.fr/ark:/12148/cb42195467z</dc:identifier>
      <dc:identifier>ISBN 978-2-266-19688-8</dc:identifier>
      <dc:language>fre</dc:language>`)}${record(`
      <dc:title>C'était toi [Texte imprimé] / Mary Higgins Clark</dc:title>
      <dc:creator>Higgins Clark, Mary (1927-2020). Auteur du texte</dc:creator>
      <dc:language>fre</dc:language>`)}</srw:records></srw:searchRetrieveResponse>`;

  it("lit titre, auteurs, éditeur, langue et ISBN des notices", () => {
    const [coben, clark] = parseBnfRecords(xml);
    expect(coben).toMatchObject({
      title: "Sans un mot",
      authors: ["Harlan Coben", "Roxane Azimi"],
      publisher: "Pocket",
      publishedDate: "2010",
      language: "fr",
      isbn13: "9782266196888",
      source: "bnf",
    });
    expect(clark).toMatchObject({ title: "C'était toi", authors: ["Mary Higgins Clark"], isbn13: null });
    expect(scoreCandidate({ title: "Sans un mot", author: "Harlan Coben", language: "fr" }, coben)).toBeGreaterThan(MIN_MATCH_SCORE);
  });

  it("identifie le livre par la BnF quand Google Books sature", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) => (String(url).includes("googleapis") ? new Response("{}", { status: 429 }) : new Response(xml))),
    );
    const p = lookupByTitle({ title: "Sans un mot", author: "Harlan Coben", language: "fr" });
    await vi.runAllTimersAsync();
    expect((await p)?.isbn13).toBe("9782266196888");
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
