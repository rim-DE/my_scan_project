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

/**
 * ISBN contenu dans un code lu par la caméra : code-barres EAN-13 d'un livre (978/979…)
 * ou texte d'un QR code qui contient un ISBN. Renvoie null pour un autre code (prix, magasin…).
 */
export function isbnFromCode(text: string): string | null {
  const direct = normalizeIsbn(text);
  if (direct && /^97[89]/.test(direct.isbn13)) return direct.isbn13;
  for (const m of text.matchAll(/97[89][\d-]{10,14}|\b\d{9}[\dXx]\b/g)) {
    const n = normalizeIsbn(m[0]);
    if (n) return n.isbn13;
  }
  return null;
}
