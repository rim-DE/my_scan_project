"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Dict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n";
import type { DetectionView } from "@/lib/queries";
import { boxToQuad } from "@/lib/geometry";
import { BookCard } from "./BookCard";
import { BangerPopup } from "./BangerPopup";
import { ScanFilters } from "./ScanFilters";
import { DEFAULT_FILTERS, activeFilterCount, loadSavedFilters, passesFilters, saveFilters, smallSpines, type Filters } from "@/lib/filters";

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
  /** Pour ne montrer le popup des pépites qu'une fois par scan, et seulement une fois le scan fini. */
  scanId?: string;
  running?: boolean;
}

type Sort = "biblioRank" | "bangers" | "outOfStock" | "profit30" | "buyback" | "profit" | "median" | "current" | "sales" | "lastSale" | "position";

/** Valeur de tri d'un livre (plus grand = en premier) ; -1 quand l'information manque. */
function sortKey(d: DetectionView, sort: Sort): number {
  const b = d.book;
  if (!b) return -2;
  const s = b.stats;
  const m = b.metrics;
  switch (sort) {
    case "biblioRank":
    case "outOfStock":
      // À score égal (ou sans score), le gain espéré départage.
      return m.biblioRank === null ? -1 : m.biblioRank * 1e6 + (m.expected90dCents ?? 0);
    case "bangers":
    case "profit30":
      return m.weightedProfit30dCents ?? -1;
    case "buyback":
      return s.buybackMaxCents ?? -1;
    case "profit":
      return s.netAfterFeesCents ?? -1;
    case "median":
      return s.medianCents ?? -1;
    case "current":
      return m.currentPriceCents ?? -1;
    case "sales":
      return m.sales12m ?? -1;
    case "lastSale":
      return m.lastSales[0]?.priceCents ?? -1;
    default:
      return 0;
  }
}

/** Export CSV (séparateur « ; » pour Excel en français). */
function toCsv(rows: DetectionView[]): string {
  const cents = (c: number | null | undefined) => (c === null || c === undefined ? "" : (c / 100).toFixed(2).replace(".", ","));
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = ["Titre lu", "Titre", "Auteurs", "ISBN13", "BiblioRank", "Profit net", "Profit pondéré 30j", "Prix médian", "Prix max d'achat", "Ventes 12 mois", "Prix actuel", "Rachat", "Ratio", "Prix éditeur"];
  const lines = rows.map((d) => {
    const b = d.book;
    return [
      esc(d.rawTitle ?? ""),
      esc(b?.title ?? ""),
      esc(b?.authors.join(", ") ?? ""),
      b?.isbn13 ?? "",
      b?.metrics.biblioRank ?? "",
      cents(b?.stats.netAfterFeesCents),
      cents(b?.metrics.weightedProfit30dCents),
      cents(b?.stats.medianCents),
      cents(b?.stats.maxBuyCents),
      b?.metrics.sales12m ?? "",
      cents(b?.metrics.currentPriceCents),
      cents(b?.stats.buybackMaxCents),
      b?.metrics.ratio?.toString().replace(".", ",") ?? "",
      cents(b?.listPriceCents),
    ].join(";");
  });
  return "﻿" + [header.join(";"), ...lines].join("\n");
}

export function ScanViewer({ photos, detections, t, country, lists, path, locale, scanId, running = false }: Props) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("biblioRank");
  const [photoIdx, setPhotoIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const photoRef = useRef<HTMLElement>(null);
  const photo = photos[photoIdx];
  const bangers = useMemo(
    () => detections.filter((d) => d.book?.metrics.banger).sort((a, b) => sortKey(b, "profit30") - sortKey(a, "profit30")),
    [detections],
  );
  const [showBangers, setShowBangers] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const small = useMemo(() => smallSpines(detections, photos), [detections, photos]);

  // Filtres gardés « pour tous les scans » (dans ce navigateur).
  useEffect(() => setFilters(loadSavedFilters()), []);

  // À la fin du scan, on présente les pépites une seule fois (mémorisé dans le navigateur).
  useEffect(() => {
    if (running || !scanId || bangers.length === 0) return;
    const key = `bangers-seen:${scanId}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      // Stockage indisponible (navigation privée) : on montre quand même le popup.
    }
    setShowBangers(true);
  }, [running, scanId, bangers.length]);

  const shown = useMemo(() => {
    const needle = q.toLowerCase();
    const filtered = detections.filter((d) =>
      passesFilters(d, filters, small) &&
      // « Hors stock » : on cache les livres que tu as déjà ; « Pépites » : on ne garde qu'elles.
      !(sort === "outOfStock" && d.inStock) &&
      !(sort === "bangers" && !d.book?.metrics.banger) &&
      [d.rawTitle ?? "", d.rawAuthor ?? "", d.book?.title ?? "", d.book?.isbn13 ?? "", ...(d.book?.authors ?? [])].some((v) =>
        v.toLowerCase().includes(needle),
      ),
    );
    return sort === "position" ? filtered : [...filtered].sort((a, b) => sortKey(b, sort) - sortKey(a, sort));
  }, [detections, q, sort, filters, small]);
  const activeFilters = activeFilterCount(filters);

  const photoById = Object.fromEntries(photos.map((p) => [p.id, p]));

  /** Clic sur un livre de la photo : on le sélectionne et on fait défiler la liste jusqu'à lui. */
  function pickOnPhoto(id: string) {
    setSelected(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /** Clic sur une tranche dans la liste : on montre le livre sur la photo. */
  function showOnPhoto(d: DetectionView) {
    setSelected(d.id);
    const idx = photos.findIndex((p) => p.id === d.photoId);
    if (idx >= 0) setPhotoIdx(idx);
    photoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function exportCsv() {
    const url = URL.createObjectURL(new Blob([toCsv(shown)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "scan.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const sorts: [Sort, string][] = [
    ["biblioRank", t.scan.sortBiblioRank],
    ["bangers", t.scan.sortBangers],
    ["profit30", t.scan.sortProfit30],
    ["buyback", t.scan.sortBuyback],
    ["profit", t.scan.sortProfit],
    ["median", t.scan.sortMedian],
    ["current", t.scan.sortCurrent],
    ["sales", t.scan.sortSales],
    ["outOfStock", t.scan.sortOutOfStock],
    ["lastSale", t.scan.sortLastSale],
    ["position", t.scan.sortPosition],
  ];

  return (
    <div className="space-y-6">
      {photo && (
        <section ref={photoRef} className="card scroll-mt-4 p-2">
          <div className="relative mx-auto w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="" className="max-h-[75vh] w-auto rounded-2xl" />
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
              {detections
                .filter((d) => d.photoId === photo.id && (d.polygon || d.bbox))
                .map((d) => {
                  const quad = d.polygon ?? boxToQuad(d.bbox!);
                  const isSel = selected === d.id;
                  return (
                    <polygon
                      key={d.id}
                      points={quad.map((p) => `${p.x},${p.y}`).join(" ")}
                      className="cursor-pointer"
                      onClick={() => pickOnPhoto(d.id)}
                      vectorEffect="non-scaling-stroke"
                      strokeWidth={isSel ? 3 : 1.5}
                      strokeLinejoin="round"
                      stroke={isSel ? "#c026d3" : d.book ? "#dc2626" : "#f59e0b"}
                      fill={isSel ? "rgba(217,70,239,0.45)" : d.book ? "rgba(34,197,94,0.45)" : "rgba(245,158,11,0.25)"}
                    >
                      <title>{d.book?.title ?? d.rawTitle ?? ""}</title>
                    </polygon>
                  );
                })}
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
        <div className="card space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" onClick={exportCsv}>
              {t.scan.export}
            </button>
            <button className="btn rounded-full border border-slate-300 bg-white" onClick={() => setShowFilters(true)}>
              ⚙️ {t.scan.filters.button}
              {activeFilters > 0 && <span className="ml-1 rounded-full bg-brand px-2 text-xs text-white">{activeFilters}</span>}
            </button>
            {bangers.length > 0 && (
              <button className="btn rounded-full bg-yellow-400 font-semibold text-yellow-950" onClick={() => setShowBangers(true)}>
                {fmt(t.scan.bangersButton, { n: bangers.length })}
              </button>
            )}
            <input className="input min-w-0 flex-1" placeholder={t.scan.search} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <p className="text-center font-semibold">{t.scan.sortBy}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {sorts.map(([k, label]) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                className={`btn rounded-full text-sm ${sort === k ? "bg-brand text-white" : "border border-slate-300 bg-white"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-sm text-slate-600">{fmt(t.scan.booksFound, { n: shown.length })}</p>
        </div>
      )}

      {/* Liste déroulante de tous les livres : la tranche pour vérifier, les statistiques à côté. */}
      <div className="max-h-[85vh] space-y-4 overflow-y-auto pr-1">
        {shown.map((d) => (
          <BookCard
            key={d.id}
            detection={d}
            photo={d.photoId ? photoById[d.photoId] : null}
            photos={photos}
            t={t}
            country={country}
            lists={lists}
            path={path}
            locale={locale}
            selected={selected === d.id}
            onShowOnPhoto={() => showOnPhoto(d)}
          />
        ))}
      </div>

      {showFilters && (
        <ScanFilters
          detections={detections}
          filters={filters}
          t={t}
          locale={locale}
          onClose={() => setShowFilters(false)}
          onApply={(f) => {
            setFilters(f);
            setShowFilters(false);
          }}
          onSaveForAll={(f) => {
            saveFilters(f);
            setFilters(f);
            setShowFilters(false);
          }}
        />
      )}

      {showBangers && bangers.length > 0 && (
        <BangerPopup
          bangers={bangers}
          t={t}
          locale={locale}
          onClose={() => setShowBangers(false)}
          onSee={(d) => {
            setShowBangers(false);
            setQ("");
            setSelected(d.id);
            // On attend que la liste soit rendue sans filtre avant de faire défiler.
            setTimeout(() => document.getElementById(d.id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
          }}
        />
      )}
    </div>
  );
}
