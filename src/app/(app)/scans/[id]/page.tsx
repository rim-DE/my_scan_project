import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/i18n/server";
import { fmt, getDict } from "@/lib/i18n";
import { getScanView } from "@/lib/queries";
import { identifyMissingAction, refreshScanPricesAction, retryScanAction } from "@/app/actions";
import { StatusBadge } from "@/components/StatusBadge";
import { AutoRefresh, PricesAutoRefresh } from "@/components/AutoRefresh";
import { fillMissingPrices } from "@/lib/prices/fill";
import { ScanViewer } from "@/components/ScanViewer";
import { ScanActionButton } from "@/components/ScanActionButton";

// « Actualiser tous les prix » et la récupération des prix manquants interrogent les sources pour chaque livre.
export const maxDuration = 300;

const FLAGS: Record<string, string> = { FR: "🇫🇷", US: "🇺🇸", DE: "🇩🇪", GB: "🇬🇧", JP: "🇯🇵", CA: "🇨🇦", IT: "🇮🇹", ES: "🇪🇸" };

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const locale = await getLocale();
  const t = getDict(locale);
  const view = await getScanView(id, user.id);
  if (!view) notFound();
  const { scan, detections } = view;
  const lists = await prisma.shoppingList.findMany({ where: { userId: user.id }, select: { id: true, name: true } });
  const running = scan.status === "PENDING" || scan.status === "PROCESSING";
  const missing = detections.filter((d) => !d.book && d.rawTitle).length;
  const waitingPrices = new Set(detections.flatMap((d) => (d.book?.priceStatus === "waiting" ? [d.book.id] : []))).size;
  // Prix pas encore récupérés (ex. jetons Keepa épuisés pendant le scan) : on les récupère en tâche de fond.
  if (!running && waitingPrices > 0) after(() => fillMissingPrices(scan.id).catch((e) => console.warn("[prix] récupération", e)));

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="text-brand">
          ← {t.scan.back}
        </Link>
        <h1 className="text-xl font-semibold">{scan.name}</h1>
        <StatusBadge status={scan.status} label={t.status[scan.status]} />
        <span className="text-xl">{FLAGS[scan.country] ?? scan.country}</span>
        <span className="text-sm text-slate-500">
          {scan.createdAt.toLocaleString(locale === "en" ? "en-GB" : "fr-FR")} · {scan.photos.length} 🖼 · {detections.length} 📖
        </span>
        {!running && detections.some((d) => d.book) && (
          <ScanActionButton
            action={refreshScanPricesAction}
            scanId={scan.id}
            label={`🔄 ${t.scan.refreshAllPrices}`}
            pendingLabel={`🔄 ${t.scan.refreshingAllPrices}`}
          />
        )}
        {!running && missing > 0 && (
          <ScanActionButton
            action={identifyMissingAction}
            scanId={scan.id}
            label={`🔎 ${fmt(t.scan.identifyMissing, { n: missing })}`}
            pendingLabel={`🔎 ${t.scan.identifyingMissing}`}
          />
        )}
      </div>

      {running && (
        <div className="card flex items-center gap-3 text-sm">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          {t.scan.processing}
          <AutoRefresh scanId={scan.id} status={scan.status} detections={detections.length} />
        </div>
      )}

      {!running && waitingPrices > 0 && (
        <div className="card flex items-center gap-3 text-sm">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          {fmt(t.scan.pricesWaiting, { n: waitingPrices })}
          <PricesAutoRefresh />
        </div>
      )}

      {scan.status === "ERROR" && (
        <div className="card flex flex-wrap items-center gap-3 border-red-200 bg-red-50 text-sm text-red-700">
          <span>
            {t.scan.error} : {scan.error}
          </span>
          <form action={retryScanAction.bind(null, scan.id)}>
            <button className="btn-outline">{t.scan.retry}</button>
          </form>
        </div>
      )}

      {!running && detections.length === 0 && scan.status !== "ERROR" && <p className="card text-sm">{t.scan.noBooks}</p>}

      <ScanViewer
        photos={scan.photos.map((p) => ({ id: p.id, url: `/api/photos/${p.id}`, width: p.width ?? 1000, height: p.height ?? 1000 }))}
        detections={detections}
        t={t}
        country={scan.country}
        lists={lists}
        path={`/scans/${scan.id}`}
        locale={locale}
        scanId={scan.id}
        running={running}
      />
    </>
  );
}
