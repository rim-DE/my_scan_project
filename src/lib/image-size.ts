// Sans dépendance serveur : utilisé aussi dans le navigateur pour réduire les photos avant l'envoi.

/** Taille maximale lue par le modèle sans réduction : 2576 px de grand côté et 3,75 mégapixels. */
export const MAX_LONG_EDGE = 2576;
export const MAX_PIXELS = 3_750_000;

/** Dimensions cibles : la plus grande image que le modèle lit telle quelle (jamais agrandie). */
export function targetSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)));
  return { width: Math.floor(width * scale), height: Math.floor(height * scale) };
}

/**
 * Taille gardée pour l'affichage : celle d'une photo de téléphone (12 Mpx). Les vignettes des tranches y sont
 * découpées : avec une photo réduite à 3,75 Mpx, une tranche fine ne fait que quelques pixels et paraît floue.
 * Le modèle, lui, reçoit chaque bande réduite à sa taille maximale (voir vision.ts).
 */
export const STORE_LONG_EDGE = 4032;
export const STORE_MAX_PIXELS = 12_200_000;

export function storeSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, STORE_LONG_EDGE / Math.max(width, height), Math.sqrt(STORE_MAX_PIXELS / (width * height)));
  return { width: Math.floor(width * scale), height: Math.floor(height * scale) };
}

export const MAX_PHOTOS_PER_SCAN = 20;
