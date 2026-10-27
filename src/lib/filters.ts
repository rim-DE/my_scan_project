// Filtres de la liste d'un scan, comme ceux de BiblioScan : cases à cocher et fourchettes de valeurs.
import type { DetectionView } from "./queries";
import { boxToQuad } from "./geometry";

export interface FilterFlags {
  /** Cacher les livres dont le prix médian est sous 12 €. */
  hideUnder12: boolean;
  /** Cacher les livres encore vendus neufs (une offre neuve en cours). */
  hideSoldNew: boolean;
  /** Afficher seulement les livres « intéressants » à la revente (pépites). */
  onlyInteresting: boolean;
  /** Cacher les tranches plus petites que 70 % de la hauteur moyenne (souvent de faux livres). */
  hideSmallSpines: boolean;
  /** Cacher les livres dont le texte lu fait 7 caractères ou moins. */
  hideShortOcr: boolean;
  /** Afficher seulement les livres sans offre en ce moment. */
  onlyNotSold: boolean;
}

export const DEFAULT_FLAGS: FilterFlags = {
  hideUnder12: false,
  hideSoldNew: false,
  onlyInteresting: false,
  hideSmallSpines: true,
  hideShortOcr: true,
  onlyNotSold: false,
};

export type RangeKey = "median" | "current" | "listPrice" | "sales12m" | "salesRank" | "ratio" | "ocr" | "buyback";
export const RANGE_KEYS: RangeKey[] = ["median", "current", "listPrice", "sales12m", "salesRank", "ratio", "ocr", "buyback"];
/** Fourchette choisie ; absente = pas de filtre sur cette valeur. */
export type Ranges = Partial<Record<RangeKey, [number, number]>>;

export interface Filters {
  flags: FilterFlags;
  ranges: Ranges;
}

export const DEFAULT_FILTERS: Filters = { flags: DEFAULT_FLAGS, ranges: {} };

const OCR_CONFIDENCE: Record<string, number> = { high: 1, medium: 0.66, low: 0.33 };

/** Valeur d'un livre pour une fourchette (prix en euros), ou null si inconnue. */
export function rangeValue(d: DetectionView, key: RangeKey): number | null {
  const b = d.book;
  const eur = (c: number | null | undefined) => (c === null || c === undefined ? null : c / 100);
  switch (key) {
    case "median":
      return eur(b?.stats.medianCents);
    case "current":
      return eur(b?.metrics.currentPriceCents);
    case "listPrice":
      return eur(b?.listPriceCents);
    case "sales12m":
      return b?.metrics.sales12m ?? null;
    case "salesRank":
      return b?.salesRank ?? null;
    case "ratio":
      return b?.metrics.ratio ?? null;
    case "ocr":
      return d.confidence ? (OCR_CONFIDENCE[d.confidence] ?? null) : null;
    case "buyback":
      return eur(b?.stats.buybackMaxCents);
  }
}

/** Plus grand côté de la tranche, en pixels de la photo (la « hauteur » du livre sur l'étagère). */
function spineLength(d: DetectionView, photo: { width: number; height: number }): number | null {
  const quad = d.polygon ?? (d.bbox ? boxToQuad(d.bbox) : null);
  if (!quad || quad.length < 3) return null;
  const side = (i: number) => {
    const a = quad[i];
    const c = quad[(i + 1) % quad.length];
    return Math.hypot((a.x - c.x) * photo.width, (a.y - c.y) * photo.height);
  };
  return Math.max(side(0), side(1));
}

/** Tranches nettement plus petites que les autres de la même photo. */
export function smallSpines(detections: DetectionView[], photos: { id: string; width: number; height: number }[]): Set<string> {
  const small = new Set<string>();
  for (const photo of photos) {
    const lengths = detections
      .filter((d) => d.photoId === photo.id)
      .map((d) => [d.id, spineLength(d, photo)] as const)
      .filter((x): x is readonly [string, number] => x[1] !== null);
    if (lengths.length < 3) continue;
    const mean = lengths.reduce((s, [, l]) => s + l, 0) / lengths.length;
    for (const [id, l] of lengths) if (l < 0.7 * mean) small.add(id);
  }
  return small;
}

const ocrLength = (d: DetectionView) => `${d.rawTitle ?? ""}${d.rawAuthor ?? ""}`.replace(/\s/g, "").length;

export function passesFilters(d: DetectionView, f: Filters, small: Set<string>): boolean {
  const { flags } = f;
  const b = d.book;
  // Seulement pour les livres lus sur une photo (un livre scanné au code-barres n'a pas de texte lu).
  if (flags.hideShortOcr && d.photoId && ocrLength(d) <= 7) return false;
  if (flags.hideSmallSpines && small.has(d.id)) return false;
  if (flags.hideUnder12 && b?.stats.medianCents != null && b.stats.medianCents < 1200) return false;
  if (flags.hideSoldNew && b?.prices.some((p) => p.offerType === "NEW")) return false;
  if (flags.onlyInteresting && !b?.metrics.banger) return false;
  if (flags.onlyNotSold && (!b || b.metrics.currentPriceCents !== null)) return false;
  for (const key of RANGE_KEYS) {
    const r = f.ranges[key];
    if (!r) continue;
    const v = rangeValue(d, key);
    // Fourchette réglée : un livre sans cette information n'y entre pas.
    if (v === null || v < r[0] || v > r[1]) return false;
  }
  return true;
}

export function activeFilterCount(f: Filters): number {
  const flags = (Object.keys(f.flags) as (keyof FilterFlags)[]).filter((k) => f.flags[k] !== DEFAULT_FLAGS[k]).length;
  return flags + Object.keys(f.ranges).length;
}

const STORAGE_KEY = "scan-filters";

export function loadSavedFilters(): Filters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    const saved = JSON.parse(raw) as Partial<Filters>;
    return { flags: { ...DEFAULT_FLAGS, ...saved.flags }, ranges: saved.ranges ?? {} };
  } catch {
    return DEFAULT_FILTERS;
  }
}

export function saveFilters(f: Filters) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
  } catch {
    // Stockage indisponible (navigation privée) : les filtres valent pour cette page seulement.
  }
}
