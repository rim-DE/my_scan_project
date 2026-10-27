"use client";

import { useState } from "react";
import type { Dict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n";
import type { DetectionView } from "@/lib/queries";
import { formatPrice } from "@/lib/money";
import { BookCover } from "./BookCover";

interface Props {
  bangers: DetectionView[];
  t: Dict;
  locale: string;
  onSee: (d: DetectionView) => void;
  onClose: () => void;
}

/** Popup qui présente les pépites du scan une par une, comme BiblioScan. */
export function BangerPopup({ bangers, t, locale, onSee, onClose }: Props) {
  const [i, setI] = useState(0);
  const d = bangers[Math.min(i, bangers.length - 1)];
  const b = d?.book;
  if (!b) return null;
  const fp = (c: number | null | undefined) => formatPrice(c, "EUR", locale === "en" ? "en-GB" : "fr-FR");
  const n = bangers.length;
  const cell = "rounded-xl bg-slate-50 p-2 text-center";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal aria-label={t.book.banger} onClick={onClose}>
      <div className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-lg font-bold">🏅 {fmt(t.scan.bangerTitle, { i: i + 1, n })}</p>
          <button onClick={onClose} className="rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-slate-100">
            {t.common.close}
          </button>
        </div>
        <p className="text-sm text-slate-600">{t.scan.bangerIntro}</p>
        <div className="flex gap-3">
          <BookCover src={b.coverUrl} isbn13={b.isbn13} alt={b.title} className="h-36 w-24 shrink-0 rounded-lg shadow" />
          <div className="min-w-0 space-y-1">
            <p className="font-semibold leading-tight">{b.title}</p>
            <p className="text-sm text-slate-600">{b.authors.join(", ")}</p>
            <p className="pt-1 text-xs uppercase tracking-wider text-slate-500">{t.book.weightedProfitShort}</p>
            <p className="text-3xl font-bold text-green-700">{fp(b.metrics.weightedProfit30dCents)}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className={cell}>
            <p className="text-xs text-slate-500">{t.book.salesMedian}</p>
            <p className="font-semibold">{fp(b.stats.medianCents)}</p>
          </div>
          <div className={cell}>
            <p className="text-xs text-slate-500">{t.book.netProfit}</p>
            <p className="font-semibold">{fp(b.stats.netAfterFeesCents)}</p>
          </div>
          <div className={cell}>
            <p className="text-xs text-slate-500">{t.book.in12Months}</p>
            <p className="font-semibold">{b.metrics.sales12m !== null ? fmt(t.book.salesCount, { n: b.metrics.sales12m }) : "—"}</p>
          </div>
          <div className={cell}>
            <p className="text-xs text-slate-500">{t.book.maxBuyShort}</p>
            <p className="font-semibold">{fp(b.stats.maxBuyCents)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {n > 1 && (
            <button className="btn flex-1 border border-slate-300 bg-white" onClick={() => setI((i - 1 + n) % n)}>
              ‹ {t.scan.bangerPrev}
            </button>
          )}
          {n > 1 && (
            <button className="btn flex-1 border border-slate-300 bg-white" onClick={() => setI((i + 1) % n)}>
              {t.scan.bangerNext} ›
            </button>
          )}
        </div>
        <button className="btn-primary w-full" onClick={() => onSee(d)}>
          {t.scan.bangerSee}
        </button>
      </div>
    </div>
  );
}
