"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { deleteScanAction, toggleFavoriteAction } from "@/app/actions";
import { StatusBadge } from "./StatusBadge";

export interface ScanRow {
  id: string;
  name: string;
  createdAt: string;
  photos: number;
  books: number;
  status: string;
  favorite: boolean;
}

interface Props {
  scans: ScanRow[];
  searchable?: boolean;
  t: {
    title: string;
    search: string;
    name: string;
    date: string;
    photos: string;
    books: string;
    status: string;
    actions: string;
    empty: string;
    confirmDelete: string;
    statuses: Record<string, string>;
    view: string;
    delete: string;
    favorite: string;
  };
  locale: string;
}

export function ScansTable({ scans, searchable = true, t, locale }: Props) {
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const rows = useMemo(() => scans.filter((s) => s.name.toLowerCase().includes(q.toLowerCase())), [scans, q]);

  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{t.title}</h2>
        {searchable && <input className="input max-w-xs" placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} />}
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">{t.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-mint text-xs uppercase text-slate-500">
              <tr>
                <th className="p-3" />
                <th className="p-3 text-left">{t.name}</th>
                <th className="p-3 text-left">{t.date}</th>
                <th className="p-3">{t.photos}</th>
                <th className="p-3">{t.books}</th>
                <th className="p-3">{t.status}</th>
                <th className="p-3">{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 last:border-0">
                  <td className="p-3">
                    <Link href={`/scans/${s.id}`} title={t.view} className="text-brand">
                      👁
                    </Link>
                  </td>
                  <td className="p-3">
                    <Link href={`/scans/${s.id}`} className="hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="p-3 whitespace-nowrap">{new Date(s.createdAt).toLocaleString(locale === "en" ? "en-GB" : "fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="p-3 text-center">{s.photos}</td>
                  <td className="p-3 text-center">{s.books}</td>
                  <td className="p-3 text-center">
                    <StatusBadge status={s.status} label={t.statuses[s.status]} />
                  </td>
                  <td className="p-3">
                    <div className="flex justify-center gap-2">
                      <button
                        className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 hover:bg-red-50"
                        title={t.delete}
                        disabled={pending}
                        onClick={() => confirm(t.confirmDelete) && start(() => deleteScanAction(s.id))}
                      >
                        🗑
                      </button>
                      <button
                        className={`grid h-8 w-8 place-items-center rounded-full border border-slate-200 ${s.favorite ? "text-amber-500" : "text-slate-400"}`}
                        title={t.favorite}
                        disabled={pending}
                        onClick={() => start(() => toggleFavoriteAction(s.id))}
                      >
                        ★
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
