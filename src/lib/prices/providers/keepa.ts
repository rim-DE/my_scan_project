// Keepa (payant, https://keepa.com/#!api) : données Amazon sous licence.
// C'est l'alternative légale au scraping d'Amazon, interdit par ses CGU.
import { env } from "../../env";
import { normalizeText } from "../../books";
import type { BookInfo, BookRef, PriceObservation, PriceProvider, ProviderResult, SalesEstimate } from "../types";

// Identifiants de marketplace Amazon chez Keepa.
const DOMAINS: Record<string, { id: number; currency: string; host: string }> = {
  US: { id: 1, currency: "USD", host: "amazon.com" },
  GB: { id: 2, currency: "GBP", host: "amazon.co.uk" },
  DE: { id: 3, currency: "EUR", host: "amazon.de" },
  FR: { id: 4, currency: "EUR", host: "amazon.fr" },
  JP: { id: 5, currency: "JPY", host: "amazon.co.jp" },
  CA: { id: 6, currency: "CAD", host: "amazon.ca" },
  IT: { id: 8, currency: "EUR", host: "amazon.it" },
  ES: { id: 9, currency: "EUR", host: "amazon.es" },
};

export interface KeepaProduct {
  asin?: string;
  title?: string;
  author?: string;
  /** Codes-barres EAN (pour un livre : l'ISBN-13). */
  eanList?: string[];
  manufacturer?: string;
  /** Historiques : csv[type] = [temps Keepa, valeur, temps Keepa, valeur, …]. */
  csv?: (number[] | null)[];
  stats?: { current?: number[]; salesRankDrops30?: number; salesRankDrops365?: number };
  /** Images Amazon : ancien format « a.jpg,b.jpg » ou liste d'objets (l = grande, m = moyenne). */
  imagesCSV?: string;
  images?: { l?: string; m?: string }[];
}

// Index des séries Keepa (dans "csv" et "stats.current").
const AMAZON = 0;
const NEW = 1;
const USED = 2;
const SALES_RANK = 3;
const LIST_PRICE = 4;
const COUNT_NEW = 11;
const COUNT_USED = 12;
const RATING = 16;
const COUNT_REVIEWS = 17;

/** Keepa compte le temps en minutes depuis le 1er janvier 2011. */
export function keepaTimeToDate(t: number): Date {
  return new Date((t + 21564000) * 60000);
}

const pos = (n: number | undefined) => (typeof n === "number" && n > 0 ? n : null);

/** Infos de la fiche Amazon : nombre d'offres, classement, note, prix éditeur. */
export function parseKeepaInfo(p: KeepaProduct): BookInfo {
  const cur = p.stats?.current ?? [];
  const offers = [cur[COUNT_NEW], cur[COUNT_USED]].filter((n): n is number => typeof n === "number" && n >= 0);
  const rating = pos(cur[RATING]);
  return {
    offerCount: offers.length ? offers.reduce((a, b) => a + b, 0) : null,
    salesRank: pos(cur[SALES_RANK]),
    // Keepa stocke la note sur 50 (45 = 4,5 étoiles).
    rating: rating !== null ? rating / 10 : null,
    reviewCount: typeof cur[COUNT_REVIEWS] === "number" && cur[COUNT_REVIEWS] >= 0 ? cur[COUNT_REVIEWS] : null,
    listPriceCents: pos(cur[LIST_PRICE]),
    coverUrl: keepaCoverUrl(p),
  };
}

/** Couverture Amazon du livre (première image de la fiche). */
export function keepaCoverUrl(p: KeepaProduct): string | null {
  const name = p.images?.[0]?.l ?? p.images?.[0]?.m ?? p.imagesCSV?.split(",")[0];
  return name ? `https://m.media-amazon.com/images/I/${name.trim()}` : null;
}

/** Valeur d'une série Keepa à un instant donné (dernier point connu avant cet instant). */
function valueAt(series: number[] | null | undefined, t: number): number | null {
  if (!series) return null;
  let v: number | null = null;
  for (let i = 0; i + 1 < series.length && series[i] <= t; i += 2) v = series[i + 1];
  return v;
}

/**
 * Ventes Amazon déduites de l'historique : quand le classement des ventes s'améliore, un exemplaire
 * vient d'être vendu. Le prix retenu est l'offre la moins chère à ce moment-là.
 * On garde toutes les ventes des 12 derniers mois, et au moins les 5 dernières même plus anciennes
 * (comme BiblioScan, qui montre « vendu il y a 5a 2m » quand il n'y a rien de récent).
 */
const MIN_LAST_SALES = 5;

export function parseKeepaSaleHistory(p: KeepaProduct, country: string, now = new Date()): PriceObservation[] {
  const d = DOMAINS[country] ?? DOMAINS.FR;
  const rank = p.csv?.[SALES_RANK];
  if (!rank) return [];
  const url = p.asin ? `https://www.${d.host}/dp/${p.asin}` : null;
  const since = now.getTime() - 365 * 24 * 3600 * 1000;
  const out: PriceObservation[] = [];
  // Du plus récent au plus ancien, pour s'arrêter dès qu'on a l'année et au moins 5 ventes.
  for (let i = rank.length - 2; i >= 2; i -= 2) {
    const [prev, t, r] = [rank[i - 1], rank[i], rank[i + 1]];
    if (!(prev > 0 && r > 0 && r < prev)) continue;
    const soldAt = keepaTimeToDate(t);
    if (soldAt.getTime() < since && out.length >= MIN_LAST_SALES) break;
    const prices = [AMAZON, NEW, USED].map((k) => valueAt(p.csv?.[k], t)).filter((v): v is number => v !== null && v > 0);
    if (!prices.length) continue;
    out.push({ platform: "amazon", offerType: "SOLD", priceCents: Math.min(...prices), currency: d.currency, url, observedAt: soldAt });
  }
  return out.reverse();
}

/**
 * Keepa compte les baisses du classement des ventes Amazon : chaque baisse correspond à peu près à une vente.
 * C'est l'estimation de ventes la plus fiable disponible légalement. -1 = inconnu.
 */
export function parseKeepaSales(p: KeepaProduct): SalesEstimate {
  const v = (n: number | undefined) => (typeof n === "number" && n >= 0 ? n : null);
  return { sales30d: v(p.stats?.salesRankDrops30), sales12m: v(p.stats?.salesRankDrops365) };
}

/** Dans "stats.current" : index 0 = vendu par Amazon, 1 = neuf (tiers), 2 = occasion. -1 = pas d'offre. */
export function parseKeepaProduct(p: KeepaProduct, country: string): PriceObservation[] {
  const d = DOMAINS[country] ?? DOMAINS.FR;
  const cur = p.stats?.current ?? [];
  const url = p.asin ? `https://www.${d.host}/dp/${p.asin}` : null;
  const out: PriceObservation[] = [];
  const add = (idx: number, offerType: "NEW" | "USED") => {
    const v = cur[idx];
    if (typeof v === "number" && v > 0) {
      out.push({ platform: "amazon", offerType, priceCents: v, currency: d.currency, url });
    }
  };
  add(0, "NEW");
  add(1, "NEW");
  add(2, "USED");
  return out;
}

export const keepaProvider: PriceProvider = {
  id: "keepa",
  source: "api",
  enabled: () => Boolean(env.keepaApiKey()),
  async fetch(book, country) {
    const d = DOMAINS[country] ?? DOMAINS.FR;
    if (book.isbn13) {
      const byIsbn = await productBy("code", book.isbn13, d.id, country);
      if (byIsbn.observations.length > 0) return byIsbn;
    }
    // Rien sous cet ISBN (livre sans ISBN, édition France Loisirs ou numérique…) : on prend l'édition
    // Amazon du même titre et du même auteur, trouvée par recherche puis retenue (ASIN) pour les fois suivantes.
    if (book.asin) return productBy("asin", book.asin, d.id, country);
    return searchByTitle(book, country);
  },
};

async function productBy(param: "code" | "asin", value: string, domain: number, country: string): Promise<ProviderResult> {
  const url = new URL("https://api.keepa.com/product");
  url.searchParams.set("domain", String(domain));
  url.searchParams.set(param, value);
  url.searchParams.set("stats", "90");
  // Note et nombre d'avis (coûte au plus 1 jeton de plus).
  url.searchParams.set("rating", "1");
  const res = await keepaGet(url);
  const json = (await res.json()) as { products?: KeepaProduct[] };
  const p = json.products?.[0];
  return p ? productResult(p, country) : { observations: [] };
}

function productResult(p: KeepaProduct, country: string): ProviderResult {
  return {
    observations: [...parseKeepaProduct(p, country), ...parseKeepaSaleHistory(p, country)],
    sales: parseKeepaSales(p),
    info: parseKeepaInfo(p),
  };
}

/** Appel Keepa ; 429 = plus de jetons : Keepa indique dans combien de temps il en redonne. On attend une fois (15 s max). */
async function keepaGet(url: URL): Promise<Response> {
  url.searchParams.set("key", env.keepaApiKey()!);
  let res = await fetch(url);
  if (res.status === 429) {
    const { refillIn } = (await res.json().catch(() => ({}))) as { refillIn?: number };
    await new Promise((r) => setTimeout(r, Math.min(Math.max(refillIn ?? 5000, 1000), 15000)));
    res = await fetch(url);
  }
  if (!res.ok) throw new Error(`Keepa HTTP ${res.status}`);
  return res;
}

/** Recherche Amazon par titre et auteur (10 jetons), pour les livres sans ISBN ou dont l'ISBN n'est pas vendu sur Amazon. */
async function searchByTitle(book: BookRef, country: string): Promise<ProviderResult> {
  const p = pickKeepaMatch(book, await keepaSearch(book.title, book.authors[0], country));
  if (!p?.asin) return { observations: [] };
  return { ...productResult(p, country), asin: p.asin };
}

/**
 * Choisit la fiche Amazon qui correspond au livre : presque tous les mots du titre doivent y être,
 * et le nom de l'auteur aussi quand on le connaît. Entre plusieurs éditions, on prend la mieux classée
 * (la plus vendue), comme BiblioScan.
 */
export function pickKeepaMatch(book: { title: string; authors: string[] }, products: KeepaProduct[]): KeepaProduct | null {
  const words = (s: string) => normalizeText(s).split(" ").map(romanOrdinal).filter((w) => w.length > 2);
  const titleWords = words(book.title);
  if (titleWords.length === 0) return null;
  const surnames = book.authors.map((a) => words(a).at(-1)).filter((w): w is string => Boolean(w));
  const rank = (p: KeepaProduct) => pos(p.stats?.current?.[SALES_RANK]) ?? Infinity;
  const matches = products.filter((p) => {
    const found = new Set(words(`${p.title ?? ""} ${p.author ?? ""}`));
    const coverage = titleWords.filter((w) => found.has(w)).length / titleWords.length;
    const authorOk = surnames.length === 0 || surnames.some((s) => found.has(s));
    return authorOk && coverage >= 0.75;
  });
  return matches.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };

/** « xxie » → « 21e », pour que « Le Kit du XXIe siècle » corresponde à « Le Kit du 21e siècle ». */
export function romanOrdinal(w: string): string {
  const m = /^([ivxlc]{2,})(e|eme)$/.exec(w);
  if (!m) return w;
  const digits = [...m[1]].map((c) => ROMAN[c]);
  const n = digits.reduce((sum, v, i) => sum + (v < (digits[i + 1] ?? 0) ? -v : v), 0);
  return `${n}e`;
}

/** Recherche de livres sur Amazon via Keepa (10 jetons). Sert aussi à identifier les livres que les catalogues ne trouvent pas. */
export async function keepaSearch(title: string, author: string | null | undefined, country = "FR"): Promise<KeepaProduct[]> {
  const d = DOMAINS[country] ?? DOMAINS.FR;
  const url = new URL("https://api.keepa.com/search");
  url.searchParams.set("domain", String(d.id));
  url.searchParams.set("type", "product");
  // « XXIe » s'écrit souvent « 21e » sur Amazon ; le nom de famille de l'auteur suffit.
  const words = normalizeText(title).split(" ").map(romanOrdinal).join(" ");
  const surname = author ? normalizeText(author).split(" ").at(-1) : "";
  url.searchParams.set("term", `${words} ${surname}`.trim());
  url.searchParams.set("stats", "90");
  url.searchParams.set("rating", "1");
  const res = await keepaGet(url);
  const json = (await res.json()) as { products?: KeepaProduct[] };
  return json.products ?? [];
}

/** Fiche Amazon → infos du livre (titre, auteur, ISBN), pour l'identification. */
export function keepaBookInfo(p: KeepaProduct): {
  title: string;
  authors: string[];
  isbn13: string | null;
  publisher: string | null;
  coverUrl: string | null;
} | null {
  if (!p.title) return null;
  const isbn13 = p.eanList?.find((e) => /^97[89]\d{10}$/.test(e)) ?? null;
  return {
    // « Survivre sans écrans (quand on est ado) - Broché » → sans la mention de format
    title: p.title.replace(/\s+[-–]\s+(broché|poche|relié|format kindle|paperback|hardcover).*$/i, "").trim(),
    authors: p.author ? p.author.split(/\s*[,;&]\s*|\s+et\s+/).filter(Boolean) : [],
    isbn13,
    publisher: p.manufacturer ?? null,
    coverUrl: keepaCoverUrl(p),
  };
}
