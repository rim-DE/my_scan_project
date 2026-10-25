"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const LANGUAGES = [
  { code: "fr", flag: "🇫🇷" },
  { code: "en", flag: "🇺🇸" },
  { code: "de", flag: "🇩🇪" },
  { code: "es", flag: "🇪🇸" },
];

interface Props {
  t: { dropTitle: string; dropHint: string; dropFormats: string; bookLanguage: string; scanName: string; launch: string; sending: string; noFiles: string };
}

export function UploadForm({ t }: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [language, setLanguage] = useState("fr");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list).filter((f) => f.type.startsWith("image/") || /\.hei[cf]$/i.test(f.name))]);
  }

  async function submit() {
    if (files.length === 0) return setError(t.noFiles);
    setSending(true);
    setError(null);
    const fd = new FormData();
    files.forEach((f) => fd.append("photos", f));
    fd.append("language", language);
    fd.append("name", name);
    const res = await fetch("/api/scans", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) return setError(json.error ?? "Erreur");
    router.push(`/scans/${json.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`w-full rounded-3xl border-2 border-dashed p-10 text-center ${dragging ? "border-brand bg-mint" : "border-slate-300 bg-mint/60"}`}
      >
        <div className="text-4xl">🖼️</div>
        <p className="mt-3 font-medium text-brand">{t.dropTitle}</p>
        <p className="text-xs text-slate-500">{t.dropHint}</p>
        <p className="mt-1 text-xs text-slate-500">{t.dropFormats}</p>
      </button>
      <input ref={input} type="file" accept="image/*,.heic,.heif" capture="environment" multiple hidden onChange={(e) => addFiles(e.target.files)} />

      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-2 rounded-full bg-mint px-3 py-1 text-xs">
              {f.name}
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Retirer">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <input className="input" placeholder={t.scanName} value={name} onChange={(e) => setName(e.target.value)} />

      <div className="text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.bookLanguage}</p>
        <div className="flex justify-center gap-3">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLanguage(l.code)}
              className={`grid h-14 w-14 place-items-center rounded-full border text-2xl ${language === l.code ? "border-2 border-brand" : "border-slate-200"}`}
              aria-pressed={language === l.code}
            >
              {l.flag}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-center text-sm text-red-600">{error}</p>}
      <div className="text-center">
        <button className="btn-primary px-6 py-3 text-base" onClick={submit} disabled={sending}>
          {sending ? t.sending : t.launch}
        </button>
      </div>
    </div>
  );
}
