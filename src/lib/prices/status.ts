// État des prix d'un livre, pour expliquer à l'écran pourquoi il n'y en a pas.

/**
 * - "waiting" : au moins une source n'a pas encore répondu correctement (souvent la limite de jetons Keepa) ;
 * - "notFound" : toutes les sources ont répondu, mais sans aucun prix ;
 * - "ok" : au moins un prix ;
 * - "noSource" : aucune source de prix n'est configurée.
 */
export type PriceStatus = "waiting" | "notFound" | "ok" | "noSource";

export function priceStatus(
  fetches: { provider: string; ok: boolean }[],
  priceCount: number,
  providerIds: string[],
): PriceStatus {
  if (priceCount > 0) return "ok";
  if (providerIds.length === 0) return "noSource";
  return providerIds.every((id) => fetches.some((f) => f.provider === id && f.ok)) ? "notFound" : "waiting";
}

/** Le livre a une source qui n'a pas encore répondu correctement. */
export function needsFetch(fetches: { provider: string; ok: boolean }[], providerIds: string[]): boolean {
  return providerIds.some((id) => !fetches.some((f) => f.provider === id && f.ok));
}
