"use client";

import { useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n";
import type { DetectionView } from "@/lib/queries";
import { formatPrice } from "@/lib/money";
import { PLATFORM_BY_ID, PLATFORMS, platformName, siteLinks } from "@/lib/prices/platforms";
import { addManualPriceAction, addToListAction, addToStockAction, deletePriceAction, refreshPricesAction, saveNoteAction } from "@/app/actions";
import { shortAge } from "@/lib/prices/metrics";
import { SpineImage } from "./SpineImage";
import { BooksIcon, LocationView, LocateIcon, MoreIcon, SalesHistory, Sheet, SiteLogo, SitesSheet, type PhotoInfo } from "./BookPanels";

interface Props {
  detection: DetectionView;
  photo?: { url: string; width: number; height: number } | null;
  /** Toutes les photos du scan, pour la vue « emplacement » (bouton « Charger toutes les images »). */
  photos?: PhotoInfo[];
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

export function BookCard({ detection, photo, photos = [], t, country, lists, path, locale, canNote = true, selected = false, onShowOnPhoto }: Props) {
  const [panel, setPanel] = useState<null | "stock" | "list" | "note" | "price">(null);
  const [sheet, setSheet] = useState<null | "locate" | "history" | "more">(null);
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
  const canLocate = !!photo && !!(detection.polygon || detection.bbox);
  const iconBtn = "grid h-10 w-10 place-items-center rounded-full text-brand hover:bg-mint";
  const icons = (
    <div className="flex shrink-0 flex-col gap-1">
      {canLocate && (
        <button className={iconBtn} onClick={() => setSheet("locate")} title={t.book.locate} aria-label={t.book.locate}>
          <LocateIcon />
        </button>
      )}
      {b && (
        <>
          <button className={iconBtn} onClick={() => setSheet("history")} title={t.book.salesHistory} aria-label={t.book.salesHistory}>
            <BooksIcon />
          </button>
          <button className={iconBtn} onClick={() => setSheet("more")} title={t.book.moreTitle} aria-label={t.book.moreTitle}>
            <MoreIcon />
          </button>
        </>
      )}
    </div>
  );
  const close = () => setSheet(null);
  const locateSheet = sheet === "locate" && (
    <Sheet title={t.book.locate} onClose={close} closeLabel={t.common.close}>
      <LocationView detection={detection} photos={photos.length ? photos : photo && detection.photoId ? [{ id: detection.photoId, ...photo }] : []} t={t} />
    </Sheet>
  );

  if (!b) {
    return (
      <article id={detection.id} className={`card space-y-2 ${ring}`}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 opacity-80">{spine}</div>
          {icons}
        </div>
        <p className="text-xs font-semibold uppercase text-red-600">{t.scan.unidentified}</p>
        <p className="font-medium">{detection.rawTitle}</p>
        {detection.rawAuthor && <p className="text-sm text-slate-500">{detection.rawAuthor}</p>}
        {locateSheet}
      </article>
    );
  }

  const s = b.stats;
  const m = b.metrics;
  const amazon = b.prices.filter((p) => p.platform === "amazon" && p.offerType !== "SOLD" && p.offerType !== "BUYBACK");
  const amazonMin = amazon.length ? amazon.reduce((x, y) => (y.priceCents < x.priceCents ? y : x)) : null;
  const amazonSearchUrl = siteLinks({ isbn13: b.isbn13, title: b.title, author: b.authors[0] }, []).find((l) => l.id === "amazon")!.url;
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
            {/* Toujours affiché : sans prix connu, c'est un raccourci vers la recherche Amazon de ce livre (par ISBN). */}
            <p className="flex items-center gap-1.5 text-xs">
              <SiteLogo id="amazon" color="#ff9900" size={18} />
              <a href={amazonMin?.url ?? amazonSearchUrl} target="_blank" rel="noopener noreferrer" className="underline">
                {amazonMin
                  ? fmt(t.book.currentlySold, { price: fp(amazonMin.priceCents, amazonMin.currency), n: amazon.length })
                  : m.currentPriceCents !== null
                    ? fmt(t.book.currentlySold, { price: fp(m.currentPriceCents), n: m.currentOfferCount })
                    : t.book.seeOnAmazon}
              </a>
            </p>
            {buyback && (
              <p className="flex items-center gap-1.5 text-xs">
                <SiteLogo id={buyback.platform} color={PLATFORM_BY_ID[buyback.platform]?.color ?? "#56b146"} size={18} />
                <a
                  href={buyback.url ?? PLATFORM_BY_ID[buyback.platform]?.searchUrl({ isbn13: b.isbn13 ?? "", title: b.title })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-700 underline"
                >
                  {fmt(t.book.buybackAgo, {
                    platform: platformName(buyback.platform).toLowerCase(),
                    price: fp(buyback.priceCents, buyback.currency),
                    age: shortAge(buyback.observedAt, new Date(), locale),
                  })}
                </a>
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

        <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1 space-y-3">
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
        {icons}
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

      {locateSheet}
      {sheet === "history" && (
        <Sheet title={t.book.salesHistory} onClose={close} closeLabel={t.common.close}>
          <SalesHistory book={b} t={t} locale={locale} />
        </Sheet>
      )}
      {sheet === "more" && (
        <Sheet title={b.title} onClose={close} closeLabel={t.common.close}>
          <SitesSheet
            book={b}
            t={t}
            locale={locale}
            refreshing={pending}
            onRefresh={() => start(() => refreshPricesAction(b.id, country, path))}
            actions={[
              ...(b.isbn13
                ? [{ label: t.book.actionInfo, icon: "ℹ️", onClick: () => window.open(`https://books.google.com/books?vid=ISBN${b.isbn13}`, "_blank", "noopener") }]
                : []),
              { label: t.book.actionChart, icon: "📈", onClick: () => setSheet("history") },
              { label: t.book.actionShare, icon: "📤", onClick: () => share(b.title, b.isbn13) },
              { label: t.book.actionList, icon: "🛒", onClick: () => { setSheet(null); setPanel("list"); } },
              { label: t.book.actionStock, icon: "📦", onClick: () => { setSheet(null); setPanel("stock"); } },
              ...(canNote ? [{ label: t.book.actionNote, icon: "📝", onClick: () => { setSheet(null); setPanel("note"); } }] : []),
            ]}
          />
        </Sheet>
      )}
    </article>
  );
}

/** Partage du livre (feuille de partage du téléphone, sinon copie dans le presse-papier). */
function share(title: string, isbn13: string | null) {
  const text = isbn13 ? `${title} — ISBN ${isbn13}` : title;
  if (navigator.share) navigator.share({ title, text }).catch(() => {});
  else navigator.clipboard?.writeText(text).catch(() => {});
}
