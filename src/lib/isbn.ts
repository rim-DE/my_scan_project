// Outils ISBN : nettoyage, validation, conversion ISBN-10 <-> ISBN-13.

export function cleanIsbn(input: string): string {
  return input.replace(/[^0-9Xx]/g, "").toUpperCase();
}

export function isValidIsbn10(isbn: string): boolean {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const c = isbn[i];
    const v = c === "X" ? 10 : Number(c);
    sum += v * (10 - i);
  }
  return sum % 11 === 0;
}

export function isValidIsbn13(isbn: string): boolean {
  if (!/^\d{13}$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3);
  return sum % 10 === 0;
}

export function isbn10To13(isbn10: string): string | null {
  if (!isValidIsbn10(isbn10)) return null;
  const core = "978" + isbn10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return core + String(check);
}

export function isbn13To10(isbn13: string): string | null {
  if (!isValidIsbn13(isbn13) || !isbn13.startsWith("978")) return null;
  const core = isbn13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(core[i]) * (10 - i);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? "X" : String(check));
}

/** Retourne { isbn13, isbn10 } à partir de n'importe quelle saisie, ou null si invalide. */
export function normalizeIsbn(input: string): { isbn13: string; isbn10: string | null } | null {
  const c = cleanIsbn(input);
  if (c.length === 13 && isValidIsbn13(c)) return { isbn13: c, isbn10: isbn13To10(c) };
  if (c.length === 10 && isValidIsbn10(c)) {
    const isbn13 = isbn10To13(c);
    return isbn13 ? { isbn13, isbn10: c } : null;
  }
  return null;
}
