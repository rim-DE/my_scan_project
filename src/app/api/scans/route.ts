import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth";
import { MAX_PHOTOS_PER_SCAN } from "@/lib/image-size";

const LANGUAGE_TO_COUNTRY: Record<string, string> = { fr: "FR", en: "US", de: "DE", es: "ES", it: "IT" };

const Body = z.object({
  name: z.string().optional(),
  language: z.string().optional(),
  photos: z.number().int().min(1).max(MAX_PHOTOS_PER_SCAN),
});

/**
 * Étape 1 d'un scan : crée le scan (statut UPLOADING).
 * Les photos sont ensuite envoyées une par une (POST /api/scans/[id]/photos), car Vercel limite chaque requête à 4,5 Mo,
 * puis le traitement est lancé par POST /api/scans/[id]/start.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `Ajoute entre 1 et ${MAX_PHOTOS_PER_SCAN} photos.` }, { status: 400 });
  const { photos } = parsed.data;

  // Vérification anticipée ; le débit réel se fait photo par photo.
  if (user.credits < photos * env.creditsPerPhoto()) return NextResponse.json({ error: "Pas assez de crédits." }, { status: 402 });

  const language = parsed.data.language || "fr";
  const name = parsed.data.name?.trim() || `Scan du ${new Date().toLocaleString("fr-FR")}`;
  const scan = await prisma.scan.create({
    data: { userId: user.id, name, status: "UPLOADING", bookLanguage: language, country: LANGUAGE_TO_COUNTRY[language] ?? "FR" },
  });
  return NextResponse.json({ id: scan.id });
}
