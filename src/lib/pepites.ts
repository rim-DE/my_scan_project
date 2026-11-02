// Fichier de pépites (data/pepites.csv) : les livres qui se revendent bien, chargés depuis Keepa par
// scripts/pepites.ts. Infos fixes (titre, ISBN, éditeur…) + infos qui bougent (prix, ventes), mises à jour
// à chaque passage. Séparateur « ; » et virgule décimale, pour l'ouvrir tel quel dans Excel.
import { keepaCoverUrl, parseKeepaSaleHistory, type KeepaProduct } from "./prices/providers/keepa";
import type { PriceObservation, ProviderResult } from "./prices/types";
import { normalizeText } from "./books";

/** Tranche de prix d'occasion recherchée (centimes). max absent = pas de plafond. */
export interface PriceBand {
  min: number;
  max?: number;
}

/** Tranches chargées. Pour en ajouter une (ex. 25-35 €) : { min: 2500, max: 3499 }. */
// Une recherche Keepa rend au plus 10 000 livres : les tranches sont découpées pour rester en dessous
// (le 2/11/2026 : 35 € et + ≈ 1 500, 25-35 € ≈ 2 300, 15-25 € ≈ 6 300, 10-15 € ≈ 4 900).
export const BANDS: PriceBand[] = [{ min: 3500 }, { min: 2500, max: 3499 }, { min: 1500, max: 2499 }, { min: 1000, max: 1499 }];

/** Catégories amazon.fr écartées d'emblée : BD érotiques, romans érotiques, érotique. */
const EXCLUDED_CATEGORIES = [574008, 588062, 470906];

/** Livres érotiques ou pour adultes, que rim ne veut pas dans sa liste (en plus des catégories écartées). */
const ADULT = /(?<![a-zà-ÿ])[ée]roti|\bsexy?\b|hentai|ecchi|kama ?sutra|porno|\bx{3}\b|\bcharme\b.*\bnu/i;
export const isAdultTitle = (title: string) => ADULT.test(title);

/** Recherche Keepa (Product Finder) d'une tranche : livres en français sur amazon.fr, pas vendus par Amazon, qui se vendent. */
export function finderSelection(band: PriceBand, page: number, perPage: number) {
  return {
    rootCategory: [301061],
    categories_exclude: EXCLUDED_CATEGORIES,
    languages: ["french"],
    current_USED_gte: band.min,
    ...(band.max ? { current_USED_lte: band.max } : {}),
    // Moyenne sur 90 jours, pas le prix du jour : écarte les livres dont le prix neuf vient juste de flamber.
    avg90_NEW_gte: band.min,
    buyBoxIsAmazon: false,
    avg180_SALES_lte: 400000,
    current_SALES_gte: 1,
    sort: [["avg180_SALES", "asc"]],
    page,
    perPage,
  };
}

export const COLUMNS = [
  // Infos fixes
  "ean",
  "isbn10",
  "asin",
  "titre",
  "auteur",
  "editeur",
  "annee",
  "format",
  "langue",
  "pages",
  "couverture",
  "lien_amazon",
  // Infos qui bougent
  "prix_neuf",
  "amazon_vend_neuf",
  "prix_editeur",
  "prix_occasion",
  "occasion_moy90",
  "occasion_moy180",
  "ventes_30j",
  "ventes_90j",
  "ventes_180j",
  "ventes_365j",
  "derniere_vente",
  "dernieres_ventes",
  "rang_ventes",
  "nb_offres_occasion",
  "maj",
] as const;

export type PepiteRow = Record<(typeof COLUMNS)[number], string>;

// Index des séries Keepa (voir prices/providers/keepa.ts).
const AMAZON = 0;
const NEW = 1;
const USED = 2;
const SALES_RANK = 3;
const LIST_PRICE = 4;
const COUNT_USED = 12;

/** Supports qui ne sont pas des livres (la catégorie Livres en contient quelques-uns). */
const NOT_A_BOOK = /dvd|blu-?ray|cd|audio|cassette|vinyle/i;

/** Au plus 30 ventes par livre dans le fichier (les plus récentes), pour qu'il reste léger. */
const MAX_SALES = 30;

const euros = (cents: number | null | undefined) =>
  typeof cents === "number" && cents > 0 ? (cents / 100).toFixed(2).replace(".", ",") : "";
const count = (n: number | null | undefined) => (typeof n === "number" && n >= 0 ? String(n) : "");
const day = (d: Date) => d.toISOString().slice(0, 10);

interface KeepaBook extends KeepaProduct {
  isAdultProduct?: boolean;
  binding?: string;
  publicationDate?: number;
  numberOfPages?: number;
  languages?: string[][] | null;
  stats?: KeepaProduct["stats"] & {
    avg90?: number[];
    avg180?: number[];
    salesRankDrops90?: number;
    salesRankDrops180?: number;
  };
}

/** Fiche Keepa → ligne du fichier, ou null si ce n'est pas un livre exploitable. */
export function pepiteRow(p: KeepaBook, now = new Date()): PepiteRow | null {
  if (!p.asin || !p.title) return null;
  if (p.binding && NOT_A_BOOK.test(p.binding)) return null;
  if (p.isAdultProduct || isAdultTitle(p.title)) return null;
  const ean = p.eanList?.find((e) => /^97[89]\d{10}$/.test(e)) ?? "";
  const cur = p.stats?.current ?? [];
  const usedPrice = cur[USED];
  const newPrice = [cur[AMAZON], cur[NEW]].filter((v) => v > 0).sort((a, b) => a - b)[0];
  // Offre d'occasion absurde (plus de 5 fois le neuf) : on ne garde pas ce prix.
  const aberrant = usedPrice > 0 && newPrice > 0 && usedPrice > 5 * newPrice;
  const sales = parseKeepaSaleHistory(p, "FR", now);
  // Ventes des 12 derniers mois (au moins les 5 dernières), pour la médiane et le rythme de vente du BiblioRank.
  const recent = sales.slice(-MAX_SALES);
  const year = p.publicationDate && p.publicationDate > 0 ? String(p.publicationDate).slice(0, 4) : "";
  return {
    ean,
    isbn10: /^\d{9}[\dX]$/.test(p.asin) ? p.asin : "",
    asin: p.asin,
    titre: p.title,
    auteur: p.author ?? "",
    editeur: p.manufacturer ?? "",
    annee: year,
    format: p.binding ?? "",
    langue: p.languages?.[0]?.[0] ?? "",
    pages: p.numberOfPages && p.numberOfPages > 0 ? String(p.numberOfPages) : "",
    couverture: keepaCoverUrl(p) ?? "",
    lien_amazon: `https://www.amazon.fr/dp/${p.asin}`,
    prix_neuf: euros(newPrice),
    amazon_vend_neuf: cur[AMAZON] > 0 ? "oui" : "non",
    prix_editeur: euros(cur[LIST_PRICE]),
    prix_occasion: aberrant ? "" : euros(usedPrice),
    occasion_moy90: euros(p.stats?.avg90?.[USED]),
    occasion_moy180: euros(p.stats?.avg180?.[USED]),
    ventes_30j: count(p.stats?.salesRankDrops30),
    ventes_90j: count(p.stats?.salesRankDrops90),
    ventes_180j: count(p.stats?.salesRankDrops180),
    ventes_365j: count(p.stats?.salesRankDrops365),
    derniere_vente: recent.length ? day(recent[recent.length - 1].observedAt!) : "",
    // « 2026-09-12=39,90|2026-10-01=42,50 » : date et prix de chaque vente estimée, la plus ancienne d'abord.
    dernieres_ventes: recent.map((s) => `${day(s.observedAt!)}=${euros(s.priceCents)}`).join("|"),
    rang_ventes: cur[SALES_RANK] > 0 ? String(cur[SALES_RANK]) : "",
    nb_offres_occasion: count(cur[COUNT_USED]),
    maj: day(now),
  };
}

const quote = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Lignes → CSV (avec BOM pour qu'Excel lise bien les accents), triées par ventes sur 6 mois. */
export function toCsv(rows: PepiteRow[]): string {
  const sorted = [...rows].sort((a, b) => Number(b.ventes_180j || 0) - Number(a.ventes_180j || 0));
  const lines = [COLUMNS.join(";"), ...sorted.map((r) => COLUMNS.map((c) => quote(r[c] ?? "")).join(";"))];
  return "﻿" + lines.join("\n") + "\n";
}

/** CSV → lignes (relit le fichier existant pour le mettre à jour). */
export function parseCsv(text: string): PepiteRow[] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  const endField = () => {
    record.push(field);
    field = "";
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ";") endField();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      endField();
      if (record.some((v) => v !== "")) records.push(record);
      record = [];
    } else field += c;
  }
  if (field || record.length) {
    endField();
    records.push(record);
  }
  const [header, ...body] = records;
  if (!header) return [];
  return body.map((r) => Object.fromEntries(COLUMNS.map((c) => [c, r[header.indexOf(c)] ?? ""])) as PepiteRow);
}

/** Fusion : les fiches fraîches remplacent les anciennes ; un livre que Keepa n'a pas renvoyé garde ses dernières infos. */
export function mergeRows(previous: PepiteRow[], fresh: PepiteRow[]): PepiteRow[] {
  const byAsin = new Map(previous.map((r) => [r.asin, r]));
  for (const r of fresh) byAsin.set(r.asin, r);
  return [...byAsin.values()];
}

/** Au-delà, les infos du fichier sont jugées trop vieilles et l'appli redemande à Keepa (le fichier est mis à jour chaque lundi). */
export const PEPITE_MAX_AGE_DAYS = 10;

const cents = (v: string) => {
  const n = Math.round(Number(v.replace(",", ".")) * 100);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const int = (v: string) => (v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** Les infos du fichier sont-elles assez récentes pour remplacer un appel à Keepa ? */
export function isFreshPepite(row: PepiteRow, now = new Date()): boolean {
  const updated = new Date(row.maj).getTime();
  return Number.isFinite(updated) && now.getTime() - updated <= PEPITE_MAX_AGE_DAYS * 24 * 3600 * 1000;
}

/** Ligne du fichier → même résultat qu'un appel Keepa (prix, ventes datées, infos de la fiche), sans jeton. */
export function pepiteResult(row: PepiteRow): ProviderResult {
  const url = row.lien_amazon || null;
  const offer = (offerType: "NEW" | "USED", priceCents: number | null): PriceObservation[] =>
    priceCents ? [{ platform: "amazon", offerType, priceCents, currency: "EUR", url }] : [];
  const sold: PriceObservation[] = row.dernieres_ventes
    .split("|")
    .map((s) => s.split("="))
    .flatMap(([date, price]) => {
      const priceCents = cents(price ?? "");
      const observedAt = new Date(date);
      return priceCents && Number.isFinite(observedAt.getTime())
        ? [{ platform: "amazon", offerType: "SOLD" as const, priceCents, currency: "EUR", url, observedAt }]
        : [];
    });
  return {
    observations: [...offer("NEW", cents(row.prix_neuf)), ...offer("USED", cents(row.prix_occasion)), ...sold],
    asin: row.asin || undefined,
    sales: { sales30d: int(row.ventes_30j), sales12m: int(row.ventes_365j) },
    // La note et le nombre d'avis ne sont pas dans le fichier : ceux déjà connus sont gardés.
    info: {
      offerCount: int(row.nb_offres_occasion),
      salesRank: int(row.rang_ventes),
      listPriceCents: cents(row.prix_editeur),
      coverUrl: row.couverture || null,
    },
  };
}

/** Index du fichier par ISBN-13 et par ASIN. */
export function indexPepites(rows: PepiteRow[]): Map<string, PepiteRow> {
  const index = new Map<string, PepiteRow>();
  for (const r of rows) {
    if (r.ean) index.set(r.ean, r);
    if (r.asin) index.set(r.asin, r);
  }
  return index;
}

/** Le livre est-il dans le fichier ? (par ISBN-13, puis ISBN-10 / ASIN) */
export function findPepite(index: Map<string, PepiteRow>, book: { isbn13?: string | null; isbn10?: string | null; asin?: string | null }) {
  for (const k of [book.isbn13, book.asin, book.isbn10]) {
    const row = k ? index.get(k) : undefined;
    if (row) return row;
  }
  return null;
}

// ---------- Reconnaissance par le titre lu sur la tranche ----------

const STOP = new Set(["le", "la", "les", "de", "des", "du", "un", "une", "et", "en", "au", "aux", "the", "of", "and", "pour", "sur", "dans"]);

/** « T14 », « Tome 14 », « Vol. 14 » → « 14 », pour comparer les numéros de tome quelle que soit l'écriture. */
const words = (s: string) =>
  normalizeText(s)
    .split(" ")
    .filter((w) => !["tome", "vol", "volume", "no"].includes(w))
    .map((w) => w.replace(/^(?:t|vol|n)(\d+)$/, "$1"))
    .filter((w) => (w.length > 1 || /\d/.test(w)) && !STOP.has(w));

/** Titre principal, sans sous-titre ni mention d'édition (« Frieren T14 - édition collector » → « Frieren T14 »). */
const mainTitle = (t: string) => t.split(/\s*:\s+|\s+[-–]\s+|\s*[(\[]/)[0];

export interface PepiteTitles {
  row: PepiteRow;
  all: Set<string>;
  main: string[];
  authors: Set<string>;
}

/** Mots de chaque titre du fichier, calculés une fois. */
export function pepiteTitles(rows: PepiteRow[]): PepiteTitles[] {
  return rows
    .filter((row) => row.titre)
    .map((row) => ({ row, all: new Set(words(row.titre)), main: [...new Set(words(mainTitle(row.titre)))], authors: new Set(words(row.auteur)) }));
}

/**
 * Pépite dont le titre correspond au titre lu sur la tranche, sans passer par un catalogue.
 * Prudent : presque tous les mots lus doivent être dans le titre de la pépite, l'essentiel de son titre principal doit
 * avoir été lu, et le nom de l'auteur doit correspondre quand on a les deux. Sinon null (le catalogue prendra le relais).
 */
export function findPepiteByTitle(titles: PepiteTitles[], title: string, author?: string | null): PepiteRow | null {
  const read = [...new Set(words(title))];
  if (read.length === 0) return null;
  const surname = author ? words(author).at(-1) : undefined;
  let best: { row: PepiteRow; score: number; tie: boolean } | null = null;
  for (const p of titles) {
    const readCovered = read.filter((w) => p.all.has(w)).length / read.length;
    if (readCovered < 0.8) continue;
    const mainCovered = p.main.length ? p.main.filter((w) => read.includes(w)).length / p.main.length : 0;
    const authorKnown = surname !== undefined && p.authors.size > 0;
    const authorOk = authorKnown && p.authors.has(surname!);
    if (authorKnown && !authorOk) continue;
    // Sans auteur pour confirmer, il faut un titre lu de plusieurs mots et presque tout le titre principal.
    if (mainCovered < (authorOk ? 0.6 : 0.8) || (!authorOk && read.length < 2)) continue;
    const score = mainCovered + readCovered + (authorOk ? 1 : 0);
    if (!best || score > best.score + 1e-9) best = { row: p.row, score, tie: false };
    else if (Math.abs(score - best.score) <= 1e-9) best.tie = true;
  }
  // Deux pépites aussi proches (« Rituels de vocabulaire CE1 » / « CE2 ») : on ne choisit pas au hasard, le catalogue tranchera.
  return best && !best.tie ? best.row : null;
}
