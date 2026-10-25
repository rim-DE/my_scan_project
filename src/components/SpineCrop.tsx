import type { NormalizedBox } from "@/lib/vision";

/** Affiche la zone de la photo correspondant au livre (sans recadrer l'image côté serveur). */
export function SpineCrop({ src, box, photoW, photoH }: { src: string; box: NormalizedBox; photoW: number; photoH: number }) {
  const pxW = box.w * photoW;
  const pxH = box.h * photoH;
  const pos = (start: number, size: number) => (size >= 1 ? 0 : (start / (1 - size)) * 100);
  return (
    <div
      className="max-h-48 max-w-full rounded-lg border border-slate-200 bg-no-repeat"
      style={{
        aspectRatio: `${pxW} / ${pxH}`,
        height: pxH > pxW ? "12rem" : undefined,
        width: pxH > pxW ? undefined : "100%",
        backgroundImage: `url(${src})`,
        backgroundSize: `${100 / box.w}% ${100 / box.h}%`,
        backgroundPosition: `${pos(box.x, box.w)}% ${pos(box.y, box.h)}%`,
      }}
      role="img"
      aria-label="Tranche du livre"
    />
  );
}
