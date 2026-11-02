// Lecture de data/pepites.csv côté serveur (une fois par instance). Fichier absent = liste vide.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findPepite, indexPepites, parseCsv, type PepiteRow } from "./pepites";

let index: Map<string, PepiteRow> | null = null;

function load(): Map<string, PepiteRow> {
  if (!index) {
    try {
      index = indexPepites(parseCsv(readFileSync(join(process.cwd(), "data", "pepites.csv"), "utf8")));
    } catch {
      index = new Map();
    }
  }
  return index;
}

/** Fiche du livre dans le fichier de pépites, ou null. */
export function pepiteOf(book: { isbn13?: string | null; isbn10?: string | null; asin?: string | null }): PepiteRow | null {
  return findPepite(load(), book);
}
