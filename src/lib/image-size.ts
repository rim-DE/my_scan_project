// Sans dépendance serveur : utilisé aussi dans le navigateur pour réduire les photos avant l'envoi.

/** Taille maximale lue par le modèle sans réduction : 2576 px de grand côté et 3,75 mégapixels. */
export const MAX_LONG_EDGE = 2576;
export const MAX_PIXELS = 3_750_000;

/** Dimensions cibles : la plus grande image que le modèle lit telle quelle (jamais agrandie). */
export function targetSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)));
  return { width: Math.floor(width * scale), height: Math.floor(height * scale) };
}

export const MAX_PHOTOS_PER_SCAN = 20;
