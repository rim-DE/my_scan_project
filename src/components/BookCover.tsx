"use client";

import { useState } from "react";
import { normalizeIsbn } from "@/lib/isbn";

/** Images de couverture à essayer dans l'ordre : celle du catalogue, puis Amazon et Open Library par ISBN (gratuits, sans jeton Keepa). */
export function coverCandidates(src: string | null, isbn13: string | null): string[] {
  const isbn10 = isbn13 ? normalizeIsbn(isbn13)?.isbn10 : null;
  return [
    src,
    // Amazon sert la couverture d'un livre à partir de son ISBN-10 (une image de 1 pixel s'il n'en a pas).
    isbn10 ? `https://images-na.ssl-images-amazon.com/images/P/${isbn10}.08.MZZZZZZZ.jpg` : null,
    // « default=false » : Open Library répond 404 au lieu d'une image vide quand il n'a pas la couverture.
    isbn13 ? `https://covers.openlibrary.org/b/isbn/${isbn13}-M.jpg?default=false` : null,
  ].filter((u): u is string => !!u);
}

/**
 * Couverture d'un livre. On essaie chaque image possible ;
 * si rien ne charge, on affiche un livre stylisé.
 */
export function BookCover({ src, isbn13, alt, className }: { src: string | null; isbn13: string | null; alt: string; className: string }) {
  const candidates = coverCandidates(src, isbn13);
  const [i, setI] = useState(0);
  // Sans image, le titre s'affiche sur le livre stylisé (la fiche ne le répète plus ailleurs).
  if (i >= candidates.length)
    return (
      <div className={`${className} flex flex-col items-center justify-center gap-2 bg-mint p-2 text-center`}>
        <span className="text-4xl">📕</span>
        <span className="line-clamp-5 text-xs font-semibold leading-tight">{alt}</span>
      </div>
    );
  const next = () => setI(i + 1);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={candidates[i]}
      alt={alt}
      className={`${className} object-cover`}
      onError={next}
      // Image vide (1 pixel) : pas de couverture à cette adresse, on passe à la suivante.
      onLoad={(e) => e.currentTarget.naturalWidth < 10 && next()}
    />
  );
}
