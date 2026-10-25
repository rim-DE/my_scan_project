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
  fetch(book: BookRef, country: string): Promise<PriceObservation[]>;
}
