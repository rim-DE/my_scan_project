import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { processPendingScans } from "@/lib/scan-processor";
import { booksMissingPrices, fillMissingPrices } from "@/lib/prices/fill";

export const maxDuration = 300;

/**
 * Filet de sécurité : traite les scans restés en attente (ex. serveur redémarré pendant un scan),
 * puis récupère les prix qui manquent dans les scans de la semaine.
 * Appelée par Vercel Cron (voir vercel.json) avec l'en-tête Authorization: Bearer CRON_SECRET.
 */
export async function GET(req: Request) {
  const secret = env.cronSecret();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const start = Date.now();
  const processed = await processPendingScans(3);
  const recent = await prisma.scan.findMany({
    where: { status: "DONE", createdAt: { gt: new Date(Date.now() - 7 * 24 * 3600_000) } },
    orderBy: { createdAt: "desc" },
    select: { id: true, country: true },
  });
  let prices = 0;
  for (const scan of recent) {
    const budget = 280_000 - (Date.now() - start);
    if (budget < 30_000) break;
    if ((await booksMissingPrices(scan.id, scan.country)).length > 0) prices += await fillMissingPrices(scan.id, budget);
  }
  return NextResponse.json({ processed, prices });
}
