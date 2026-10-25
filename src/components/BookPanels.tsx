"use client";

// Les trois boutons à droite de la tranche, comme dans BiblioScan :
// - emplacement : la photo avec le livre surligné et un rond qui clignote dessus ;
// - historique : toutes les ventes connues sur 12 mois, avec un graphique par mois ;
// - « … » : les sites de vente (lien vers les annonces de ce livre) et la meilleure offre Amazon.
import { useEffect, useState, type ReactNode } from "react";
import type { Dict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n";
import type { BookView, DetectionView } from "@/lib/queries";
import { boxToQuad } from "@/lib/geometry";
import { formatPrice } from "@/lib/money";
import { bestAmazonOffer, platformName, siteLinks } from "@/lib/prices/platforms";
import { SpineImage } from "./SpineImage";

export interface PhotoInfo {
  id: string;
  url: string;
  width: number;
  height: number;
}

const loc = (locale: string) => (locale === "en" ? "en-GB" : "fr-FR");

/* ---------- Icônes ---------- */

const svgProps = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function LocateIcon() {
  return (
    <svg {...svgProps} aria-hidden>
      <path d="M12 2v6M9.5 4.5 12 2l2.5 2.5M12 22v-6M9.5 19.5 12 22l2.5-2.5M2 12h6M4.5 9.5 2 12l2.5 2.5M22 12h-6M19.5 9.5 22 12l-2.5 2.5" />
    </svg>
  );
}

export function BooksIcon() {
  return (
    <svg {...svgProps} aria-hidden>
      <rect x="3" y="4" width="4" height="16" rx="1" />
      <rect x="8.5" y="6" width="4" height="14" rx="1" />
      <path d="m14.5 7.2 3.8-1.1 3.4 12.8-3.8 1.1z" />
    </svg>
  );
}

export function MoreIcon() {
  return (
    <svg {...svgProps} aria-hidden>
      <circle cx="5" cy="12" r="1.3" fill="currentColor" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
      <circle cx="19" cy="12" r="1.3" fill="currentColor" />
    </svg>
  );
}

const INITIALS: Record<string, string> = {
  chasseauxlivres: "CL",
  ebay: "eb",
  fnac: "F",
  rakuten: "R",
  vinted: "V",
  leboncoin: "lbc",
  momox: "m",
  recyclivre: "Rc",
  abebooks: "A",
  keepa: "K",
};

/** Pastille d'un site : un « a » souriant pour Amazon, des initiales sur la couleur du site pour les autres. */
export function SiteLogo({ id, color, size = 20 }: { id: string; color: string; size?: number }) {
  if (id === "amazon") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
        <rect width="24" height="24" rx="6" fill="#232f3e" />
        <text x="12" y="14.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">
          a
        </text>
        <path d="M6.5 16.5q5.5 3 11 0" stroke="#ff9900" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="m16 15.4 1.8 1-1.2 1.6" stroke="#ff9900" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const txt = INITIALS[id] ?? id.slice(0, 1).toUpperCase();
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-md font-bold text-white"
      style={{ background: color, width: size, height: size, fontSize: size * (txt.length > 2 ? 0.36 : 0.5) }}
    >
      {txt}
    </span>
  );
}

/* ---------- Fenêtre ---------- */

/** Fenêtre qui monte du bas de l'écran (centrée sur ordinateur). Échap ou clic à côté pour fermer. */
export function Sheet({ title, onClose, closeLabel, children }: { title: string; onClose: () => void; closeLabel: string; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-4 shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn-outline px-3 py-1" onClick={onClose} aria-label={closeLabel}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- 1. Emplacement sur la photo ---------- */

export function LocationView({ detection, photos, t }: { detection: DetectionView; photos: PhotoInfo[]; t: Dict }) {
  const own = photos.filter((p) => p.id === detection.photoId);
  const [all, setAll] = useState(false);
  const list = all || own.length === 0 ? photos : own;
  const [idx, setIdx] = useState(Math.max(0, list.findIndex((p) => p.id === detection.photoId)));
  const photo = list[Math.min(idx, list.length - 1)];
  const quad = detection.polygon ?? (detection.bbox ? boxToQuad(detection.bbox) : null);
  const here = photo && photo.id === detection.photoId && quad;
  const cx = quad ? quad.reduce((s, p) => s + p.x, 0) / quad.length : 0;
  const cy = quad ? quad.reduce((s, p) => s + p.y, 0) / quad.length : 0;
  const b = detection.book;

  function toggleAll() {
    const next = all ? own : photos;
    setAll(!all);
    setIdx(Math.max(0, next.findIndex((p) => p.id === detection.photoId)));
  }

  return (
    <div className="space-y-3">
      {photo && (
        <div className="relative mx-auto w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt="" className="max-h-[60vh] w-auto rounded-2xl" />
          {here && (
            <>
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
                <polygon
                  points={quad.map((p) => `${p.x},${p.y}`).join(" ")}
                  className="animate-pulse"
                  fill="rgba(217,70,239,0.55)"
                  stroke="#c026d3"
                  strokeWidth={3}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {/* Le rond qui clignote, centré sur le livre. */}
              <span className="pointer-events-none absolute" style={{ left: `${cx * 100}%`, top: `${cy * 100}%` }}>
                <span className="absolute -top-7 -left-7 block h-14 w-14 animate-ping rounded-full border-4 border-fuchsia-500" />
                <span className="absolute -top-7 -left-7 block h-14 w-14 rounded-full border-4 border-fuchsia-500/80" />
              </span>
            </>
          )}
          {list.length > 1 && (
            <div className="absolute right-3 bottom-3 flex items-center gap-3 rounded-full bg-black/60 px-3 py-1 text-sm text-white">
              <button onClick={() => setIdx((idx - 1 + list.length) % list.length)} aria-label="‹">‹</button>
              {idx + 1} / {list.length}
              <button onClick={() => setIdx((idx + 1) % list.length)} aria-label="›">›</button>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-slate-600">
          {list.length > 0 ? `${Math.min(idx, list.length - 1) + 1} / ${list.length}` : ""}
          {photo && !here && ` · ${t.book.notOnThisPhoto}`}
        </span>
        {photos.length > 1 && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={all} onChange={toggleAll} />
            {t.book.loadAllImages}
          </label>
        )}
      </div>
      {photo && own[0] && (
        <SpineImage
          src={own[0].url}
          polygon={detection.polygon}
          bbox={detection.bbox}
          textDirection={detection.textDirection}
          height={64}
          alt={`${t.book.spineAlt} : ${detection.rawTitle ?? ""}`}
        />
      )}
      {b && (b.isbn13 || b.isbn10) && (
        <p className="text-center text-sm font-medium">
          {[b.isbn13, b.isbn10].filter(Boolean).join(" | ")}
        </p>
      )}
    </div>
  );
}

/* ---------- 2. Historique des ventes ---------- */

export function SalesHistory({ book, t, locale }: { book: BookView; t: Dict; locale: string }) {
  const m = book.metrics;
  const fp = (c: number | null | undefined) => formatPrice(c, "EUR", loc(locale));
  const now = new Date();
  // 12 barres, une par mois, du plus ancien (à gauche) au mois en cours (à droite).
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const count = m.sales.filter((s) => {
      const x = new Date(s.soldAt);
      return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth();
    }).length;
    return { label: d.toLocaleDateString(loc(locale), { month: "short" }), count };
  });
  const max = Math.max(1, ...months.map((x) => x.count));
  const H = 90;

  return (
    <div className="space-y-4 text-sm">
      <p>
        <strong>{m.sales12m !== null ? fmt(t.book.salesYear, { n: m.sales12m }) : t.book.salesUnknown}</strong>
        {m.sales30d !== null && ` · ${fmt(t.book.sales30, { n: m.sales30d })}`}
      </p>
      {m.sales.length > 0 && (
        <figure>
          <figcaption className="mb-1 text-xs text-slate-500">{t.book.salesPerMonth}</figcaption>
          <svg viewBox={`0 0 ${12 * 30} ${H + 18}`} className="w-full" role="img" aria-label={t.book.salesPerMonth}>
            <line x1="0" x2={12 * 30} y1={H} y2={H} stroke="#cbd5e1" strokeWidth="1" />
            {months.map((x, i) => {
              const h = (x.count / max) * (H - 14);
              return (
                <g key={i}>
                  <rect x={i * 30 + 6} y={0} width={18} height={H} fill="transparent">
                    <title>{`${x.label} : ${x.count}`}</title>
                  </rect>
                  {x.count > 0 && (
                    <path
                      d={`M${i * 30 + 6},${H} v${-(h - 4)} q0,-4 4,-4 h10 q4,0 4,4 v${h - 4} z`}
                      fill="#0f3d3e"
                      pointerEvents="none"
                    />
                  )}
                  {x.count > 0 && (
                    <text x={i * 30 + 15} y={H - h - 3} textAnchor="middle" fontSize="10" fill="#334155">
                      {x.count}
                    </text>
                  )}
                  <text x={i * 30 + 15} y={H + 13} textAnchor="middle" fontSize="9" fill="#64748b">
                    {x.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </figure>
      )}
      {m.sales.length === 0 ? (
        <p className="text-slate-500">{t.book.noSales}</p>
      ) : (
        <table className="w-full">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1">{t.book.date}</th>
              <th>{t.book.platform}</th>
              <th className="text-right">{t.book.price}</th>
            </tr>
          </thead>
          <tbody>
            {m.sales.map((s, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="py-1">{new Date(s.soldAt).toLocaleDateString(loc(locale))}</td>
                <td>{s.platform ? platformName(s.platform) : "—"}</td>
                <td className="text-right font-medium">{fp(s.priceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ---------- 3. « … » : sites de vente et meilleure offre Amazon ---------- */

export interface SheetAction {
  label: string;
  icon: string;
  onClick: () => void;
}

export function SitesSheet({
  book,
  t,
  locale,
  actions,
  refreshing,
  onRefresh,
}: {
  book: BookView;
  t: Dict;
  locale: string;
  actions: SheetAction[];
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const fp = (c: number | null | undefined, cur = "EUR") => formatPrice(c, cur, loc(locale));
  const sites = siteLinks({ isbn13: book.isbn13, title: book.title, author: book.authors[0] }, book.prices);
  const best = bestAmazonOffer(book.prices);

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-1 overflow-x-auto pb-2">
        {sites.map((s) => (
          <a
            key={s.id}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-20 shrink-0 flex-col items-center gap-1 rounded-2xl p-2 text-center hover:bg-mint"
            title={`${s.name} : ${t.book.seeListings}`}
          >
            <SiteLogo id={s.id} color={s.color} size={40} />
            <span className="text-[11px] leading-tight">{s.name}</span>
            <span className={`text-xs font-semibold ${s.priceKind === "buyback" ? "text-green-700" : ""}`}>
              {s.priceCents !== null ? (s.priceKind === "buyback" ? `↩ ${fp(s.priceCents)}` : fp(s.priceCents)) : "—"}
            </span>
          </a>
        ))}
        {actions.map((a) => (
          <button key={a.label} onClick={a.onClick} className="flex w-20 shrink-0 flex-col items-center gap-1 rounded-2xl p-2 text-center hover:bg-mint">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-xl" aria-hidden>
              {a.icon}
            </span>
            <span className="text-[11px] leading-tight">{a.label}</span>
          </button>
        ))}
      </div>
      {!book.isbn13 && <p className="text-xs text-slate-500">{t.book.noIsbnLinks}</p>}

      <section className="rounded-2xl border border-slate-200 p-4">
        <div className="mb-2 flex items-center gap-2">
          <SiteLogo id="amazon" color="#ff9900" size={24} />
          <h3 className="font-semibold">{t.book.buyBoxTitle}</h3>
        </div>
        {best ? (
          <div className="space-y-1 text-sm">
            <p className="text-xs text-slate-500">
              {fmt(t.book.observedOn, {
                date: new Date(best.observedAt).toLocaleString(loc(locale), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
              })}
            </p>
            <p className="text-xs font-semibold tracking-wide text-slate-600 uppercase">{t.book.offerTypes[best.offerType]}</p>
            <p className="text-2xl font-bold">{fp(best.priceCents, best.currency)}</p>
            <p className="flex flex-wrap gap-2">
              <span className="chip">{t.book.sources[best.source as "api" | "manual" | "demo"] ?? best.source}</span>
              {best.url && (
                <a href={best.url} target="_blank" rel="noopener noreferrer" className="chip text-brand underline">
                  {t.book.seeOffer}
                </a>
              )}
            </p>
            <p className="pt-1 text-xs text-slate-500">{t.book.buyBoxNote}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t.book.noAmazonOffer}</p>
        )}
        <button className="btn-primary mt-3 w-full" disabled={refreshing} onClick={onRefresh}>
          🔄 {refreshing ? t.common.loading : t.book.refreshPrices}
        </button>
      </section>
    </div>
  );
}
