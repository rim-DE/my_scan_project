// Les plateformes suivies, avec un lien de recherche public pour chacune.
// Ouvrir ces liens dans ton navigateur est toujours autorisé : on ne lit pas la page côté serveur.

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
    searchUrl: ({ isbn13 }) => `https://www.amazon.fr/s?k=${isbn13}&i=stripbooks`,
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
