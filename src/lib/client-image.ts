// Réduction des photos dans le navigateur avant l'envoi.
// Vercel refuse les requêtes de plus de 4,5 Mo : une photo de téléphone (3 à 8 Mo) doit être réduite avant d'être envoyée.
// On la ramène à la taille que lit le modèle (voir image-size.ts), le serveur n'y perd donc rien.
import { targetSize } from "./image-size";

export const MAX_REQUEST_BYTES = 4 * 1024 * 1024;

/** Renvoie la photo redressée, réduite et en JPEG ; si le navigateur ne sait pas la lire (HEIC hors Safari), renvoie l'original. */
export async function shrinkPhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const { width, height } = targetSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  return blob && blob.size < file.size ? blob : file;
}
