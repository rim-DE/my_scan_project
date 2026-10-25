"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { shrinkPhoto } from "@/lib/client-image";

const CONDITIONS = ["NEW", "LIKE_NEW", "VERY_GOOD", "GOOD", "ACCEPTABLE"] as const;

interface Props {
  initial: { isbn: string; condition: string };
  t: { isbn: string; photo: string; condition: string; compute: string; loading: string };
  conditions: Record<string, string>;
}

export function PriceForm({ initial, t, conditions }: Props) {
  const router = useRouter();
  const [isbn, setIsbn] = useState(initial.isbn);
  const [condition, setCondition] = useState(initial.condition);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (file && !isbn) {
      setBusy(true);
      const fd = new FormData();
      fd.append("photo", await shrinkPhoto(file), file.name);
      const res = await fetch("/api/identify", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) return setError(json.error ?? "Erreur");
      router.push(`/price?book=${json.bookId}&condition=${condition}`);
      router.refresh();
      return;
    }
    router.push(`/price?isbn=${encodeURIComponent(isbn)}&condition=${condition}`);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">
        {t.isbn}
        <input className="input mt-1" value={isbn} onChange={(e) => setIsbn(e.target.value)} placeholder="978…" inputMode="numeric" />
      </label>
      <label className="text-sm">
        {t.photo}
        <input className="input mt-1" type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <label className="text-sm">
        {t.condition}
        <select className="input mt-1" value={condition} onChange={(e) => setCondition(e.target.value)}>
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>{conditions[c]}</option>
          ))}
        </select>
      </label>
      <div className="flex items-end">
        <button className="btn-primary w-full" disabled={busy || (!isbn && !file)}>
          {busy ? t.loading : t.compute}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
    </form>
  );
}
