// Réduction des photos dans le navigateur avant l'envoi.
// Vercel refuse les requêtes de plus de 4,5 Mo : une photo de téléphone (3 à 8 Mo) doit être réduite avant d'être envoyée.
// On garde la taille d'une photo de téléphone (12 Mpx) pour des vignettes de tranches nettes, en baissant
// la qualité JPEG puis la taille tant que le fichier dépasse la limite.
import { storeSize } from "./image-size";

export const MAX_REQUEST_BYTES = 4 * 1024 * 1024;

/** Renvoie la photo redressée, réduite et en JPEG ; si le navigateur ne sait pas la lire (HEIC hors Safari), renvoie l'original. */
export async function shrinkPhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const full = storeSize(bitmap.width, bitmap.height);
  let blob: Blob | null = null;
  for (const scale of [1, 0.8, 0.64]) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(full.width * scale);
    canvas.height = Math.floor(full.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.88, 0.78]) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= MAX_REQUEST_BYTES) break;
    }
    if (blob && blob.size <= MAX_REQUEST_BYTES) break;
  }
  bitmap.close();
  return blob && (blob.size < file.size || file.size > MAX_REQUEST_BYTES) ? blob : file;
}
