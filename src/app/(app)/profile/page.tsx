import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { logoutAction } from "@/app/actions";
import { ProfileForm } from "@/components/ProfileForm";

export default async function ProfilePage() {
  const user = await requireUser();
  const t = await getT();
  return (
    <section className="card max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">{t.profile.title}</h1>
      <p className="text-sm">
        {t.profile.credits} : <strong>{user.credits}</strong>
      </p>
      <ProfileForm
        user={{ name: user.name ?? "", email: user.email, locale: user.locale }}
        t={{ name: t.auth.name, email: t.auth.email, language: t.profile.language, save: t.profile.save }}
      />
      <form action={logoutAction}>
        <button className="btn-outline">{t.nav.logout}</button>
      </form>
    </section>
  );
}
