// Les plateformes suivies, avec un lien de recherche public pour chacune.
// Ouvrir ces liens dans ton navigateur est toujours autorisé : on ne lit pas la page côté serveur.
import { isbn13To10 } from "../isbn";

export interface Platform {
  id: string;
  name: string;
  color: string;
  /** Résumé de ce qui est autorisé pour récupérer les prix (affiché dans l'interface et le README). */
  access: string;
  searchUrl: (q: { isbn13: string; title: string }) => string;
}

const enc = encodeURIComponent;

export const PLATFORMS: Platform[] = [
  {
    id: "amazon",
    name: "Amazon",
    color: "#ff9900",
    access: "Pas de scraping (CGU). Données via Keepa (payant, licencié) ou l'API Product Advertising (compte Partenaires requis).",
    // Pour un livre, l'identifiant Amazon (ASIN) est son ISBN-10 : on ouvre directement sa fiche produit.
    searchUrl: ({ isbn13 }) => {
      const isbn10 = /^97[89]\d{10}$/.test(isbn13) ? isbn13To10(isbn13) : null;
      return isbn10 ? `https://www.amazon.fr/dp/${isbn10}` : `https://www.amazon.fr/s?k=${isbn13}&i=stripbooks`;
    },
  },
  {
    id: "fnac",
    name: "Fnac",
    color: "#e1a925",
    access: "Pas d'API publique. Flux produits possibles via leur programme d'affiliation (Awin).",
    searchUrl: ({ isbn13 }) => `https://www.fnac.com/SearchResult/ResultList.aspx?Search=${isbn13}`,
  },
  {
    id: "rakuten",
    name: "Rakuten",
    color: "#bf0000",
    access: "Pas d'API publique de prix. Flux via le programme d'affiliation Rakuten.",
    searchUrl: ({ isbn13 }) => `https://fr.shopping.rakuten.com/search/${isbn13}`,
  },
  {
    id: "leboncoin",
    name: "Leboncoin",
    color: "#ec5a13",
    access: "Aucune API publique ; scraping interdit par les CGU. Lien de recherche uniquement.",
    searchUrl: ({ title }) => `https://www.leboncoin.fr/recherche?category=27&text=${enc(title)}`,
  },
  {
    id: "vinted",
    name: "Vinted",
    color: "#09b1ba",
    access: "Aucune API publique ; scraping interdit par les CGU. Lien de recherche uniquement.",
    searchUrl: ({ title }) => `https://www.vinted.fr/catalog?search_text=${enc(title)}`,
  },
  {
    id: "momox",
    name: "Momox",
    color: "#56b146",
    access: "Pas d'API publique de rachat ; scraping interdit. Lien vers l'estimation sur leur site.",
    searchUrl: ({ isbn13 }) => `https://www.momox.fr/offer/${isbn13}`,
  },
  {
    id: "recyclivre",
    name: "Recyclivre",
    color: "#2f9e44",
    access: "Pas d'API publique. Lien de recherche uniquement.",
    searchUrl: ({ isbn13 }) => `https://www.recyclivre.com/search?q=${isbn13}`,
  },
  {
    id: "abebooks",
    name: "AbeBooks",
    color: "#c41e3a",
    access: "Programme d'affiliation (flux de données sur demande). Lien de recherche par défaut.",
    searchUrl: ({ isbn13 }) => `https://www.abebooks.fr/servlet/SearchResults?isbn=${isbn13}`,
  },
  {
    id: "ebay",
    name: "eBay",
    color: "#0064d2",
    access: "API officielle Browse (gratuite, clé développeur) : annonces en cours. Les ventes passées nécessitent une API restreinte.",
    searchUrl: ({ isbn13 }) => `https://www.ebay.fr/sch/i.html?_nkw=${isbn13}`,
  },
];

export const PLATFORM_BY_ID: Record<string, Platform> = Object.fromEntries(PLATFORMS.map((p) => [p.id, p]));

export function platformName(id: string): string {
  return PLATFORM_BY_ID[id]?.name ?? id;
}

/** Sites de recherche qui ne sont pas des places de marché suivies (comparateur, historique de prix). */
const LOOKUP_SITES: Pick<Platform, "id" | "name" | "color" | "searchUrl">[] = [
  {
    id: "chasseauxlivres",
    name: "Chasse aux Livres",
    color: "#7c3aed",
    searchUrl: ({ isbn13 }) => `https://www.chasse-aux-livres.fr/search?query=${isbn13}`,
  },
  {
    id: "keepa",
    name: "Keepa",
    color: "#1e293b",
    // 4 = amazon.fr dans la numérotation des domaines Keepa.
    searchUrl: ({ isbn13 }) => `https://keepa.com/#!search/4-${isbn13}`,
  },
];

/** Ordre des icônes dans la fenêtre « … », comme dans BiblioScan : le comparateur d'abord, Keepa à la fin. */
const SITE_ORDER = ["chasseauxlivres", "amazon", "ebay", "fnac", "rakuten", "vinted", "leboncoin", "momox", "recyclivre", "abebooks", "keepa"];

export interface SiteLink {
  id: string;
  name: string;
  color: string;
  url: string;
  /** Meilleur prix connu sur ce site : l'offre la moins chère, ou le rachat le plus haut (Momox…). */
  priceCents: number | null;
  priceKind: "offer" | "buyback" | null;
}

/** Sites dont la recherche ne marche qu'avec un ISBN (rachat Momox, recherche AbeBooks par ISBN). */
const ISBN_ONLY = new Set(["momox", "abebooks"]);

/**
 * Liens vers les annonces de ce livre sur chaque site, avec le meilleur prix connu de nos sources.
 * Sans ISBN (livre lu sur la photo mais pas identifié), on cherche par titre et auteur là où c'est possible.
 */
export function siteLinks(
  q: { isbn13: string | null; title: string; author?: string | null },
  prices: { platform: string; offerType: string; priceCents: number }[],
): SiteLink[] {
  const all = [...PLATFORMS, ...LOOKUP_SITES];
  const text = [q.title, q.author].filter(Boolean).join(" ");
  const query = { isbn13: q.isbn13 ?? enc(text), title: q.isbn13 ? q.title : text };
  const ids = SITE_ORDER.filter((id) => q.isbn13 || !ISBN_ONLY.has(id));
  return ids.map((id) => all.find((p) => p.id === id)!).map((p) => {
    const offers = prices.filter((x) => x.platform === p.id && (x.offerType === "USED" || x.offerType === "NEW"));
    const buybacks = prices.filter((x) => x.platform === p.id && x.offerType === "BUYBACK");
    const priceKind = offers.length ? "offer" : buybacks.length ? "buyback" : null;
    const priceCents = offers.length
      ? Math.min(...offers.map((x) => x.priceCents))
      : buybacks.length
        ? Math.max(...buybacks.map((x) => x.priceCents))
        : null;
    return { id: p.id, name: p.name, color: p.color, url: p.searchUrl(query), priceCents, priceKind };
  });
}

/** Meilleure offre Amazon connue (la moins chère, occasion ou neuf), pour la carte « Buy Box ». */
export function bestAmazonOffer<T extends { platform: string; offerType: string; priceCents: number }>(prices: T[]): T | null {
  const offers = prices.filter((p) => p.platform === "amazon" && (p.offerType === "USED" || p.offerType === "NEW"));
  return offers.length ? offers.reduce((a, b) => (b.priceCents < a.priceCents ? b : a)) : null;
}
