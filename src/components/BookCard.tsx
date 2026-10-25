"use client";

import { useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n";
import type { DetectionView } from "@/lib/queries";
import { formatPrice } from "@/lib/money";
import { PLATFORMS, platformName } from "@/lib/prices/platforms";
import { addManualPriceAction, addToListAction, addToStockAction, deletePriceAction, refreshPricesAction, saveNoteAction } from "@/app/actions";
import { SpineCrop } from "./SpineCrop";

interface Props {
  detection: DetectionView;
  photo?: { url: string; width: number; height: number } | null;
  t: Dict;
  country: string;
  lists: { id: string; name: string }[];
  path: string;
  locale: string;
  /** Les notes sont rattachées à un livre d'un scan : pas de note sur la page "Calculer un prix". */
  canNote?: boolean;
}

const CONDITIONS = ["NEW", "LIKE_NEW", "VERY_GOOD", "GOOD", "ACCEPTABLE"] as const;

export function BookCard({ detection, photo, t, country, lists, path, locale, canNote = true }: Props) {
  const [panel, setPanel] = useState<null | "stock" | "list" | "note" | "price">(null);
  const [note, setNote] = useState(detection.note ?? "");
  const [pending, start] = useTransition();
  const b = detection.book;
  const loc = locale === "en" ? "en-GB" : "fr-FR";
  const fp = (c: number | null | undefined, cur = "EUR") => formatPrice(c, cur, loc);

  if (!b) {
    return (
      <article id={detection.id} className="card flex gap-4 opacity-80">
        {photo && detection.bbox && <SpineCrop src={photo.url} box={detection.bbox} photoW={photo.width} photoH={photo.height} />}
        <div>
          <p className="text-xs font-semibold uppercase text-red-600">{t.scan.unidentified}</p>
          <p className="font-medium">{detection.rawTitle}</p>
          {detection.rawAuthor && <p className="text-sm text-slate-500">{detection.rawAuthor}</p>}
        </div>
      </article>
    );
  }

  const s = b.stats;
  const amazon = b.prices.filter((p) => p.platform === "amazon");
  const momox = b.prices.find((p) => p.platform === "momox" && p.offerType === "BUYBACK");

  return (
    <article id={detection.id} className="card space-y-4">
      {b.hasDemo && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">⚠️ {t.book.demoWarning}</p>}

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex shrink-0 gap-3">
          {b.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.coverUrl} alt={b.title} className="h-44 w-32 rounded-lg object-cover shadow" />
          ) : (
            <div className="grid h-44 w-32 place-items-center rounded-lg bg-mint text-4xl">📕</div>
          )}
          {photo && detection.bbox && <SpineCrop src={photo.url} box={detection.bbox} photoW={photo.width} photoH={photo.height} />}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="text-lg font-semibold leading-tight">{b.title}</h3>
          <p className="text-sm text-slate-600">
            {b.authors.join(", ")}
            {b.publisher && ` · ${b.publisher}`}
            {b.publishedDate && ` · ${b.publishedDate}`}
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            {b.isbn13 && <span className="chip">ISBN {b.isbn13}</span>}
            {b.isbn10 && <span className="chip">▮▯▮ {b.isbn10}</span>}
            {b.listPriceCents && (
              <span className="chip">
                {t.book.publisherPrice} {fp(b.listPriceCents)}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-4 pt-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">{t.book.medianPrice}</p>
              <p className="text-4xl font-bold text-brand">{fp(s.medianCents)}</p>
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">{fmt(t.book.offers, { n: s.count })}</span>
            </div>
            {amazon.length > 0 && (
              <div className="rounded-2xl bg-amber-50 px-3 py-2 text-sm">
                <span className="font-semibold">Amazon</span> : {fp(Math.min(...amazon.map((a) => a.priceCents)), amazon[0].currency)}
              </div>
            )}
            {momox && (
              <div className="rounded-2xl bg-green-50 px-3 py-2 text-sm">
                <span className="font-semibold">Momox</span> {t.book.buyback.toLowerCase()} {fp(momox.priceCents)}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-4">
        {[
          [t.book.range, s.resaleRange ? `${fp(s.resaleRange[0])} – ${fp(s.resaleRange[1])}` : "—"],
          [t.book.netProfit, fp(s.netAfterFeesCents)],
          [t.book.maxBuy, fp(s.maxBuyCents)],
          [`${t.book.min} / ${t.book.max}`, `${fp(s.minCents)} / ${fp(s.maxCents)}`],
        ].map(([label, value]) => (
          <div key={label} className="bg-white p-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {b.prices.length === 0 ? (
        <p className="text-sm text-slate-500">{t.book.noPrice}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-1">{t.book.platform}</th>
                <th>{t.book.type}</th>
                <th>{t.book.price}</th>
                <th>{t.book.date}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {b.prices.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="py-1">{platformName(p.platform)}</td>
                  <td>
                    {t.book.offerTypes[p.offerType]}{" "}
                    <span className="text-[10px] text-slate-400">({t.book.sources[p.source as "api" | "manual" | "demo"] ?? p.source})</span>
                  </td>
                  <td className="font-medium">{fp(p.priceCents, p.currency)}</td>
                  <td className="text-xs text-slate-500">{new Date(p.observedAt).toLocaleDateString(loc)}</td>
                  <td className="space-x-2 text-right">
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-brand underline">
                        {t.book.link}
                      </a>
                    )}
                    {p.source === "manual" && (
                      <button className="text-xs text-red-600" onClick={() => start(() => deletePriceAction(p.id, path))}>
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {b.isbn13 && (
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-xs text-slate-500">{t.book.checkOn} :</span>
          {PLATFORMS.map((p) => (
            <a
              key={p.id}
              href={p.searchUrl({ isbn13: b.isbn13!, title: b.title })}
              target="_blank"
              rel="noopener noreferrer"
              className="chip hover:bg-mint"
              style={{ borderColor: p.color }}
              title={p.access}
            >
              {p.name}
            </a>
          ))}
        </div>
      )}

      {detection.note && panel !== "note" && <p className="rounded-xl bg-mint px-3 py-2 text-sm">📝 {detection.note}</p>}

      <div className="flex flex-wrap gap-2">
        <button className="btn-outline" onClick={() => setPanel(panel === "stock" ? null : "stock")}>📦 {t.book.addStock}</button>
        <button className="btn-outline" onClick={() => setPanel(panel === "list" ? null : "list")}>🛒 {t.book.addToList}</button>
        {canNote && (
          <button className="btn-outline" onClick={() => setPanel(panel === "note" ? null : "note")}>📝 {t.book.addNote}</button>
        )}
        <button className="btn-outline" onClick={() => setPanel(panel === "price" ? null : "price")}>➕ {t.book.addPrice}</button>
        <button className="btn-outline" disabled={pending} onClick={() => start(() => refreshPricesAction(b.id, country, path))}>
          🔄 {pending ? t.common.loading : t.book.refreshPrices}
        </button>
      </div>

      {panel === "stock" && (
        <form action={(fd) => start(async () => { await addToStockAction(fd); setPanel(null); })} className="flex flex-wrap gap-2">
          <input type="hidden" name="bookId" value={b.id} />
          <select name="condition" className="input w-auto" defaultValue="GOOD">
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>{t.conditions[c]}</option>
            ))}
          </select>
          <input name="purchasePrice" className="input w-32" placeholder={t.stock.purchasePrice} inputMode="decimal" />
          <button className="btn-primary">{t.common.save}</button>
        </form>
      )}

      {panel === "list" && (
        <form action={(fd) => start(async () => { await addToListAction(fd); setPanel(null); })} className="flex flex-wrap gap-2">
          <input type="hidden" name="bookId" value={b.id} />
          {lists.length === 0 ? (
            <a href="/lists" className="text-sm text-brand underline">{t.lists.newList}</a>
          ) : (
            <>
              <select name="listId" className="input w-auto">
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <button className="btn-primary">{t.common.save}</button>
            </>
          )}
        </form>
      )}

      {panel === "note" && (
        <div className="flex gap-2">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-primary" onClick={() => start(async () => { await saveNoteAction(detection.id, note); setPanel(null); })}>
            {t.book.saveNote}
          </button>
        </div>
      )}

      {panel === "price" && (
        <form action={(fd) => start(async () => { await addManualPriceAction(fd); setPanel(null); })} className="flex flex-wrap gap-2">
          <input type="hidden" name="bookId" value={b.id} />
          <input type="hidden" name="country" value={country} />
          <input type="hidden" name="path" value={path} />
          <select name="platform" className="input w-auto">
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select name="offerType" className="input w-auto" defaultValue="USED">
            {(["USED", "NEW", "BUYBACK", "SOLD"] as const).map((o) => (
              <option key={o} value={o}>{t.book.offerTypes[o]}</option>
            ))}
          </select>
          <input name="price" required className="input w-28" placeholder="12,50" inputMode="decimal" />
          <input name="url" className="input w-56" placeholder="https://…" />
          <button className="btn-primary">{t.common.save}</button>
        </form>
      )}
    </article>
  );
}
