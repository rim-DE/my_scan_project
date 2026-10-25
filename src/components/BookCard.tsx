"use client";

import { useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n";
import type { DetectionView } from "@/lib/queries";
import { formatPrice } from "@/lib/money";
import { PLATFORMS, platformName } from "@/lib/prices/platforms";
import { addManualPriceAction, addToListAction, addToStockAction, deletePriceAction, refreshPricesAction, saveNoteAction } from "@/app/actions";
import { shortAge } from "@/lib/prices/metrics";
import { SpineImage } from "./SpineImage";

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
  /** Livre sélectionné sur la photo (mis en évidence). */
  selected?: boolean;
  /** Clic sur la tranche : montrer le livre sur la photo. */
  onShowOnPhoto?: () => void;
}

const CONDITIONS = ["NEW", "LIKE_NEW", "VERY_GOOD", "GOOD", "ACCEPTABLE"] as const;

export function BookCard({ detection, photo, t, country, lists, path, locale, canNote = true, selected = false, onShowOnPhoto }: Props) {
  const [panel, setPanel] = useState<null | "stock" | "list" | "note" | "price">(null);
  const [note, setNote] = useState(detection.note ?? "");
  const [pending, start] = useTransition();
  const b = detection.book;
  const loc = locale === "en" ? "en-GB" : "fr-FR";
  const fp = (c: number | null | undefined, cur = "EUR") => formatPrice(c, cur, loc);
  const ring = selected ? "ring-2 ring-fuchsia-500" : "";
  const spine = photo && (detection.polygon || detection.bbox) && (
    <SpineImage
      src={photo.url}
      polygon={detection.polygon}
      bbox={detection.bbox}
      textDirection={detection.textDirection}
      alt={`${t.book.spineAlt} : ${detection.rawTitle ?? ""}`}
      onClick={onShowOnPhoto}
    />
  );

  if (!b) {
    return (
      <article id={detection.id} className={`card space-y-2 opacity-80 ${ring}`}>
        {spine}
        <p className="text-xs font-semibold uppercase text-red-600">{t.scan.unidentified}</p>
        <p className="font-medium">{detection.rawTitle}</p>
        {detection.rawAuthor && <p className="text-sm text-slate-500">{detection.rawAuthor}</p>}
      </article>
    );
  }

  const s = b.stats;
  const m = b.metrics;
  const amazon = b.prices.filter((p) => p.platform === "amazon" && p.offerType !== "SOLD" && p.offerType !== "BUYBACK");
  const amazonMin = amazon.length ? amazon.reduce((x, y) => (y.priceCents < x.priceCents ? y : x)) : null;
  const buyback = b.prices
    .filter((p) => p.offerType === "BUYBACK")
    .reduce<(typeof b.prices)[number] | null>((x, y) => (!x || y.priceCents > x.priceCents ? y : x), null);

  return (
    <article id={detection.id} className={`card space-y-4 ${ring}`}>
      {b.hasDemo && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">⚠️ {t.book.demoWarning}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex gap-4">
          {b.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.coverUrl} alt={b.title} className="h-44 w-32 shrink-0 rounded-lg object-cover shadow" />
          ) : (
            <div className="grid h-44 w-32 shrink-0 place-items-center rounded-lg bg-mint text-4xl">📕</div>
          )}
          <div className="min-w-0 space-y-1 text-sm">
            <h3 className="text-base font-semibold leading-tight">{b.title}</h3>
            <p className="text-slate-600">
              {b.authors.join(", ")}
              {b.publisher && ` · ${b.publisher}`}
              {b.publishedDate && ` · ${b.publishedDate}`}
            </p>
            <p title={t.book.netProfitHelp}>
              {t.book.netProfit} : <strong>{fp(s.netAfterFeesCents)}</strong>
            </p>
            <p title={t.book.weightedProfitHelp}>
              {t.book.weightedProfit} : <strong>{fp(m.weightedProfit30dCents)}</strong>
            </p>
            <p>
              {t.book.salesMedian} : <strong>{fp(s.medianCents)}</strong>
            </p>
            <p>
              {t.book.maxBuyLong} : <strong>{fp(s.maxBuyCents)}</strong>
            </p>
            <p className="font-semibold">{m.sales12m !== null ? fmt(t.book.salesYear, { n: m.sales12m }) : t.book.salesUnknown}</p>
            {m.currentPriceCents !== null && (
              <p className="text-xs">
                {amazonMin?.url ? (
                  <a href={amazonMin.url} target="_blank" rel="noopener noreferrer" className="underline">
                    Amazon · {fmt(t.book.currentlySold, { price: fp(amazonMin.priceCents, amazonMin.currency), n: amazon.length })}
                  </a>
                ) : (
                  fmt(t.book.currentlySold, { price: fp(m.currentPriceCents), n: m.currentOfferCount })
                )}
              </p>
            )}
            {buyback && (
              <p className="text-xs text-green-700">
                {fmt(t.book.buybackAgo, {
                  platform: platformName(buyback.platform),
                  price: fp(buyback.priceCents, buyback.currency),
                  age: shortAge(buyback.observedAt, new Date(), locale),
                })}
              </p>
            )}
            <p className="flex flex-wrap gap-x-4 text-xs text-slate-500">
              {m.ratio !== null && (
                <span>
                  {t.book.ratio} : {m.ratio}
                </span>
              )}
              {b.listPriceCents && (
                <span>
                  {t.book.publisherPrice} : {fp(b.listPriceCents)}
                </span>
              )}
            </p>
            {(b.isbn13 || b.isbn10) && (
              <p className="text-xs text-slate-500">
                ▮▯▮ {b.isbn13}
                {b.isbn10 && ` / ${b.isbn10}`}
              </p>
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          {spine}
          {m.lastSales.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="text-sm">
                <tbody>
                  <tr className="border-b border-slate-200">
                    <th className="py-1 pr-3 text-left font-semibold text-slate-600">{t.book.soldAgo}</th>
                    {m.lastSales.map((x, i) => (
                      <td key={i} className="px-2 text-center text-slate-600">
                        {shortAge(x.soldAt, new Date(), locale)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th className="py-1 pr-3 text-left font-semibold text-slate-600">{t.book.atPrice}</th>
                    {m.lastSales.map((x, i) => (
                      <td key={i} className="px-2 text-center font-medium">
                        {fp(x.priceCents)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-500">{t.book.noSales}</p>
          )}
        </div>
      </div>

      {b.prices.length === 0 ? (
        <p className="text-sm text-slate-500">{t.book.noPrice}</p>
      ) : (
        <details className="overflow-x-auto">
          <summary className="cursor-pointer text-sm text-brand">{fmt(t.book.allOffers, { n: b.prices.length })}</summary>
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
        </details>
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
