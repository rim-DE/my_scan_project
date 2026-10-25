// Identification d'un livre : Google Books en priorité, Open Library en secours.
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
  source: "google" | "openlibrary";
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

export function scoreCandidate(query: { title: string; author?: string | null }, c: BookInfo): number {
  let score = similarity(query.title, c.title);
  if (query.author && c.authors.length > 0) {
    const a = Math.max(...c.authors.map((x) => similarity(query.author!, x)));
    score = score * 0.75 + a * 0.25;
  }
  if (c.isbn13) score += 0.02; // léger bonus si on a un ISBN exploitable
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
  const res = await fetch(url, { cache: "no-store" });
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
    language: d.language?.[0] ?? null,
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
    if (ol[0]) return { ...ol[0], isbn13 };
    return null;
  } catch (e) {
    console.warn("[books] Open Library indisponible", e);
    if (!reachable) throw new CatalogUnavailableError();
    return null;
  }
}

export class CatalogUnavailableError extends Error {
  constructor() {
    super("Les catalogues de livres (Google Books, Open Library) sont injoignables pour le moment.");
  }
}

function pickBest(query: { title: string; author?: string | null }, candidates: BookInfo[]): BookInfo | null {
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

export async function lookupByTitle(query: { title: string; author?: string | null; language?: string }): Promise<BookInfo | null> {
  const q = `intitle:${query.title}` + (query.author ? ` inauthor:${query.author}` : "");
  let reachable = false;
  try {
    let found = pickBest(query, await googleSearch(q, query.language));
    reachable = true;
    if (!found && query.language) found = pickBest(query, await googleSearch(q));
    if (found) return found;
  } catch (e) {
    console.warn("[books] Google Books indisponible", e);
  }
  const params: Record<string, string> = { title: query.title };
  if (query.author) params.author = query.author;
  try {
    return pickBest(query, await openLibrarySearch(params));
  } catch (e) {
    console.warn("[books] Open Library indisponible", e);
    if (!reachable) throw new CatalogUnavailableError();
    return null;
  }
}

export function lookupCacheKey(title: string, author: string | null | undefined, language: string): string {
  return `${language}|${normalizeText(title)}|${normalizeText(author ?? "")}`;
}
