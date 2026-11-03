// Lecture de data/pepites.csv côté serveur (une fois par instance). Fichier absent = liste vide.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { editionCount, findPepite, findPepiteByTitle, indexPepites, parseCsv, pepiteTitles, type PepiteRow, type PepiteTitles } from "./pepites";

let loaded: { index: Map<string, PepiteRow>; titles: PepiteTitles[] } | null = null;

function load() {
  if (!loaded) {
    let rows: PepiteRow[] = [];
    try {
      rows = parseCsv(readFileSync(join(process.cwd(), "data", "pepites.csv"), "utf8"));
    } catch {
      // pas de fichier : liste vide
    }
    loaded = { index: indexPepites(rows), titles: pepiteTitles(rows) };
  }
  return loaded;
}

/** Fiche du livre dans le fichier de pépites, ou null. */
export function pepiteOf(book: { isbn13?: string | null; isbn10?: string | null; asin?: string | null }): PepiteRow | null {
  return findPepite(load().index, book);
}

/** Pépite reconnue d'après le titre (et l'auteur) lus sur la tranche, ou null. */
export function pepiteByTitle(title: string, author?: string | null): PepiteRow | null {
  return findPepiteByTitle(load().titles, title, author);
}

/** Nombre d'éditions de ce livre dans le fichier de pépites (0 = pas dans le fichier). */
export function pepiteEditions(book: { isbn13?: string | null; isbn10?: string | null; asin?: string | null }): number {
  const row = pepiteOf(book);
  return row ? editionCount(load().titles, row) : 0;
}
