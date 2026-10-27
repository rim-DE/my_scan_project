"use client";

import { useState, useTransition } from "react";
import type { Dict } from "@/lib/i18n";
import { linkDetectionIsbnAction } from "@/app/actions";
import { BarcodeScanner } from "./BarcodeScanner";

/** Sur un livre « non identifié » : scanner son code-barres ou taper son ISBN pour le rattacher au scan. */
export function IsbnLinker({ detectionId, t }: { detectionId: string; t: Dict }) {
  const [isbn, setIsbn] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function link(code: string) {
    setScanning(false);
    setIsbn(code);
    setError(null);
    start(async () => {
      const res = await linkDetectionIsbnAction(detectionId, code);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="space-y-2 rounded-xl bg-slate-50 p-3">
      <p className="text-sm text-slate-600">{t.book.linkIsbnHelp}</p>
      <div className="space-y-2">
        <button type="button" className="btn-outline text-sm" onClick={() => setScanning(true)} disabled={pending}>
          ▮▯▮ {t.newScan.scanBarcode}
        </button>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            link(isbn);
          }}
        >
          <input
            className="input min-w-0 flex-1 text-sm"
            inputMode="numeric"
            placeholder={t.newScan.isbnPlaceholder}
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
          />
          <button className="btn-primary text-sm" disabled={pending || !isbn.trim()}>
            {pending ? t.common.loading : t.book.linkIsbnSave}
          </button>
        </form>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {scanning && (
        <BarcodeScanner
          t={{ title: t.newScan.scannerTitle, hint: t.newScan.scannerHint, close: t.common.close, noCamera: t.newScan.scannerNoCamera, notBook: t.newScan.scannerNotBook }}
          onIsbn={link}
          onClose={() => setScanning(false)}
        />
      )}
    </div>
  );
}
