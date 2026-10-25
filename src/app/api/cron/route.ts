import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processPendingScans } from "@/lib/scan-processor";

export const maxDuration = 300;

/**
 * Filet de sécurité : traite les scans restés en attente (ex. serveur redémarré pendant un scan).
 * Appelée par Vercel Cron (voir vercel.json) avec l'en-tête Authorization: Bearer CRON_SECRET.
 */
export async function GET(req: Request) {
  const secret = env.cronSecret();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const processed = await processPendingScans(3);
  return NextResponse.json({ processed });
}
