"use client";

import { useEffect, useRef, useState } from "react";
import { isbnFromCode } from "@/lib/isbn";

// API du navigateur (Chrome Android, Edge…) pas encore décrite par TypeScript.
interface NativeDetector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: { new (opts: { formats: string[] }): NativeDetector; getSupportedFormats(): Promise<string[]> };
  }
}

interface Props {
  t: { title: string; hint: string; close: string; noCamera: string; notBook: string };
  onIsbn: (isbn13: string) => void;
  onClose: () => void;
}

/**
 * Vue caméra plein écran qui lit le code-barres (ou un QR code) d'un livre.
 * Lecteur intégré au navigateur quand il existe, sinon ZXing (Safari / iPhone).
 */
export function BarcodeScanner({ t, onIsbn, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notBook, setNotBook] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopZxing: (() => void) | null = null;
    let cancelled = false;

    // Chaque code lu passe par ici : on s'arrête au premier ISBN valide.
    const handle = (text: string) => {
      if (done.current) return;
      const isbn = isbnFromCode(text);
      if (!isbn) return setNotBook(true);
      done.current = true;
      navigator.vibrate?.(80);
      onIsbn(isbn);
    };

    (async () => {
      const video = videoRef.current!;
      const native = window.BarcodeDetector;
      const formats = native ? await native.getSupportedFormats().catch(() => []) : [];
      if (native && formats.includes("ean_13")) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        } catch {
          return setError(t.noCamera);
        }
        if (cancelled) return;
        video.srcObject = stream;
        await video.play().catch(() => {});
        const detector = new native({ formats: ["ean_13", "ean_8", "upc_a", "qr_code"].filter((f) => formats.includes(f)) });
        timer = setInterval(async () => {
          if (video.readyState < 2) return;
          const codes = await detector.detect(video).catch(() => []);
          for (const c of codes) handle(c.rawValue);
        }, 250);
      } else {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        try {
          const controls = await new BrowserMultiFormatReader().decodeFromConstraints(
            { video: { facingMode: "environment" }, audio: false },
            video,
            (result) => result && handle(result.getText()),
          );
          if (cancelled) controls.stop();
          else stopZxing = () => controls.stop();
        } catch {
          setError(t.noCamera);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
      stopZxing?.();
    };
  }, [onIsbn, t.noCamera]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-label={t.title}>
      <div className="flex items-center justify-between p-4">
        <p className="font-semibold">{t.title}</p>
        <button onClick={onClose} className="rounded-full bg-white/15 px-4 py-2 text-sm">
          {t.close}
        </button>
      </div>
      <div className="relative flex-1">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        {/* Cadre de visée */}
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-32 -translate-y-1/2 rounded-2xl border-4 border-white/80" />
      </div>
      <p className="p-4 text-center text-sm">{error ?? (notBook ? t.notBook : t.hint)}</p>
    </div>
  );
}
