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

  const momoxUrl = PLATFORM_BY_ID.momox?.searchUrl({ isbn13: b.isbn13 ?? "", title: b.title });
  const amazonText = amazonMin
    ? fmt(t.book.currentlySoldShort, { price: fp(amazonMin.priceCents, amazonMin.currency), n: m.currentOfferCount || amazon.length })
    : m.currentPriceCents !== null
      ? fmt(t.book.currentlySoldShort, { price: fp(m.currentPriceCents), n: m.currentOfferCount })
      : t.book.seeOnAmazon;
  const footer = [
    m.ratio !== null && (
      <span key="ratio">
        {t.book.ratio} <strong>{m.ratio.toLocaleString(loc)}</strong>
      </span>
    ),
    b.listPriceCents !== null && (
      <span key="list">
        {t.book.publisherPrice} <strong>{fp(b.listPriceCents)}</strong>
      </span>
    ),
    b.rating !== null && (
      <span key="rating">
        <span className="text-amber-500">★</span> {b.rating.toLocaleString(loc)}
        {b.reviewCount !== null && ` (${b.reviewCount.toLocaleString(loc)})`}
      </span>
    ),
    b.salesRank !== null && (
      <span key="rank" title={t.book.salesRankHelp}>
        {t.book.salesRank} <strong>#{b.salesRank.toLocaleString(loc)}</strong>
      </span>
    ),
  ].filter(Boolean);

  // Mise en page inspirée de BiblioScan : prix médian en grand, ventes, Amazon, rachat, puis les indicateurs.
  return (
    <article id={detection.id} className={`card space-y-4 ${ring}`}>
      {b.hasDemo && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">⚠️ {t.book.demoWarning}</p>}

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h3 className="text-base font-semibold leading-tight">{b.title}</h3>
            <p className="text-sm text-slate-600">
              {b.authors.join(", ")}
              {b.publisher && ` · ${b.publisher}`}
              {b.publishedDate && ` · ${b.publishedDate}`}
            </p>
          </div>
          {spine}
        </div>
        {icons}
      </div>

      <div className="flex gap-4">
        {b.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.coverUrl} alt={b.title} className="h-48 w-32 shrink-0 rounded-lg object-cover shadow" />
        ) : (
          <div className="grid h-48 w-32 shrink-0 place-items-center rounded-lg bg-mint text-4xl">📕</div>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          {/* Sans vente connue, la médiane vient des offres en cours : on le dit. */}
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            {m.sales.length > 0 ? t.book.salesMedian : t.book.offersMedian}
          </p>
          <p className="text-4xl font-bold leading-none">{fp(s.medianCents)}</p>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            {m.sales12m !== null ? (
              <>
                <span className={`rounded-full px-3 py-1 font-semibold ${m.sales12m > 0 ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                  {fmt(t.book.salesCount, { n: m.sales12m })}
                </span>
                <span className="text-slate-500">{t.book.in12Months}</span>
              </>
            ) : (
              <span className="text-slate-500">{t.book.salesUnknown}</span>
            )}
          </p>
          {m.sales12m === 0 && <p className="text-xs font-semibold text-amber-700">⚠️ {t.book.noSalesWarning}</p>}
          {/* Toujours affiché : sans prix connu, c'est un raccourci vers la fiche Amazon de ce livre (par ISBN). */}
          <a
            href={amazonMin?.url ?? amazonSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl bg-amber-900/10 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-900/15"
          >
            <SiteLogo id="amazon" color="#ff9900" size={22} />
            <span>{amazonText}</span>
          </a>
          <a
            href={buyback?.url ?? (buyback ? PLATFORM_BY_ID[buyback.platform]?.searchUrl({ isbn13: b.isbn13 ?? "", title: b.title }) : momoxUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-800 hover:bg-green-100"
          >
            <SiteLogo id={buyback?.platform ?? "momox"} color={PLATFORM_BY_ID[buyback?.platform ?? "momox"]?.color ?? "#56b146"} size={22} />
            <span>
              {buyback
                ? fmt(t.book.buybackAgo, {
                    platform: platformName(buyback.platform).toLowerCase(),
                    price: fp(buyback.priceCents, buyback.currency),
                    age: shortAge(buyback.observedAt, new Date(), locale),
                  })
                : t.book.seeMomox}
            </span>
          </a>
        </div>
      </div>

      {(b.isbn13 || b.isbn10) && (
        <p className="flex flex-wrap gap-2 text-sm text-slate-600">
          {b.isbn13 && <span className="rounded-full bg-slate-100 px-3 py-1">{b.isbn13}</span>}
          {b.isbn10 && <span className="rounded-full bg-slate-100 px-3 py-1">▮▯▮ {b.isbn10}</span>}
        </p>
      )}

      <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-xl border border-slate-200 text-sm">
        <div className="p-3" title={t.book.weightedProfitHelp}>
          <p className="text-slate-500">{t.book.weightedProfitShort}</p>
          <p className="mt-1 text-lg font-bold">{fp(m.weightedProfit30dCents)}</p>
        </div>
        <div className="p-3" title={t.book.netProfitHelp}>
          <p className="text-slate-500">{t.book.netProfit}</p>
          <p className={`mt-1 text-lg font-bold ${(s.netAfterFeesCents ?? 0) > 0 ? "text-green-700" : ""}`}>{fp(s.netAfterFeesCents)}</p>
        </div>
        <div className="p-3">
          <p className="text-slate-500">{t.book.maxBuyShort}</p>
          <p className="mt-1 text-lg font-bold">{fp(s.maxBuyCents)}</p>
        </div>
      </div>

      {m.lastSales.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-xl border border-slate-200 text-sm">
            <tbody>
              <tr>
                <th className="border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold">{t.book.soldAgo}</th>
                {m.lastSales.map((x, i) => (
                  <td key={i} className="border-b border-r border-slate-200 px-2 py-2 text-center text-slate-600 last:border-r-0">
                    {shortAge(x.soldAt, new Date(), locale)}
                  </td>
                ))}
              </tr>
              <tr>
                <th className="border-r border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold">{t.book.atPrice}</th>
                {m.lastSales.map((x, i) => (
                  <td key={i} className="border-r border-slate-200 px-2 py-2 text-center font-bold last:border-r-0">
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

      {footer.length > 0 && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
          {footer.map((f, i) => (
            <span key={i} className="flex gap-3">
              {i > 0 && <span className="text-slate-300">|</span>}
              {f}
            </span>
          ))}
        </p>
      )}

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
