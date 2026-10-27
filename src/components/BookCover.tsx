"use client";

import { useState } from "react";

/**
 * Couverture d'un livre. Sans image connue, on essaie Open Library par ISBN ;
 * si rien ne charge, on affiche un livre stylisé.
 */
export function BookCover({ src, isbn13, alt, className }: { src: string | null; isbn13: string | null; alt: string; className: string }) {
  // « default=false » : Open Library répond 404 au lieu d'une image vide quand il n'a pas la couverture.
  const candidates = [src, isbn13 ? `https://covers.openlibrary.org/b/isbn/${isbn13}-M.jpg?default=false` : null].filter(
    (u): u is string => !!u,
  );
  const [i, setI] = useState(0);
  if (i >= candidates.length) return <div className={`${className} grid place-items-center bg-mint text-4xl`}>📕</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={candidates[i]} alt={alt} className={`${className} object-cover`} onError={() => setI(i + 1)} />;
}
