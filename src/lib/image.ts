import sharp from "sharp";
import { storeSize, targetSize } from "./image-size";

export { MAX_LONG_EDGE, MAX_PIXELS, targetSize } from "./image-size";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/**
 * Redresse la photo (EXIF), la réduit à la taille d'une photo de téléphone (12 Mpx) et la convertit en JPEG.
 * C'est la photo gardée pour l'affichage ; le modèle en reçoit des bandes réduites (voir toModelSize).
 */
export async function normalizePhoto(input: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const rotated = await sharp(input).rotate().toBuffer({ resolveWithObject: true });
  const size = storeSize(rotated.info.width, rotated.info.height);
  const { data, info } = await sharp(rotated.data)
    .resize({ width: size.width, height: size.height, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Réduit une image à la taille maximale lue par le modèle. Au-delà, le modèle la réduirait lui-même
 * et ses coordonnées ne correspondraient plus aux pixels.
 */
export async function toModelSize(jpeg: Buffer, width: number, height: number): Promise<{ data: Buffer; width: number; height: number }> {
  const size = targetSize(width, height);
  if (size.width === width && size.height === height) return { data: jpeg, width, height };
  const data = await sharp(jpeg).resize({ width: size.width, height: size.height, fit: "fill" }).jpeg({ quality: 90 }).toBuffer();
  return { data, ...size };
}
