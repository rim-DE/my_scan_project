import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/i18n/server";
import { getDict } from "@/lib/i18n";
import { getBadgeStats } from "@/lib/queries";
import { BADGES } from "@/lib/badges";

export default async function BadgesPage() {
  const user = await requireUser();
  const locale = await getLocale();
  const t = getDict(locale);
  const stats = await getBadgeStats(user.id);
  return (
    <>
      <h1 className="text-xl font-semibold">{t.badges.title}</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        {BADGES.map((b) => {
          const on = b.unlocked(stats);
          return (
            <div key={b.id} className={`card text-center ${on ? "" : "opacity-40 grayscale"}`}>
              <div className="text-4xl">{b.emoji}</div>
              <p className="mt-2 font-semibold">{b.name[locale]}</p>
              <p className="text-xs text-slate-500">{on ? b.description[locale] : `${t.badges.locked} · ${b.description[locale]}`}</p>
            </div>
          );
        })}
      </div>
    </>
  );
}
