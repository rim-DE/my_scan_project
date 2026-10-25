"use client";

import { useTransition } from "react";
import { setLocaleAction } from "@/app/actions";

export function LanguageSwitch({ locale }: { locale: string }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Langue / Language"
      className="rounded-full border border-slate-300 bg-white px-2 py-1 text-xs"
      value={locale}
      disabled={pending}
      onChange={(e) => start(() => setLocaleAction(e.target.value))}
    >
      <option value="fr">🇫🇷 FR</option>
      <option value="en">🇬🇧 EN</option>
    </select>
  );
}
