"use client";

import { useActionState, useState } from "react";
import { barcodeScanAction } from "@/app/actions";

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

export function BarcodeForm({ t }: { t: { placeholder: string; country: string; search: string } }) {
  const [state, action, pending] = useActionState(barcodeScanAction, undefined);
  const [country, setCountry] = useState("FR");
  return (
    <form action={action} className="space-y-4 text-center">
      <div className="mx-auto flex max-w-md gap-2">
        <span className="text-3xl">🔍</span>
        <input name="isbn" required inputMode="numeric" className="input text-lg" placeholder={t.placeholder} />
        <button className="btn-primary" disabled={pending}>
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
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
