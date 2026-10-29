// Identification d'un livre : Google Books en priorité, puis la BnF (très complète pour les livres français),
// puis Open Library.
// Les deux sont des API publiques et gratuites, autorisées pour cet usage.
import { normalizeIsbn } from "./isbn";
import { env } from "./env";

export interface BookInfo {
  isbn13: string | null;
  isbn10: string | null;
  title: string;
  authors: string[];
  publisher: string | null;
  publishedDate: string | null;
  language: string | null;
  pageCount: number | null;
  coverUrl: string | null;
  listPriceCents: number | null;
  source: "google" | "bnf" | "sudoc" | "openlibrary" | "amazon";
}

// ---------- Similarité de titres ----------

export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set(["le", "la", "les", "de", "des", "du", "un", "une", "et", "the", "of", "a", "an", "and", "l", "d"]);

function tokens(s: string): Set<string> {
  return new Set(normalizeText(s).split(" ").filter((t) => t.length > 0 && !STOP.has(t)));
}

/** Score entre 0 et 1 : proportion de mots communs (Dice). */
export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return (2 * common) / (ta.size + tb.size);
}

/** Pénalité quand l'édition trouvée n'est pas dans la langue des livres scannés (ex. édition polonaise d'un livre français). */
export const OTHER_LANGUAGE_PENALTY = 0.15;

/** Similarité des titres sans les mots du nom de l'auteur : un titre lu qui n'est que le nom de l'auteur ne prouve rien. */
export function titleSimilarity(queryTitle: string, candidateTitle: string, authorNames: string[]): number {
  const names = new Set(authorNames.flatMap((n) => [...tokens(n)]));
  const strip = (t: string) => [...tokens(t)].filter((w) => !names.has(w)).join(" ");
  return similarity(strip(queryTitle), strip(candidateTitle));
}

type TitleQuery = { title: string; author?: string | null; publisher?: string | null; language?: string | null };

/** L'éditeur lu sur la tranche correspond à celui de la fiche (ou apparaît dans son titre : « Le Grand Larousse de… »). */
function publisherMatches(read: string, c: BookInfo): boolean {
  const words = [...tokens(read)].filter((w) => w.length > 2 && !["editions", "edition", "ed"].includes(w));
  const found = tokens(`${c.publisher ?? ""} ${c.title}`);
  return words.some((w) => found.has(w));
}

/**
 * Part des mots lus présents dans le titre trouvé. Un mot coupé par le bord de la tranche (« mbous ») compte
 * s'il termine ou commence un mot du titre (« bambous »).
 */
export function wordCoverage(readWords: string[], candidateTitle: string): number {
  const found = [...tokens(candidateTitle)];
  const hit = (w: string) => found.some((f) => f === w || (w.length >= 4 && (f.endsWith(w) || f.startsWith(w))));
  return readWords.filter(hit).length / readWords.length;
}

/** Mots qui distinguent deux livres différents de la même collection (« Le Grand Larousse… » / « Le Petit Larousse… »). */
const VARIANT_WORDS = new Set(["petit", "petite", "grand", "grande", "mini", "maxi", "junior", "little", "big", "great", "small", "pocket", "poche"]);

/**
 * Le titre trouvé contredit le titre lu : il porte un autre qualificatif (« petit » au lieu de « grand »)
 * ou un autre numéro (« tome 2 » au lieu de « tome 3 »), sans celui qui a été lu.
 */
export function contradictsTitle(readTitle: string, candidateTitle: string): boolean {
  const read = tokens(readTitle);
  const found = tokens(candidateTitle);
  const clash = (isKind: (w: string) => boolean) => {
    const r = [...read].filter(isKind);
    const f = [...found].filter(isKind);
    return r.length > 0 && f.length > 0 && !r.some((w) => found.has(w));
  };
  return clash((w) => VARIANT_WORDS.has(w)) || clash((w) => /^\d+$/.test(w));
}

/** Titre sans son sous-titre : « Tout savoir pour maigrir: Ces vérités… » → « Tout savoir pour maigrir ». */
export function mainTitle(title: string): string {
  return title.split(/\s*[:(]|\s+[-–]\s+|\s*[.;]\s+/)[0].trim() || title;
}

export function scoreCandidate(query: TitleQuery, c: BookInfo): number {
  if (contradictsTitle(query.title, c.title)) return 0;
  const authorNames = query.author ? [query.author, ...c.authors] : c.authors;
  // Amazon et la BnF collent souvent le sous-titre au titre : on compare aussi au titre seul.
  const main = mainTitle(c.title);
  const titleScore = Math.max(titleSimilarity(query.title, c.title, authorNames), titleSimilarity(query.title, main, authorNames));
  const authorScore = query.author && c.authors.length > 0 ? Math.max(...c.authors.map((x) => similarity(query.author!, x))) : null;
  const sameEditor = query.publisher ? publisherMatches(query.publisher, c) : false;
  // Un seul mot lu (« Grossesse ») se retrouve dans des dizaines de titres : il faut le titre exact,
  // ou bien l'auteur ou l'éditeur lus sur la tranche pour confirmer.
  const names = new Set(authorNames.flatMap((n) => [...tokens(n)]));
  const readWords = [...tokens(query.title)].filter((w) => !names.has(w));
  const authorOk = authorScore !== null && authorScore >= 0.5;
  if (readWords.length === 1 && titleScore < 1 && !sameEditor && !authorOk) return 0;
  // Sans auteur pour confirmer, les deux tiers des mots lus doivent être dans le titre trouvé :
  // « …mbous rustiques » ne doit pas devenir « Les jeux rustiques ».
  // Sauf quand le titre trouvé (au moins 2 mots) est entièrement dans ce qui a été lu : deux tranches voisines
  // lues ensemble (« Aikido Initiation Leçons d'aïkido ») contiennent bien « Aikido : Initiation ».
  const mainWords = [...tokens(main)].filter((w) => !names.has(w));
  const contained = mainWords.length >= 2 && wordCoverage(mainWords, readWords.join(" ")) === 1;
  if (!authorOk && !contained && readWords.length > 1 && wordCoverage(readWords, c.title) < 2 / 3) return 0;
  let score = titleScore;
  if (authorScore !== null) score = score * 0.75 + authorScore * 0.25;
  if (sameEditor) score += 0.1;
  if (c.isbn13) score += 0.02; // léger bonus si on a un ISBN exploitable
  if (query.language && c.language && c.language !== query.language) score -= OTHER_LANGUAGE_PENALTY;
  return score;
}

export const MIN_MATCH_SCORE = 0.45;

// ---------- Google Books ----------

interface GoogleVolume {
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    language?: string;
    pageCount?: number;
    industryIdentifiers?: { type: string; identifier: string }[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
  saleInfo?: { listPrice?: { amount?: number; currencyCode?: string } };
}

export function parseGoogleVolume(v: GoogleVolume): BookInfo | null {
  const info = v.volumeInfo;
  if (!info?.title) return null;
  const ids = info.industryIdentifiers ?? [];
  const raw13 = ids.find((i) => i.type === "ISBN_13")?.identifier;
  const raw10 = ids.find((i) => i.type === "ISBN_10")?.identifier;
  const norm = normalizeIsbn(raw13 ?? raw10 ?? "");
  const cover = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null;
  const lp = v.saleInfo?.listPrice;
  return {
    isbn13: norm?.isbn13 ?? null,
    isbn10: norm?.isbn10 ?? raw10 ?? null,
    title: info.subtitle ? `${info.title} : ${info.subtitle}` : info.title,
    authors: info.authors ?? [],
    publisher: info.publisher ?? null,
    publishedDate: info.publishedDate ?? null,
    language: info.language ?? null,
    pageCount: info.pageCount ?? null,
    coverUrl: cover ? cover.replace(/^http:/, "https:") : null,
    listPriceCents: lp?.amount && lp.currencyCode === "EUR" ? Math.round(lp.amount * 100) : null,
    source: "google",
  };
}

async function googleSearch(q: string, lang?: string): Promise<BookInfo[]> {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", "10");
  url.searchParams.set("printType", "books");
  if (lang) url.searchParams.set("langRestrict", lang);
  const key = env.googleBooksApiKey();
  if (key) url.searchParams.set("key", key);
  // Pendant un scan, beaucoup de recherches partent en même temps : Google répond parfois 429 (trop de requêtes).
  // On réessaie alors 2 fois en patientant un peu, au lieu de conclure « non identifié ».
  let res = await fetch(url, { cache: "no-store" });
  for (const wait of [1500, 4000]) {
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, wait + Math.random() * 1000));
    res = await fetch(url, { cache: "no-store" });
  }
  if (!res.ok) throw new Error(`Google Books HTTP ${res.status}`);
  const json = (await res.json()) as { items?: GoogleVolume[] };
  return (json.items ?? []).map(parseGoogleVolume).filter((b): b is BookInfo => b !== null);
}

// ---------- Open Library ----------

interface OpenLibraryDoc {
  title?: string;
  author_name?: string[];
  publisher?: string[];
  first_publish_year?: number;
  isbn?: string[];
  cover_i?: number;
  language?: string[];
  number_of_pages_median?: number;
}

// Open Library donne des codes à 3 lettres (MARC) ; Google Books et l'appli utilisent ceux à 2 lettres.
const MARC_LANGUAGES: Record<string, string> = { fre: "fr", eng: "en", ger: "de", spa: "es", ita: "it", por: "pt", dut: "nl", pol: "pl" };

export function parseOpenLibraryDoc(d: OpenLibraryDoc): BookInfo | null {
  if (!d.title) return null;
  const isbns = (d.isbn ?? []).map((i) => normalizeIsbn(i)).filter((x) => x !== null);
  const best = isbns.find((x) => x!.isbn13.startsWith("978") || x!.isbn13.startsWith("979")) ?? null;
  return {
    isbn13: best?.isbn13 ?? null,
    isbn10: best?.isbn10 ?? null,
    title: d.title,
    authors: d.author_name ?? [],
    publisher: d.publisher?.[0] ?? null,
    publishedDate: d.first_publish_year ? String(d.first_publish_year) : null,
    language: d.language?.[0] ? (MARC_LANGUAGES[d.language[0]] ?? d.language[0]) : null,
    pageCount: d.number_of_pages_median ?? null,
    coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
    listPriceCents: null,
    source: "openlibrary",
  };
}

async function openLibrarySearch(params: Record<string, string>): Promise<BookInfo[]> {
  const url = new URL("https://openlibrary.org/search.json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("limit", "10");
  url.searchParams.set("fields", "title,author_name,publisher,first_publish_year,isbn,cover_i,language,number_of_pages_median");
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "biblioscan-perso/0.1" } });
  if (!res.ok) throw new Error(`Open Library HTTP ${res.status}`);
  const json = (await res.json()) as { docs?: OpenLibraryDoc[] };
  return (json.docs ?? []).map(parseOpenLibraryDoc).filter((b): b is BookInfo => b !== null);
}

// ---------- BnF (catalogue général de la Bibliothèque nationale de France) ----------
// API SRU publique et gratuite : https://api.bnf.fr/fr/api-sru-catalogue-general

const xmlText = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();

/** Lit les notices Dublin Core renvoyées par la BnF. */
export function parseBnfRecords(xml: string): BookInfo[] {
  const out: BookInfo[] = [];
  for (const [, rec] of xml.matchAll(/<oai_dc:dc[^>]*>([\s\S]*?)<\/oai_dc:dc>/g)) {
    const all = (tag: string) => [...rec.matchAll(new RegExp(`<dc:${tag}[^>]*>([\\s\\S]*?)<\\/dc:${tag}>`, "g"))].map((m) => xmlText(m[1]));
    const rawTitle = all("title")[0];
    if (!rawTitle) continue;
    // « Sans un mot / Harlan Coben ; traduit de l'anglais… » → « Sans un mot »
    const title = rawTitle.split(" / ")[0].replace(/\s*\[[^\]]*\]\s*/g, " ").trim();
    // « Coben, Harlan (1962-....). Auteur du texte » → « Harlan Coben »
    const authors = all("creator").map((c) => {
      const name = c.replace(/\s*\(.*$/, "").replace(/\.\s*[A-ZÉ][^.]*$/, "").trim();
      const [last, first] = name.split(",").map((x) => x.trim());
      return first ? `${first} ${last}` : last;
    });
    const isbnRaw = all("identifier")
      .map((id) => /ISBN\s*([\dXx-]{10,17})/.exec(id)?.[1])
      .find((x): x is string => !!x);
    const norm = isbnRaw ? normalizeIsbn(isbnRaw) : null;
    const publisher = all("publisher")[0]?.replace(/\s*\(.*$/, "") ?? null;
    const lang = all("language")[0];
    out.push({
      isbn13: norm?.isbn13 ?? null,
      isbn10: norm?.isbn10 ?? null,
      title,
      authors,
      publisher,
      publishedDate: all("date")[0] ?? null,
      language: lang ? (MARC_LANGUAGES[lang] ?? lang) : null,
      pageCount: null,
      coverUrl: null,
      listPriceCents: null,
      source: "bnf",
    });
  }
  return out;
}

async function bnfSearch(title: string, author?: string | null): Promise<BookInfo[]> {
  const q = (s: string) => `"${s.replace(/"/g, " ")}"`;
  const url = new URL("https://catalogue.bnf.fr/api/SRU");
  url.searchParams.set("version", "1.2");
  url.searchParams.set("operation", "searchRetrieve");
  url.searchParams.set("query", `bib.title all ${q(title)}` + (author ? ` and bib.author all ${q(author)}` : ""));
  url.searchParams.set("recordSchema", "dublincore");
  url.searchParams.set("maximumRecords", "15");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`BnF HTTP ${res.status}`);
  // Sans ISBN, pas de prix possible : on garde d'abord les éditions qui en ont un.
  const found = parseBnfRecords(await res.text());
  const withIsbn = found.filter((b) => b.isbn13);
  return withIsbn.length ? withIsbn : found;
}

// ---------- Sudoc (catalogue des bibliothèques universitaires françaises) ----------
// API SRU publique et gratuite : https://abes.fr/guide-utilisation-service-sru-catalogue-sudoc (notices UNIMARC).

/** Lit les notices UNIMARC du Sudoc : 010 ISBN, 101 langue, 200 titre, 210/214 éditeur et date, 700/701 auteurs. */
export function parseSudocRecords(xml: string): BookInfo[] {
  const out: BookInfo[] = [];
  for (const [, rec] of xml.matchAll(/<record(?:\s[^>]*)?>([\s\S]*?)<\/record>/g)) {
    const fields = (tag: string) =>
      [...rec.matchAll(new RegExp(`<datafield[^>]*tag="${tag}"[^>]*>([\\s\\S]*?)<\\/datafield>`, "g"))].map((m) => m[1]);
    const sub = (field: string | undefined, code: string) =>
      field ? [...field.matchAll(new RegExp(`<subfield[^>]*code="${code}"[^>]*>([\\s\\S]*?)<\\/subfield>`, "g"))].map((m) => xmlText(m[1])) : [];
    // Le Sudoc entoure les articles ignorés au tri de caractères de contrôle (« ˜Les˜ chats ») : on les enlève.
    const clean = (s: string) => s.replace(/[\u0098\u009c]/g, "").replace(/\s+/g, " ").trim();
    const title = clean(sub(fields("200")[0], "a")[0] ?? "");
    if (!title) continue;
    const isbn = fields("010")
      .flatMap((f) => sub(f, "a"))
      .map((i) => normalizeIsbn(i))
      .find((x) => x !== null);
    const authors = [...fields("700"), ...fields("701")].map((f) => [sub(f, "b")[0], sub(f, "a")[0]].filter(Boolean).join(" ").trim()).filter(Boolean);
    const pub = fields("214")[0] ?? fields("210")[0];
    const lang = sub(fields("101")[0], "a")[0];
    out.push({
      isbn13: isbn?.isbn13 ?? null,
      isbn10: isbn?.isbn10 ?? null,
      title,
      authors,
      publisher: sub(pub, "c")[0] ?? null,
      publishedDate: sub(pub, "d")[0]?.replace(/\D/g, "").slice(0, 4) || null,
      language: lang ? (MARC_LANGUAGES[lang] ?? lang) : null,
      pageCount: null,
      coverUrl: null,
      listPriceCents: null,
      source: "sudoc",
    });
  }
  return out;
}

async function sudocQuery(query: string): Promise<BookInfo[]> {
  const url = new URL("https://www.sudoc.abes.fr/cbs/sru/");
  url.searchParams.set("operation", "searchRetrieve");
  url.searchParams.set("version", "1.1");
  url.searchParams.set("recordSchema", "unimarc");
  url.searchParams.set("maximumRecords", "15");
  url.searchParams.set("query", query);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sudoc HTTP ${res.status}`);
  const found = parseSudocRecords(await res.text());
  const withIsbn = found.filter((b) => b.isbn13);
  return withIsbn.length ? withIsbn : found;
}

/** Mots du titre (et nom de l'auteur) : le Sudoc cherche les notices qui contiennent tous ces mots. */
function sudocSearch(title: string, author?: string | null): Promise<BookInfo[]> {
  const words = [...tokens(title)].filter((w) => w.length > 1).slice(0, 8);
  const surname = author ? normalizeText(author).split(" ").at(-1) : "";
  if (words.length === 0) return Promise.resolve([]);
  return sudocQuery([...words.map((w) => `mti=${w}`), ...(surname ? [`aut=${surname}`] : [])].join(" and "));
}

// ---------- API publique ----------

/**
 * Cherche un livre par ISBN. Renvoie null s'il est introuvable ;
 * lève une erreur seulement si aucun catalogue n'a pu être joint (pour ne pas mettre en cache un faux "introuvable").
 */
export async function lookupByIsbn(isbn13: string): Promise<BookInfo | null> {
  let reachable = false;
  try {
    const g = await googleSearch(`isbn:${isbn13}`);
    reachable = true;
    if (g[0]) return { ...g[0], isbn13: g[0].isbn13 ?? isbn13 };
  } catch (e) {
    console.warn("[books] Google Books indisponible", e);
  }
  try {
    const ol = await openLibrarySearch({ isbn: isbn13 });
    reachable = true;
    if (ol[0]) return { ...ol[0], isbn13 };
  } catch (e) {
    console.warn("[books] Open Library indisponible", e);
  }
  // Les livres français rares ou anciens sont souvent seulement au Sudoc.
  try {
    const sd = await sudocQuery(`isb=${isbn13}`);
    if (sd[0]) return { ...sd[0], isbn13 };
    return null;
  } catch (e) {
    console.warn("[books] Sudoc indisponible", e);
    if (!reachable) throw new CatalogUnavailableError();
    return null;
  }
}

export class CatalogUnavailableError extends Error {
  constructor() {
    super("Les catalogues de livres (Google Books, Open Library) sont injoignables pour le moment.");
  }
}

function pickBest(query: TitleQuery, candidates: BookInfo[]): BookInfo | null {
  let best: BookInfo | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const s = scoreCandidate(query, c);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return bestScore >= MIN_MATCH_SCORE ? best : null;
}

/**
 * Cherche le titre dans les catalogues gratuits : Google Books, BnF, Sudoc, Open Library.
 * `failed` : un catalogue n'a pas répondu (on ne pourra pas conclure « introuvable »).
 */
async function searchCatalogs(query: TitleQuery & { language?: string }): Promise<{ found: BookInfo | null; failed: boolean }> {
  // Un titre d'un seul mot ne suffit pas à Google : on précise l'éditeur lu sur la tranche.
  const oneWord = oneWordTitle(query);
  const q =
    `intitle:${query.title}` +
    (query.author ? ` inauthor:${query.author}` : "") +
    (oneWord && query.publisher ? ` inpublisher:${cleanQuery(query.publisher)}` : "");
  let failed = false;
  try {
    let found = pickBest(query, await googleSearch(q, query.language));
    if (!found && query.language) found = pickBest(query, await googleSearch(q));
    if (found) return { found, failed };
  } catch (e) {
    failed = true;
    console.warn("[books] Google Books indisponible", e);
  }
  // La BnF connaît presque tous les livres publiés en France ; le Sudoc, les livres plus rares ou spécialisés.
  // Un auteur mal lu sur la tranche ne doit pas tout bloquer : on réessaie avec le titre seul.
  for (const [name, search] of [
    ["BnF", bnfSearch],
    ["Sudoc", sudocSearch],
  ] as const) {
    try {
      let found = pickBest(query, await search(query.title, query.author));
      if (!found && query.author) found = pickBest(query, await search(query.title));
      if (found) return { found, failed };
    } catch (e) {
      failed = true;
      console.warn(`[books] ${name} indisponible`, e);
    }
  }
  const params: Record<string, string> = { title: query.title };
  if (query.author) params.author = query.author;
  try {
    return { found: pickBest(query, await openLibrarySearch(params)), failed };
  } catch (e) {
    console.warn("[books] Open Library indisponible", e);
    return { found: null, failed: true };
  }
}

// Les parenthèses et guillemets du titre lu (« Survivre sans écrans (quand on est ado) ») gênent les moteurs de recherche.
const cleanQuery = (s: string) => s.replace(/[()[\]"«»]/g, " ").replace(/\s+/g, " ").trim();

export async function lookupByTitle(query: TitleQuery & { language?: string }): Promise<BookInfo | null> {
  query = { ...query, title: cleanQuery(query.title) };
  const first = await searchCatalogs(query);
  if (first.found) return first.found;
  // Dernier recours (au lieu d'une recherche Amazon à 10 jetons Keepa) : Gemini, en texte seul, reconnaît le livre
  // malgré une lecture imparfaite ; sa réponse n'est gardée que si un catalogue la confirme.
  let hintFailed = false;
  const found = await bookFromHint(query).catch((e) => {
    hintFailed = true;
    console.warn("[books] Gemini indisponible", e);
    return null;
  });
  // Un catalogue (ou Gemini) n'a pas répondu et les autres ne trouvent rien : on ne conclut pas « introuvable »,
  // pour ne pas le garder en cache ; la recherche sera relancée plus tard.
  if (!found && (first.failed || hintFailed)) throw new CatalogUnavailableError();
  return found;
}

/** Livre proposé par Gemini, confirmé par un catalogue (par son ISBN, sinon par son titre corrigé). */
async function bookFromHint(query: TitleQuery & { language?: string }): Promise<BookInfo | null> {
  if (/illisible/i.test(query.title) || !env.geminiApiKey()) return null;
  const { suggestBook } = await import("./book-hint");
  const hint = await suggestBook(query);
  if (!hint) return null;
  const hinted = { title: hint.title, author: hint.author, language: query.language };
  // Le livre trouvé doit correspondre à la proposition de Gemini, sans contredire la tranche (« grand » ≠ « petit »).
  const confirms = (c: BookInfo | null) =>
    c && scoreCandidate(hinted, c) >= MIN_MATCH_SCORE && !contradictsTitle(query.title, c.title) ? c : null;
  const isbn = hint.isbn ? normalizeIsbn(hint.isbn) : null;
  if (isbn) {
    const byIsbn = confirms(await lookupByIsbn(isbn.isbn13).catch(() => null));
    if (byIsbn) return byIsbn;
  }
  return confirms((await searchCatalogs({ ...hinted, title: cleanQuery(hinted.title) })).found);
}

function oneWordTitle(query: TitleQuery): boolean {
  return [...tokens(query.title)].length === 1;
}

export function lookupCacheKey(title: string, author: string | null | undefined, language: string, publisher?: string | null): string {
  // "v10" : on réessaie les livres « introuvables » avec le Sudoc, les sous-titres et Gemini.
  return `v10|${language}|${normalizeText(title)}|${normalizeText(author ?? "")}|${normalizeText(publisher ?? "")}`;
}
