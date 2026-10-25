import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/** Taille maximale lue par le modèle sans réduction : 2576 px de grand côté et 3,75 mégapixels. */
export const MAX_LONG_EDGE = 2576;
export const MAX_PIXELS = 3_750_000;

/** Dimensions cibles : la plus grande image que le modèle lit telle quelle (jamais agrandie). */
export function targetSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)));
  return { width: Math.floor(width * scale), height: Math.floor(height * scale) };
}

/**
 * Redresse la photo (EXIF), la réduit à la taille maximale lue par le modèle et la convertit en JPEG.
 * Au-delà, le modèle réduirait l'image lui-même et ses coordonnées ne correspondraient plus aux pixels ;
 * en dessous, on perd de la précision sur les tranches fines.
 */
export async function normalizePhoto(input: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const rotated = await sharp(input).rotate().toBuffer({ resolveWithObject: true });
  const size = targetSize(rotated.info.width, rotated.info.height);
  const { data, info } = await sharp(rotated.data)
    .resize({ width: size.width, height: size.height, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
