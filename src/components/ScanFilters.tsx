"use client";

import { useMemo, useState } from "react";
import type { Dict } from "@/lib/i18n";
import type { DetectionView } from "@/lib/queries";
import { RANGE_KEYS, rangeValue, type FilterFlags, type Filters, type RangeKey } from "@/lib/filters";

interface Props {
  detections: DetectionView[];
  filters: Filters;
  t: Dict;
  locale: string;
  onApply: (f: Filters) => void;
  onSaveForAll: (f: Filters) => void;
  onClose: () => void;
}

const FLAG_KEYS: (keyof FilterFlags)[] = ["hideUnder12", "hideSoldNew", "onlyInteresting", "hideSmallSpines", "hideShortOcr", "onlyNotSold"];
const BINS = 20;
/** Valeurs entières (pas de décimales dans les champs). */
const INTEGER: RangeKey[] = ["sales12m", "salesRank"];

/** Panneau « Filtres » façon BiblioScan : cases à cocher, puis une fourchette avec histogramme par indicateur. */
export function ScanFilters({ detections, filters, t, locale, onApply, onSaveForAll, onClose }: Props) {
  const [draft, setDraft] = useState<Filters>(filters);
  const f = t.scan.filters;

  // Valeurs connues de chaque indicateur dans ce scan, pour les bornes et les histogrammes.
  const values = useMemo(() => {
    const out = {} as Record<RangeKey, number[]>;
    for (const key of RANGE_KEYS) out[key] = detections.map((d) => rangeValue(d, key)).filter((v): v is number => v !== null);
    return out;
  }, [detections]);

  const setFlag = (k: keyof FilterFlags, v: boolean) => setDraft((d) => ({ ...d, flags: { ...d.flags, [k]: v } }));
  const setRange = (key: RangeKey, r: [number, number] | null) =>
    setDraft((d) => {
      const ranges = { ...d.ranges };
      if (r) ranges[key] = r;
      else delete ranges[key];
      return { ...d, ranges };
    });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal aria-label={f.title} onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-3xl bg-white sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <p className="text-center text-lg font-bold">{f.title}</p>
          <div className="space-y-4">
            {FLAG_KEYS.map((k) => (
              <label key={k} className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-brand" checked={draft.flags[k]} onChange={(e) => setFlag(k, e.target.checked)} />
                <span>
                  {f.flags[k]}
                  {k === "onlyInteresting" && <span className="block text-xs text-slate-500">{t.book.bangerHelp}</span>}
                </span>
              </label>
            ))}
          </div>
          {RANGE_KEYS.map((key) =>
            values[key].length > 1 ? (
              <RangeFilter
                key={key}
                label={f.ranges[key]}
                values={values[key]}
                value={draft.ranges[key] ?? null}
                integer={INTEGER.includes(key)}
                minLabel={f.min}
                maxLabel={f.max}
                locale={locale}
                onChange={(r) => setRange(key, r)}
              />
            ) : null,
          )}
        </div>
        <div className="flex gap-2 border-t border-slate-200 p-3">
          <button className="btn flex-1 border border-slate-300 bg-white text-sm" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button className="btn flex-[2] bg-green-600 text-sm font-semibold text-white" onClick={() => onSaveForAll(draft)}>
            {f.saveForAll}
          </button>
          <button className="btn-primary flex-1 text-sm" onClick={() => onApply(draft)}>
            {f.apply}
          </button>
        </div>
      </div>
    </div>
  );
}

function RangeFilter({
  label,
  values,
  value,
  integer,
  minLabel,
  maxLabel,
  locale,
  onChange,
}: {
  label: string;
  values: number[];
  value: [number, number] | null;
  integer: boolean;
  minLabel: string;
  maxLabel: string;
  locale: string;
  onChange: (r: [number, number] | null) => void;
}) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const [a, b] = value ?? [lo, hi];
  const step = integer ? 1 : (hi - lo) / 200 || 0.01;
  const round = (n: number) => (integer ? Math.round(n) : Math.round(n * 100) / 100);

  // Histogramme : nombre de livres par tranche de valeurs.
  const counts = Array(BINS).fill(0) as number[];
  for (const v of values) counts[Math.min(BINS - 1, Math.floor(((v - lo) / (hi - lo || 1)) * BINS))]++;
  const top = Math.max(...counts);

  const set = (na: number, nb: number) => {
    const r: [number, number] = [round(Math.max(lo, Math.min(na, nb))), round(Math.min(hi, Math.max(na, nb)))];
    // Revenir aux bornes complètes = plus de filtre.
    onChange(r[0] <= lo && r[1] >= hi ? null : r);
  };
  const num = (n: number) => n.toLocaleString(locale === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 2 });

  return (
    <div className="space-y-2">
      <p className="text-center text-sm font-semibold text-slate-600">{label}</p>
      <div className="grid grid-cols-2 gap-3 text-xs text-slate-500">
        <label className="space-y-1 text-center">
          <span>{minLabel}</span>
          <input className="input text-sm" inputMode="decimal" defaultValue={num(a)} key={`a${a}`} onBlur={(e) => set(parse(e.target.value, lo), b)} />
        </label>
        <label className="space-y-1 text-center">
          <span>{maxLabel}</span>
          <input className="input text-sm" inputMode="decimal" defaultValue={num(b)} key={`b${b}`} onBlur={(e) => set(a, parse(e.target.value, hi))} />
        </label>
      </div>
      <div className="flex h-16 items-end gap-px">
        {counts.map((c, i) => {
          const from = lo + ((hi - lo) * i) / BINS;
          const inside = from + (hi - lo) / BINS >= a && from <= b;
          return <div key={i} className={`flex-1 ${inside ? "bg-brand" : "bg-slate-200"}`} style={{ height: c ? `${Math.max(6, (c / top) * 100)}%` : 0 }} />;
        })}
      </div>
      {/* Deux curseurs superposés : le minimum et le maximum. */}
      <div className="dual-range relative h-6">
        <input type="range" min={lo} max={hi} step={step} value={a} aria-label={minLabel} onChange={(e) => set(Number(e.target.value), b)} />
        <input type="range" min={lo} max={hi} step={step} value={b} aria-label={maxLabel} onChange={(e) => set(a, Number(e.target.value))} />
      </div>
    </div>
  );
}

function parse(s: string, fallback: number): number {
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}
