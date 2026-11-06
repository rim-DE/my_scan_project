import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/i18n/server";
import { getDict } from "@/lib/i18n";
import { getBadgeStats } from "@/lib/queries";
import { unlockedBadges } from "@/lib/badges";
import { Nav } from "@/components/Nav";
import { BottomNav } from "@/components/BottomNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const locale = await getLocale();
  const badgeCount = unlockedBadges(await getBadgeStats(user.id)).length;
  return (
    <>
      <Nav
        t={getDict(locale)}
        locale={locale}
        credits={user.credits}
        initial={(user.name || user.email).charAt(0).toUpperCase()}
        badgeCount={badgeCount}
      />
      <main className="mx-auto max-w-5xl space-y-6 px-4 pt-6 pb-32">{children}</main>
      <BottomNav t={getDict(locale)} />
    </>
  );
}
