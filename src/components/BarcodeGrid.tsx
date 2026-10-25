"use client";

import Link from "next/link";
import { useState } from "react";

export interface BarcodeItem {
  scanId: string;
  title: string;
  authors: string[];
  publisher: string | null;
  isbn13: string | null;
  coverUrl: string | null;
}

export function BarcodeGrid({ items, t }: { items: BarcodeItem[]; t: { title: string; search: string; empty: string } }) {
  const [q, setQ] = useState("");
  const needle = q.toLowerCase();
  const rows = items.filter((i) =>
    [i.title, i.publisher ?? "", i.isbn13 ?? "", ...i.authors].some((v) => v.toLowerCase().includes(needle)),
  );
  return (
    <section className="card">
      <h2 className="mb-3 font-semibold">{t.title}</h2>
      <input className="input mb-4" placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} />
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">{t.empty}</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {rows.map((i) => (
            <Link key={i.scanId} href={`/scans/${i.scanId}`} title={i.title} className="block h-28 w-20 overflow-hidden rounded-xl border border-slate-200 bg-mint">
              {i.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.coverUrl} alt={i.title} className="h-full w-full object-cover" />
              ) : (
                <span className="block p-2 text-[10px] leading-tight">{i.title}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
