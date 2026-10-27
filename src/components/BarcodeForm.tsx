"use client";

import { useActionState, useCallback, useRef, useState, useTransition } from "react";
import { barcodeScanAction, bookScanAction } from "@/app/actions";
import { shrinkPhoto } from "@/lib/client-image";
import { BarcodeScanner } from "./BarcodeScanner";

const COUNTRIES = [
  { code: "FR", flag: "🇫🇷" },
  { code: "US", flag: "🇺🇸" },
  { code: "DE", flag: "🇩🇪" },
  { code: "GB", flag: "🇬🇧" },
  { code: "JP", flag: "🇯🇵" },
  { code: "CA", flag: "🇨🇦" },
  { code: "IT", flag: "🇮🇹" },
  { code: "ES", flag: "🇪🇸" },
];

export interface BarcodeFormText {
  placeholder: string;
  country: string;
  search: string;
  scanBarcode: string;
  coverPhoto: string;
  coverHelp: string;
  identifying: string;
  scannerTitle: string;
  scannerHint: string;
  scannerNoCamera: string;
  scannerNotBook: string;
  close: string;
}

/**
 * Scan d'un seul livre : code-barres lu à la caméra (ou QR code), ISBN tapé à la main,
 * ou photo de la couverture quand il n'y a pas de code-barres.
 */
export function BarcodeForm({ t }: { t: BarcodeFormText }) {
  const [state, action, pending] = useActionState(barcodeScanAction, undefined);
  const [country, setCountry] = useState("FR");
  const [isbn, setIsbn] = useState("");
  const [scanning, setScanning] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [identifying, startIdentify] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [, startSubmit] = useTransition();
  const onIsbn = useCallback(
    (code: string) => {
      setScanning(false);
      setIsbn(code);
      // Code lu : on lance directement la recherche, comme un clic sur « Rechercher ».
      const fd = new FormData();
      fd.set("isbn", code);
      fd.set("country", country);
      startSubmit(() => action(fd));
    },
    [action, country],
  );

  function onCover(file: File | undefined) {
    if (!file) return;
    setPhotoError(null);
    startIdentify(async () => {
      const fd = new FormData();
      fd.append("photo", await shrinkPhoto(file), file.name);
      const res = await fetch("/api/identify", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPhotoError(json.error ?? "Erreur");
        return;
      }
      await bookScanAction(json.bookId, country);
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  const busy = pending || identifying;
  const tile = "flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-brand px-3 py-3 text-sm font-semibold text-brand hover:bg-mint disabled:opacity-50";

  return (
    <form action={action} className="space-y-4 text-center">
      <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
        <button type="button" className={tile} onClick={() => setScanning(true)} disabled={busy}>
          <span className="text-3xl" aria-hidden>
            ▮▯▮▯
          </span>
          {t.scanBarcode}
        </button>
        <button type="button" className={tile} onClick={() => fileRef.current?.click()} disabled={busy} title={t.coverHelp}>
          <span className="text-3xl" aria-hidden>
            📷
          </span>
          {t.coverPhoto}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onCover(e.target.files?.[0])} />
      </div>
      <p className="text-xs text-slate-500">{t.coverHelp}</p>

      <div className="mx-auto flex max-w-md gap-2">
        <input
          name="isbn"
          required
          inputMode="numeric"
          className="input text-lg"
          placeholder={t.placeholder}
          value={isbn}
          onChange={(e) => setIsbn(e.target.value)}
        />
        <button className="btn-primary" disabled={busy}>
          {t.search}
        </button>
      </div>
      <input type="hidden" name="country" value={country} />
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.country}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {COUNTRIES.map((c) => (
          <button
            key={c.code}
            type="button"
            onClick={() => setCountry(c.code)}
            className={`grid h-10 w-12 place-items-center rounded-lg border text-xl ${country === c.code ? "border-2 border-brand" : "border-slate-200"}`}
            aria-pressed={country === c.code}
          >
            {c.flag}
          </button>
        ))}
      </div>
      {identifying && <p className="text-sm text-slate-600">{t.identifying}</p>}
      {(state?.error || photoError) && <p className="text-sm text-red-600">{state?.error ?? photoError}</p>}

      {scanning && (
        <BarcodeScanner
          t={{ title: t.scannerTitle, hint: t.scannerHint, close: t.close, noCamera: t.scannerNoCamera, notBook: t.scannerNotBook }}
          onIsbn={onIsbn}
          onClose={() => setScanning(false)}
        />
      )}
    </form>
  );
}
