import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth";
import { MAX_UPLOAD_BYTES, normalizePhoto } from "@/lib/image";
import { detectBooks } from "@/lib/vision";
import { findOrCreateBookByIsbn, findOrCreateBookByTitle } from "@/lib/catalog";

export const maxDuration = 120;

/** Identifie un seul livre à partir d'une photo (page "Calculer un prix"). Coûte un crédit. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const file = (await req.formData()).get("photo");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Photo manquante ou trop lourde." }, { status: 400 });
  }
  const cost = env.creditsPerPhoto();
  const debited = await prisma.user.updateMany({ where: { id: user.id, credits: { gte: cost } }, data: { credits: { decrement: cost } } });
  if (debited.count === 0) return NextResponse.json({ error: "Pas assez de crédits." }, { status: 402 });

  try {
    const { data } = await normalizePhoto(Buffer.from(await file.arrayBuffer()));
    const [found] = await detectBooks(data, { language: user.locale, mode: "single" });
    if (!found) return NextResponse.json({ error: "Aucun livre reconnu." }, { status: 404 });
    const book =
      (found.isbn ? await findOrCreateBookByIsbn(found.isbn) : null) ??
      (await findOrCreateBookByTitle({ title: found.title, author: found.author, language: user.locale }));
    if (!book) return NextResponse.json({ error: `Livre lu (« ${found.title} ») mais introuvable dans les catalogues.` }, { status: 404 });
    return NextResponse.json({ bookId: book.id });
  } catch (e) {
    console.error("[identify]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
