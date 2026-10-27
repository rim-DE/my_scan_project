import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/i18n/server";
import { fmt, getDict } from "@/lib/i18n";
import { findOrCreateBookByIsbn } from "@/lib/catalog";
import { refreshPrices } from "@/lib/prices";
import { estimateForCondition } from "@/lib/prices/stats";
import { toBookView } from "@/lib/queries";
import { formatPrice } from "@/lib/money";
import { PriceForm } from "@/components/PriceForm";
import { BookCard } from "@/components/BookCard";
import type { Condition } from "@/lib/prices/types";

const CONDITIONS: Condition[] = ["NEW", "LIKE_NEW", "VERY_GOOD", "GOOD", "ACCEPTABLE"];

export default async function PricePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const locale = await getLocale();
  const t = getDict(locale);
  const sp = await searchParams;
  const condition = (CONDITIONS.includes(sp.condition as Condition) ? sp.condition : "GOOD") as Condition;
  const country = "FR";

  let bookId: string | null = sp.book ?? null;
  let lookupError: string | null = null;
  if (!bookId && sp.isbn) {
    try {
      const b = await findOrCreateBookByIsbn(sp.isbn);
      bookId = b?.id ?? null;
      if (!b) lookupError = t.price.notFound;
    } catch (e) {
      lookupError = e instanceof Error ? e.message : String(e);
    }
  }

  let result = null;
  if (bookId) {
    await refreshPrices(bookId, country);
    const book = await prisma.book.findUnique({ where: { id: bookId }, include: { prices: true } });
    if (book) result = toBookView(book, country);
  }
  const lists = await prisma.shoppingList.findMany({ where: { userId: user.id }, select: { id: true, name: true } });
  const loc = locale === "en" ? "en-GB" : "fr-FR";

  return (
    <>
      <section className="card space-y-4">
        <h1 className="text-xl font-semibold">{t.price.title}</h1>
        <p className="text-sm text-slate-600">{t.price.intro}</p>
        <PriceForm
          initial={{ isbn: sp.isbn ?? "", condition }}
          t={{ isbn: t.price.isbn, photo: t.price.photo, condition: t.price.condition, compute: t.price.compute, loading: t.common.loading }}
          conditions={t.conditions}
        />
        {lookupError && <p className="text-sm text-red-600">{lookupError}</p>}
      </section>

      {result && (
        <>
          <section className="card">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {t.price.estimate} · {t.conditions[condition]}
            </p>
            <p className="text-5xl font-bold text-brand">{formatPrice(estimateForCondition(result.stats, condition), "EUR", loc)}</p>
            <p className="mt-1 text-sm text-slate-500">{fmt(t.price.basedOn, { n: result.stats.count })}</p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {CONDITIONS.map((c) => (
                <div key={c} className={`rounded-2xl p-3 text-sm ${c === condition ? "bg-brand text-white" : "bg-mint"}`}>
                  <p className="text-xs opacity-80">{t.conditions[c]}</p>
                  <p className="font-semibold">{formatPrice(estimateForCondition(result.stats, c), "EUR", loc)}</p>
                </div>
              ))}
            </div>
          </section>
          <BookCard
            detection={{ id: "price", photoId: null, rawTitle: result.title, rawAuthor: null, bbox: null, polygon: null, textDirection: null, confidence: null, note: null, book: result, inStock: false }}
            t={t}
            country={country}
            lists={lists}
            path={`/price?book=${result.id}&condition=${condition}`}
            locale={locale}
            canNote={false}
          />
        </>
      )}
    </>
  );
}
