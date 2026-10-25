"use client";

import { useMemo, useState } from "react";
import type { Dict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n";
import type { DetectionView } from "@/lib/queries";
import { BookCard } from "./BookCard";

interface PhotoInfo {
  id: string;
  url: string;
  width: number;
  height: number;
}

interface Props {
  photos: PhotoInfo[];
  detections: DetectionView[];
  t: Dict;
  country: string;
  lists: { id: string; name: string }[];
  path: string;
  locale: string;
}

type Sort = "position" | "median" | "profit" | "buyback";

export function ScanViewer({ photos, detections, t, country, lists, path, locale }: Props) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("position");
  const [photoIdx, setPhotoIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const photo = photos[photoIdx];

  const shown = useMemo(() => {
    const needle = q.toLowerCase();
    const filtered = detections.filter((d) =>
      [d.rawTitle ?? "", d.rawAuthor ?? "", d.book?.title ?? "", d.book?.isbn13 ?? "", ...(d.book?.authors ?? [])].some((v) =>
        v.toLowerCase().includes(needle),
      ),
    );
    const key = (d: DetectionView): number => {
      const s = d.book?.stats;
      if (!s) return -1;
      if (sort === "median") return s.medianCents ?? -1;
      if (sort === "profit") return s.netAfterFeesCents ?? -1;
      if (sort === "buyback") return s.buybackMaxCents ?? -1;
      return 0;
    };
    return sort === "position" ? filtered : [...filtered].sort((a, b) => key(b) - key(a));
  }, [detections, q, sort]);

  const photoById = Object.fromEntries(photos.map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
      {photo && (
        <section className="card p-2">
          <div className="relative mx-auto w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="" className="max-h-[75vh] w-auto rounded-2xl" />
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
              {detections
                .filter((d) => d.photoId === photo.id && d.bbox)
                .map((d) => (
                  <a key={d.id} href={`#${d.id}`} onClick={() => setSelected(d.id)}>
                    <rect
                      x={d.bbox!.x}
                      y={d.bbox!.y}
                      width={d.bbox!.w}
                      height={d.bbox!.h}
                      vectorEffect="non-scaling-stroke"
                      strokeWidth={selected === d.id ? 3 : 1.5}
                      stroke={d.book ? "#16a34a" : "#dc2626"}
                      fill={selected === d.id ? "rgba(217,70,239,0.45)" : d.book ? "rgba(34,197,94,0.25)" : "rgba(220,38,38,0.15)"}
                    >
                      <title>{d.book?.title ?? d.rawTitle ?? ""}</title>
                    </rect>
                  </a>
                ))}
            </svg>
            {photos.length > 1 && (
              <div className="absolute right-3 bottom-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-sm text-white">
                <button onClick={() => setPhotoIdx((photoIdx - 1 + photos.length) % photos.length)}>‹</button>
                {photoIdx + 1} / {photos.length}
                <button onClick={() => setPhotoIdx((photoIdx + 1) % photos.length)}>›</button>
              </div>
            )}
          </div>
        </section>
      )}

      {detections.length > 0 && (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">{fmt(t.scan.booksFound, { n: detections.length })}</p>
        <input className="input" placeholder={t.scan.search} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["position", t.scan.sortPosition],
              ["median", t.scan.sortMedian],
              ["profit", t.scan.sortProfit],
              ["buyback", t.scan.sortBuyback],
            ] as const
          ).map(([k, label]) => (
            <button key={k} onClick={() => setSort(k)} className={`btn ${sort === k ? "bg-brand text-white" : "border border-slate-300 bg-white"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      )}

      <div className="space-y-4">
        {shown.map((d) => (
          <BookCard
            key={d.id}
            detection={d}
            photo={d.photoId ? photoById[d.photoId] : null}
            t={t}
            country={country}
            lists={lists}
            path={path}
            locale={locale}
          />
        ))}
      </div>
    </div>
  );
}
