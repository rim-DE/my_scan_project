import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth";
import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES, normalizePhoto } from "@/lib/image";
import { getStorage } from "@/lib/storage";
import { MAX_PHOTOS_PER_SCAN } from "@/lib/image-size";

export const maxDuration = 60;

/** Ajoute une photo à un scan en cours d'envoi et débite ses crédits. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const { id } = await params;
  const scan = await prisma.scan.findFirst({ where: { id, userId: user.id }, select: { id: true, status: true, _count: { select: { photos: true } } } });
  if (!scan) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  if (scan.status !== "UPLOADING") return NextResponse.json({ error: "Ce scan est déjà lancé." }, { status: 409 });
  if (scan._count.photos >= MAX_PHOTOS_PER_SCAN) return NextResponse.json({ error: `${MAX_PHOTOS_PER_SCAN} photos maximum par scan.` }, { status: 400 });

  const fd = await req.formData();
  const file = fd.get("photo");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Photo manquante." }, { status: 400 });
  const label = fd.get("filename") ? String(fd.get("filename")) : file.name;
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: `${label} dépasse 20 Mo.` }, { status: 400 });
  if (file.type && !ACCEPTED_TYPES.includes(file.type)) return NextResponse.json({ error: `${label} : format non accepté.` }, { status: 400 });
  const position = Number(fd.get("position")) || scan._count.photos;

  const cost = env.creditsPerPhoto();
  // Décrément atomique : échoue si le solde est insuffisant.
  const debited = await prisma.user.updateMany({ where: { id: user.id, credits: { gte: cost } }, data: { credits: { decrement: cost } } });
  if (debited.count === 0) return NextResponse.json({ error: "Pas assez de crédits." }, { status: 402 });

  try {
    const { data, width, height } = await normalizePhoto(Buffer.from(await file.arrayBuffer()));
    const key = `scans/${user.id}/${scan.id}/${randomUUID()}.jpg`;
    await getStorage().put(key, data, "image/jpeg");
    await prisma.photo.create({ data: { scanId: scan.id, storageKey: key, mimeType: "image/jpeg", width, height, position } });
  } catch (e) {
    console.error("[upload]", e);
    await prisma.user.update({ where: { id: user.id }, data: { credits: { increment: cost } } });
    return NextResponse.json({ error: `Impossible de lire ${label} (format non pris en charge ?).` }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
