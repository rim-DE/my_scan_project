"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Dict } from "@/lib/i18n";

/** Barre du bas, comme BiblioScan : Dashboard, gros bouton de scan au milieu, Paramètres. */
export function BottomNav({ t }: { t: Dict }) {
  const path = usePathname();
  const item = (active: boolean) => `flex flex-col items-center gap-1 text-sm font-medium ${active ? "text-brand" : "text-slate-600"}`;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-surface pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-5xl items-end justify-around px-6 pt-2 pb-2">
        <Link href="/" className={item(path === "/")}>
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden>
            <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
          </svg>
          {t.nav.dashboard}
        </Link>
        <Link
          href="/scans/new"
          aria-label={t.nav.newScan}
          title={t.nav.newScan}
          className="-mt-8 grid h-20 w-20 place-items-center rounded-full border-4 border-page bg-mint text-4xl shadow-lg hover:bg-slate-200"
        >
          📷
        </Link>
        <Link href="/profile" className={item(path.startsWith("/profile"))}>
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
          {t.nav.settings}
        </Link>
      </div>
    </nav>
  );
}
