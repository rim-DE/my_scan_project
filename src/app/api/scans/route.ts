import { after, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth";
import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES, normalizePhoto } from "@/lib/image";
import { getStorage } from "@/lib/storage";
import { processScan } from "@/lib/scan-processor";

export const maxDuration = 300;

const LANGUAGE_TO_COUNTRY: Record<string, string> = { fr: "FR", en: "US", de: "DE", es: "ES", it: "IT" };

/** Crée un scan à partir de plusieurs photos, puis lance le traitement en arrière-plan. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const fd = await req.formData();
  const files = fd.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return NextResponse.json({ error: "Ajoute au moins une photo." }, { status: 400 });
  if (files.length > 20) return NextResponse.json({ error: "20 photos maximum par scan." }, { status: 400 });
  for (const f of files) {
    if (f.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: `${f.name} dépasse 20 Mo.` }, { status: 400 });
    if (f.type && !ACCEPTED_TYPES.includes(f.type)) return NextResponse.json({ error: `${f.name} : format non accepté.` }, { status: 400 });
  }

  const cost = files.length * env.creditsPerPhoto();
  // Décrément atomique : échoue si le solde est insuffisant.
  const debited = await prisma.user.updateMany({ where: { id: user.id, credits: { gte: cost } }, data: { credits: { decrement: cost } } });
  if (debited.count === 0) return NextResponse.json({ error: "Pas assez de crédits." }, { status: 402 });

  const language = String(fd.get("language") || "fr");
  const name = String(fd.get("name") || "").trim() || `Scan du ${new Date().toLocaleString("fr-FR")}`;
  const scan = await prisma.scan.create({
    data: { userId: user.id, name, bookLanguage: language, country: LANGUAGE_TO_COUNTRY[language] ?? "FR" },
  });

  try {
    for (const [position, file] of files.entries()) {
      const { data, width, height } = await normalizePhoto(Buffer.from(await file.arrayBuffer()));
      const key = `scans/${user.id}/${scan.id}/${randomUUID()}.jpg`;
      await getStorage().put(key, data, "image/jpeg");
      await prisma.photo.create({ data: { scanId: scan.id, storageKey: key, mimeType: "image/jpeg", width, height, position } });
    }
  } catch (e) {
    console.error("[upload]", e);
    await prisma.user.update({ where: { id: user.id }, data: { credits: { increment: cost } } });
    await prisma.scan.update({ where: { id: scan.id }, data: { status: "ERROR", error: "Photo illisible (format non pris en charge ?)" } });
    return NextResponse.json({ error: "Impossible de lire une des photos." }, { status: 400 });
  }

  after(() => processScan(scan.id));
  return NextResponse.json({ id: scan.id });
}
