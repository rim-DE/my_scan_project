export type OfferType = "NEW" | "USED" | "BUYBACK" | "SOLD";
export type Condition = "NEW" | "LIKE_NEW" | "VERY_GOOD" | "GOOD" | "ACCEPTABLE";

/** Un prix observé, avant enregistrement en base. */
export interface PriceObservation {
  platform: string;
  offerType: OfferType;
  condition?: Condition | null;
  priceCents: number;
  currency: string;
  url?: string | null;
  /** Date de l'observation ; pour une vente (SOLD), la date de la vente. Par défaut : maintenant. */
  observedAt?: Date;
}

/** Nombre de ventes estimé par une source (par exemple Keepa pour Amazon). */
export interface SalesEstimate {
  sales30d: number | null;
  sales12m: number | null;
}

/** Infos de la fiche produit (Keepa / Amazon). null = inconnu. */
export interface BookInfo {
  /** Nombre d'offres en ce moment (neuf + occasion). */
  offerCount: number | null;
  /** Classement des ventes Amazon (1 = le plus vendu). */
  salesRank: number | null;
  /** Note moyenne sur 5. */
  rating: number | null;
  reviewCount: number | null;
  listPriceCents: number | null;
}

export interface ProviderResult {
  observations: PriceObservation[];
  sales?: SalesEstimate;
  info?: BookInfo;
}

export interface BookRef {
  isbn13: string;
  isbn10: string | null;
  title: string;
  authors: string[];
}

export interface PriceProvider {
  /** Identifiant stocké dans PriceFetch (sert de clé de cache). */
  id: string;
  /** Le fournisseur est-il configuré (clés d'API présentes) ? */
  enabled(): boolean;
  /** "api" pour une source réelle, "demo" pour des données factices. */
  source: "api" | "demo";
  fetch(book: BookRef, country: string): Promise<ProviderResult>;
}
