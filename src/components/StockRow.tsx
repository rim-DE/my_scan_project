"use client";

import { useTransition } from "react";
import { removeStockItemAction, updateStockItemAction } from "@/app/actions";

interface Props {
  item: {
    id: string;
    title: string;
    isbn13: string | null;
    coverUrl: string | null;
    condition: string;
    status: string;
    purchase: string;
    sold: string;
    estimated: string;
  };
  conditions: Record<string, string>;
  statuses: Record<string, string>;
  t: { save: string; remove: string; purchasePrice: string; soldPrice: string; estimated: string };
}

export function StockRow({ item, conditions, statuses, t }: Props) {
  const [pending, start] = useTransition();
  return (
    <form action={(fd) => start(() => updateStockItemAction(fd))} className="flex flex-wrap items-center gap-3 border-b border-slate-100 py-3 last:border-0">
      <input type="hidden" name="id" value={item.id} />
      {item.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.coverUrl} alt="" className="h-16 w-12 rounded object-cover" />
      ) : (
        <div className="grid h-16 w-12 place-items-center rounded bg-mint">📕</div>
      )}
      <div className="min-w-40 flex-1">
        <p className="font-medium">{item.title}</p>
        <p className="text-xs text-slate-500">
          {item.isbn13} · {t.estimated} : <strong>{item.estimated}</strong>
        </p>
      </div>
      <select name="condition" defaultValue={item.condition} className="input w-auto">
        {Object.entries(conditions).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
      <select name="status" defaultValue={item.status} className="input w-auto">
        {Object.entries(statuses).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
      <input name="purchasePrice" defaultValue={item.purchase} placeholder={t.purchasePrice} className="input w-24" inputMode="decimal" />
      <input name="soldPrice" defaultValue={item.sold} placeholder={t.soldPrice} className="input w-24" inputMode="decimal" />
      <button className="btn-primary" disabled={pending}>{t.save}</button>
      <button type="button" className="btn-outline" disabled={pending} onClick={() => start(() => removeStockItemAction(item.id))}>
        {t.remove}
      </button>
    </form>
  );
}
