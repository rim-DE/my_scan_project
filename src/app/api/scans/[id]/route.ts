import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/** Statut d'un scan (utilisé par la page pour savoir quand se rafraîchir). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const { id } = await params;
  const scan = await prisma.scan.findFirst({
    where: { id, userId: user.id },
    select: { status: true, error: true, _count: { select: { detections: true } } },
  });
  if (!scan) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  return NextResponse.json({ status: scan.status, error: scan.error, detections: scan._count.detections });
}
