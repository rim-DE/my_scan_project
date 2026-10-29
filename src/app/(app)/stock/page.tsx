import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/i18n/server";
import { getDict } from "@/lib/i18n";
import { computeStats, estimateForCondition } from "@/lib/prices/stats";
import { resaleSettings } from "@/lib/prices";
import { dropAberrantPrices } from "@/lib/prices/metrics";
import { formatPrice } from "@/lib/money";
import { StockRow } from "@/components/StockRow";

export default async function StockPage() {
  const user = await requireUser();
  const locale = await getLocale();
  const t = getDict(locale);
  const loc = locale === "en" ? "en-GB" : "fr-FR";
  const items = await prisma.stockItem.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { book: { include: { prices: { where: { country: "FR" } } } } },
  });

  const rows = items.map((i) => {
    const est = estimateForCondition(computeStats(dropAberrantPrices(i.book.prices, i.book.listPriceCents), resaleSettings()), i.condition);
    return { item: i, est };
  });
  const inStock = rows.filter((r) => r.item.status !== "SOLD");
  const totalValue = inStock.reduce((s, r) => s + (r.est ?? 0), 0);
  const totalCost = inStock.reduce((s, r) => s + (r.item.purchasePriceCents ?? 0), 0);
  const cents = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(".", ","));

  return (
    <>
      <h1 className="text-xl font-semibold">{t.stock.title}</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          [t.stock.count, String(inStock.length)],
          [t.stock.totalValue, formatPrice(totalValue, "EUR", loc)],
          [t.stock.totalCost, formatPrice(totalCost, "EUR", loc)],
        ].map(([label, value]) => (
          <div key={label} className="card">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-2xl font-bold text-brand">{value}</p>
          </div>
        ))}
      </div>
      <section className="card">
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">{t.stock.empty}</p>
        ) : (
          rows.map(({ item, est }) => (
            <StockRow
              key={item.id}
              item={{
                id: item.id,
                title: item.book.title,
                isbn13: item.book.isbn13,
                coverUrl: item.book.coverUrl,
                condition: item.condition,
                status: item.status,
                purchase: cents(item.purchasePriceCents),
                sold: cents(item.soldPriceCents),
                estimated: formatPrice(est, "EUR", loc),
              }}
              conditions={t.conditions}
              statuses={t.stock.statuses}
              t={{ save: t.stock.save, remove: t.stock.remove, purchasePrice: t.stock.purchasePrice, soldPrice: t.stock.soldPrice, estimated: t.stock.estimated }}
            />
          ))
        )}
      </section>
    </>
  );
}
