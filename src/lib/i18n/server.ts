import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, asLocale, getDict } from "./index";

export async function getLocale() {
  return asLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}

export async function getT() {
  return getDict(await getLocale());
}
