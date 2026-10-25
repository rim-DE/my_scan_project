"use client";

import { useEffect, useRef } from "react";
import { boxToQuad, spineFrame, spineTransform, type NormalizedBox, type Point, type TextDirection } from "@/lib/geometry";

interface Props {
  src: string;
  polygon: Point[] | null;
  bbox: NormalizedBox | null;
  textDirection: TextDirection | null;
  /** Hauteur affichée de la vignette, en pixels. */
  height?: number;
  alt: string;
  onClick?: () => void;
}

// Une seule image chargée par photo, partagée entre toutes les vignettes de la page.
const cache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string): Promise<HTMLImageElement> {
  let p = cache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    cache.set(src, p);
  }
  return p;
}

/**
 * Tranche du livre découpée sur la photo et redressée à l'horizontale, texte à l'endroit,
 * pour vérifier d'un coup d'œil que le livre identifié est le bon.
 */
export function SpineImage({ src, polygon, bbox, textDirection, height = 44, alt, onClick }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const quad = polygon ?? (bbox ? boxToQuad(bbox) : null);
  const key = JSON.stringify(quad);

  useEffect(() => {
    if (!quad) return;
    let cancelled = false;
    loadImage(src).then((img) => {
      const canvas = ref.current;
      if (cancelled || !canvas) return;
      const frame = spineFrame(quad, img.naturalWidth, img.naturalHeight, textDirection);
      // Rendu net sur écran haute densité, sans agrandir au-delà de 3× la photo.
      const scale = Math.min(3, (height * (window.devicePixelRatio || 1)) / Math.max(1, frame.thickness));
      canvas.width = Math.max(1, Math.round(frame.length * scale));
      canvas.height = Math.max(1, Math.round(frame.thickness * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(...spineTransform(frame, scale));
      ctx.drawImage(img, 0, 0);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, key, textDirection, height]);

  if (!quad) return null;
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={alt}
      title={alt}
      onClick={onClick}
      className={`block h-auto max-w-full rounded-md border border-slate-200 bg-slate-100 ${onClick ? "cursor-pointer" : ""}`}
      style={{ maxHeight: height }}
    />
  );
}
