import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { processScan } from "@/lib/scan-processor";

export const maxDuration = 300;

/** Dernière étape d'un scan : toutes les photos sont envoyées, on lance le traitement en arrière-plan. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const { id } = await params;
  const scan = await prisma.scan.findFirst({ where: { id, userId: user.id }, select: { id: true, status: true, _count: { select: { photos: true } } } });
  if (!scan) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  if (scan.status !== "UPLOADING") return NextResponse.json({ id: scan.id });
  if (scan._count.photos === 0) {
    await prisma.scan.update({ where: { id: scan.id }, data: { status: "ERROR", error: "Aucune photo n'a pu être envoyée." } });
    return NextResponse.json({ error: "Aucune photo n'a pu être envoyée." }, { status: 400 });
  }
  await prisma.scan.update({ where: { id: scan.id }, data: { status: "PENDING" } });
  after(() => processScan(scan.id));
  return NextResponse.json({ id: scan.id });
}
