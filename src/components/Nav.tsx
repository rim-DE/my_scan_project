import Link from "next/link";
import type { Dict } from "@/lib/i18n";
import { LanguageSwitch } from "./LanguageSwitch";

interface Props {
  t: Dict;
  locale: string;
  credits: number;
  initial: string;
  badgeCount: number;
}

export function Nav({ t, locale, credits, initial, badgeCount }: Props) {
  return (
    <header className="mx-auto max-w-5xl px-4 pt-4">
      <nav className="flex flex-wrap items-center gap-3 rounded-full border border-slate-200 bg-cream px-3 py-2 shadow-sm">
        <Link href="/" className="flex items-center gap-2 font-semibold text-brand">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-white">📚</span>
          <span className="hidden sm:inline">{t.nav.dashboard}</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitch locale={locale} />
          <Link href="/scans/new" className="btn-primary">
            {t.nav.newScan} <span className="grid h-5 w-5 place-items-center rounded-full bg-white/20">+</span>
          </Link>
          <span className="rounded-full bg-mint px-3 py-1 text-sm" title={t.nav.credits}>
            {credits} 🪙
          </span>
          <Link href="/profile" className="grid h-8 w-8 place-items-center rounded-full bg-brand-light text-sm font-semibold text-white" title={t.nav.profile}>
            {initial}
          </Link>
        </div>
      </nav>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/price" className="btn-outline">{t.nav.priceCalc}</Link>
        <Link href="/stock" className="btn-outline">{t.nav.stock}</Link>
        <Link href="/lists" className="btn-outline">{t.nav.lists}</Link>
        <Link href="/badges" className="btn-outline">🏅 {t.nav.badges} · {badgeCount}</Link>
      </div>
    </header>
  );
}
