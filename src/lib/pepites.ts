// Fichier de pépites (data/pepites.csv) : les livres qui se revendent bien, chargés depuis Keepa par
// scripts/pepites.ts. Infos fixes (titre, ISBN, éditeur…) + infos qui bougent (prix, ventes), mises à jour
// à chaque passage. Séparateur « ; » et virgule décimale, pour l'ouvrir tel quel dans Excel.
import { keepaCoverUrl, parseKeepaSaleHistory, type KeepaProduct } from "./prices/providers/keepa";

/** Tranche de prix d'occasion recherchée (centimes). max absent = pas de plafond. */
export interface PriceBand {
  min: number;
  max?: number;
}

/** Tranches chargées. Pour en ajouter une (ex. 25-35 €) : { min: 2500, max: 3499 }. */
export const BANDS: PriceBand[] = [{ min: 3500 }];

/** Recherche Keepa (Product Finder) d'une tranche : livres en français sur amazon.fr, pas vendus par Amazon, qui se vendent. */
export function finderSelection(band: PriceBand, page: number, perPage: number) {
  return {
    rootCategory: [301061],
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

const euros = (cents: number | null | undefined) =>
  typeof cents === "number" && cents > 0 ? (cents / 100).toFixed(2).replace(".", ",") : "";
const count = (n: number | null | undefined) => (typeof n === "number" && n >= 0 ? String(n) : "");
const day = (d: Date) => d.toISOString().slice(0, 10);

interface KeepaBook extends KeepaProduct {
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
  const ean = p.eanList?.find((e) => /^97[89]\d{10}$/.test(e)) ?? "";
  const cur = p.stats?.current ?? [];
  const usedPrice = cur[USED];
  const newPrice = [cur[AMAZON], cur[NEW]].filter((v) => v > 0).sort((a, b) => a - b)[0];
  // Offre d'occasion absurde (plus de 5 fois le neuf) : on ne garde pas ce prix.
  const aberrant = usedPrice > 0 && newPrice > 0 && usedPrice > 5 * newPrice;
  const sales = parseKeepaSaleHistory(p, "FR", now);
  const last5 = sales.slice(-5);
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
    derniere_vente: last5.length ? day(last5[last5.length - 1].observedAt!) : "",
    // « 2026-10-01=42,50|2026-09-12=39,90 » : date et prix de chaque vente estimée, la plus ancienne d'abord.
    dernieres_ventes: last5.map((s) => `${day(s.observedAt!)}=${euros(s.priceCents)}`).join("|"),
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
