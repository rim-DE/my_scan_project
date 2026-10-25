import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getStorage } from "@/lib/storage";

/** Sert une photo de scan, uniquement à son propriétaire. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non connecté", { status: 401 });
  const { id } = await params;
  const photo = await prisma.photo.findFirst({ where: { id, scan: { userId: user.id } } });
  if (!photo) return new Response("Introuvable", { status: 404 });
  const data = await getStorage().get(photo.storageKey);
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": photo.mimeType, "Cache-Control": "private, max-age=86400" },
  });
}
