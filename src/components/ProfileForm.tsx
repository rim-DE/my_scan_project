"use client";

import { useActionState } from "react";
import { updateProfileAction } from "@/app/actions";

interface Props {
  user: { name: string; email: string; locale: string };
  t: { name: string; email: string; language: string; save: string };
}

export function ProfileForm({ user, t }: Props) {
  const [state, action, pending] = useActionState(updateProfileAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm">
        {t.email}
        <input className="input mt-1 bg-slate-50" value={user.email} disabled />
      </label>
      <label className="block text-sm">
        {t.name}
        <input name="name" className="input mt-1" defaultValue={user.name} />
      </label>
      <label className="block text-sm">
        {t.language}
        <select name="locale" className="input mt-1" defaultValue={user.locale}>
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
      </label>
      <button className="btn-primary" disabled={pending}>{t.save}</button>
      {state?.ok && <p className="text-sm text-green-700">{state.ok}</p>}
    </form>
  );
}
