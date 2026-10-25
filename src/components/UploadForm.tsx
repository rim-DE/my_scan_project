"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { MAX_REQUEST_BYTES, shrinkPhoto } from "@/lib/client-image";

const LANGUAGES = [
  { code: "fr", flag: "🇫🇷" },
  { code: "en", flag: "🇺🇸" },
  { code: "de", flag: "🇩🇪" },
  { code: "es", flag: "🇪🇸" },
];

async function postJson(url: string, body: unknown): Promise<{ id: string }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Erreur");
  return json;
}

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
  const [progress, setProgress] = useState<string | null>(null);
  const [startedId, setStartedId] = useState<string | null>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list).filter((f) => f.type.startsWith("image/") || /\.hei[cf]$/i.test(f.name))]);
  }

  async function submit() {
    if (files.length === 0) return setError(t.noFiles);
    setSending(true);
    setError(null);
    try {
      // 1. Création du scan, 2. une requête par photo (réduite avant l'envoi), 3. lancement du traitement.
      const created = await postJson("/api/scans", { name, language, photos: files.length });
      const failures: string[] = [];
      for (const [position, file] of files.entries()) {
        setProgress(`${position + 1}/${files.length}`);
        const photo = await shrinkPhoto(file);
        if (photo.size > MAX_REQUEST_BYTES) {
          failures.push(`${file.name} : photo trop lourde, convertis-la en JPEG.`);
          continue;
        }
        const fd = new FormData();
        fd.append("photo", photo, file.name);
        fd.append("filename", file.name);
        fd.append("position", String(position));
        const res = await fetch(`/api/scans/${created.id}/photos`, { method: "POST", body: fd });
        if (!res.ok) failures.push((await res.json().catch(() => ({}))).error ?? file.name);
      }
      await postJson(`/api/scans/${created.id}/start`, {});
      if (failures.length) {
        // On reste sur la page pour que l'erreur soit lue ; le scan des autres photos est lancé.
        setError(failures.join(" · "));
        setStartedId(created.id);
        return;
      }
      router.push(`/scans/${created.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSending(false);
      setProgress(null);
    }
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
      {startedId && (
        <p className="text-center text-sm">
          <a className="text-brand underline" href={`/scans/${startedId}`}>
            Voir le scan des autres photos
          </a>
        </p>
      )}
      <div className="text-center">
        <button className="btn-primary px-6 py-3 text-base" onClick={submit} disabled={sending}>
          {sending ? `${t.sending} ${progress ?? ""}` : t.launch}
        </button>
      </div>
    </div>
  );
}
