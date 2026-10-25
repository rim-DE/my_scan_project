"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "../actions";

interface Props {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  mode: "login" | "register";
  t: { title: string; email: string; password: string; name: string; switchText: string; switchLabel: string };
}

export function AuthForm({ action, mode, t }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <div className="card space-y-4">
        <h1 className="text-xl font-semibold text-brand">📚 {t.title}</h1>
        <form action={formAction} className="space-y-3">
          {mode === "register" && <input name="name" placeholder={t.name} className="input" />}
          <input name="email" type="email" required placeholder={t.email} className="input" autoComplete="email" />
          <input
            name="password"
            type="password"
            required
            minLength={mode === "register" ? 8 : undefined}
            placeholder={t.password}
            className="input"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          <button className="btn-primary w-full" disabled={pending}>
            {t.title}
          </button>
        </form>
        <p className="text-center text-sm text-slate-500">
          {t.switchText}{" "}
          <Link href={mode === "login" ? "/register" : "/login"} className="text-brand underline">
            {t.switchLabel}
          </Link>
        </p>
      </div>
    </main>
  );
}
