import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/i18n/server";
import { getDict } from "@/lib/i18n";
import { ScansTable, type ScanRow } from "@/components/ScansTable";
import { BarcodeGrid, type BarcodeItem } from "@/components/BarcodeGrid";

export default async function DashboardPage() {
  const user = await requireUser();
  const locale = await getLocale();
  const t = getDict(locale);

  const [scans, lists] = await Promise.all([
    prisma.scan.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { photos: true, detections: true } },
        detections: { take: 1, include: { book: true } },
      },
    }),
    prisma.shoppingList.findMany({ where: { userId: user.id }, include: { _count: { select: { items: true } } }, orderBy: { createdAt: "desc" } }),
  ]);

  const rows: ScanRow[] = scans
    .filter((s) => s.kind === "PHOTO")
    .map((s) => ({
      id: s.id,
      name: s.name,
      createdAt: s.createdAt.toISOString(),
      photos: s._count.photos,
      books: s._count.detections,
      status: s.status,
      favorite: s.favorite,
    }));

  const barcodeItems: BarcodeItem[] = scans
    .filter((s) => s.kind === "BARCODE" && s.detections[0]?.book)
    .map((s) => {
      const b = s.detections[0].book!;
      return { scanId: s.id, title: b.title, authors: b.authors, publisher: b.publisher, isbn13: b.isbn13, coverUrl: b.coverUrl };
    });

  const tableT = {
    search: t.dashboard.searchScan,
    name: t.dashboard.name,
    date: t.dashboard.date,
    photos: t.dashboard.photos,
    books: t.dashboard.books,
    status: t.dashboard.status,
    actions: t.dashboard.actions,
    empty: t.dashboard.noScan,
    confirmDelete: t.dashboard.confirmDelete,
    statuses: t.status,
    view: t.common.view,
    delete: t.common.delete,
    favorite: t.common.favorite,
  };

  return (
    <>
      <ScansTable scans={rows} t={{ ...tableT, title: t.dashboard.pastScans }} locale={locale} />

      <section className="card">
        <h2 className="mb-3 font-semibold">{t.dashboard.lists}</h2>
        {lists.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">{t.dashboard.noList}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {lists.map((l) => (
              <li key={l.id}>
                <Link href={`/lists#${l.id}`} className="chip hover:bg-mint">
                  {l.name} · {l._count.items}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ScansTable scans={rows.filter((r) => r.favorite)} searchable={false} t={{ ...tableT, title: t.dashboard.favorites }} locale={locale} />

      <BarcodeGrid items={barcodeItems} t={{ title: t.dashboard.barcodeScans, search: t.dashboard.barcodeSearch, empty: t.dashboard.noScan }} />
    </>
  );
}
