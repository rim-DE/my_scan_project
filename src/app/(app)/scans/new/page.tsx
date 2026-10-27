import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n";
import { env } from "@/lib/env";
import { UploadForm } from "@/components/UploadForm";
import { BarcodeForm } from "@/components/BarcodeForm";

export default async function NewScanPage() {
  const user = await requireUser();
  const t = await getT();
  return (
    <>
      <section className="card">
        <UploadForm t={t.newScan} />
        <p className="mt-4 text-center text-xs text-slate-500">
          {t.newScan.creditsLeft} : {user.credits} · {fmt(t.newScan.costInfo, { n: env.creditsPerPhoto() })}
        </p>
      </section>
      <div className="flex items-center gap-4 text-xs uppercase text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        {t.newScan.or}
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      <section className="card">
        <BarcodeForm
          t={{
            placeholder: t.newScan.isbnPlaceholder,
            country: t.newScan.country,
            search: t.newScan.searchIsbn,
            scanBarcode: t.newScan.scanBarcode,
            coverPhoto: t.newScan.coverPhoto,
            coverHelp: t.newScan.coverHelp,
            identifying: t.newScan.identifying,
            scannerTitle: t.newScan.scannerTitle,
            scannerHint: t.newScan.scannerHint,
            scannerNoCamera: t.newScan.scannerNoCamera,
            scannerNotBook: t.newScan.scannerNotBook,
            close: t.common.close,
          }}
        />
      </section>
    </>
  );
}
