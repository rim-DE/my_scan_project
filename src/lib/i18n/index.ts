import { fr, type Dict } from "./fr";
import { en } from "./en";

export type Locale = "fr" | "en";
export const LOCALES: Locale[] = ["fr", "en"];
export const LOCALE_COOKIE = "lang";

const dicts: Record<Locale, Dict> = { fr, en };

export function getDict(locale: string | undefined): Dict {
  return dicts[(locale as Locale) in dicts ? (locale as Locale) : "fr"];
}

export function asLocale(value: string | undefined): Locale {
  return value === "en" ? "en" : "fr";
}

/** Remplace {n}, {x}… dans un texte. */
export function fmt(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

export type { Dict };
