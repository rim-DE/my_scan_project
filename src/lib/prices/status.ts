// État des prix d'un livre, pour expliquer à l'écran pourquoi il n'y en a pas.

/**
 * - "waiting" : au moins une source n'a pas encore répondu correctement (souvent la limite de jetons Keepa) ;
 * - "notFound" : toutes les sources ont répondu, mais sans aucun prix ;
 * - "ok" : au moins un prix ;
 * - "noSource" : aucune source de prix n'est configurée.
 */
export type PriceStatus = "waiting" | "notFound" | "ok" | "noSource";

type Fetch = { provider: string; ok: boolean; fetchedAt: Date };

/**
 * Les réponses vides reçues avant que Keepa sache chercher une autre édition par titre
 * (livre identifié avec l'ISBN d'une édition France Loisirs ou numérique) sont redemandées une fois.
 */
export const EMPTY_RETRY_BEFORE = new Date("2026-10-27T20:00:00Z");

export function priceStatus(fetches: Fetch[], priceCount: number, providerIds: string[]): PriceStatus {
  if (priceCount > 0) return "ok";
  if (providerIds.length === 0) return "noSource";
  return needsFetch(fetches, providerIds, priceCount) ? "waiting" : "notFound";
}

/** Le livre a une source qui n'a pas encore répondu correctement (ou une vieille réponse vide à redemander). */
export function needsFetch(fetches: Fetch[], providerIds: string[], priceCount: number): boolean {
  return providerIds.some((id) => {
    const f = fetches.find((x) => x.provider === id);
    return !f?.ok || (priceCount === 0 && f.fetchedAt < EMPTY_RETRY_BEFORE);
  });
}
