import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Toutes les pages demandent d'être connecté, sauf la connexion, l'inscription et la route cron.
const PUBLIC = ["/login", "/register", "/api/cron", "/manifest.webmanifest"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  const userId = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (userId) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico)$).*)"],
};
