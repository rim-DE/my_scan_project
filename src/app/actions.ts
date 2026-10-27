"use server";

import { after } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { checkPassword, endSession, hashPassword, requireUser, startSession } from "@/lib/auth";
import { LOCALE_COOKIE, asLocale, getDict } from "@/lib/i18n";
import { findOrCreateBookByIsbn, findOrCreateBookByTitle } from "@/lib/catalog";
import { normalizeIsbn } from "@/lib/isbn";
import { parsePriceToCents } from "@/lib/money";
import { refreshPrices } from "@/lib/prices";
import { processScan } from "@/lib/scan-processor";
import { getStorage } from "@/lib/storage";
import { mapLimit } from "@/lib/concurrency";
import type { BookCondition, OfferType, StockStatus } from "@prisma/client";

export type FormState = { error?: string; ok?: string } | undefined;

const CONDITIONS: BookCondition[] = ["NEW", "LIKE_NEW", "VERY_GOOD", "GOOD", "ACCEPTABLE"];
const OFFER_TYPES: OfferType[] = ["NEW", "USED", "BUYBACK", "SOLD"];
const STOCK_STATUSES: StockStatus[] = ["IN_STOCK", "LISTED", "SOLD"];

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

async function t() {
  return getDict((await cookies()).get(LOCALE_COOKIE)?.value);
}

// ---------- Authentification ----------

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await prisma.user.findUnique({ where: { email: str(fd, "email").toLowerCase() } });
  if (!user || !(await checkPassword(str(fd, "password"), user.passwordHash))) return { error: (await t()).auth.invalid };
  await startSession(user.id);
  redirect("/");
}

export async function registerAction(_: FormState, fd: FormData): Promise<FormState> {
  const d = await t();
  // Appli perso : l'inscription est ouverte pour le tout premier compte, ensuite seulement si ALLOW_REGISTRATION=true.
  if (!env.allowRegistration() && (await prisma.user.count()) > 0) return { error: d.auth.registrationClosed };
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  if (password.length < 8) return { error: d.auth.passwordTooShort };
  if (await prisma.user.findUnique({ where: { email } })) return { error: d.auth.emailTaken };
  const user = await prisma.user.create({
    data: { email, name: str(fd, "name") || null, passwordHash: await hashPassword(password), credits: env.initialCredits() },
  });
  await startSession(user.id);
  redirect("/");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

export async function setLocaleAction(locale: string) {
  const l = asLocale(locale);
  (await cookies()).set(LOCALE_COOKIE, l, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  const user = await requireUser();
  await prisma.user.update({ where: { id: user.id }, data: { locale: l } });
  revalidatePath("/", "layout");
}

export async function updateProfileAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const locale = asLocale(str(fd, "locale"));
  await prisma.user.update({ where: { id: user.id }, data: { name: str(fd, "name") || null, locale } });
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  return { ok: getDict(locale).profile.saved };
}

// ---------- Scans ----------

async function ownScan(scanId: string) {
  const user = await requireUser();
  const scan = await prisma.scan.findFirst({ where: { id: scanId, userId: user.id }, include: { photos: true } });
  if (!scan) throw new Error("Scan introuvable");
  return scan;
}

export async function toggleFavoriteAction(scanId: string) {
  const scan = await ownScan(scanId);
  await prisma.scan.update({ where: { id: scan.id }, data: { favorite: !scan.favorite } });
  revalidatePath("/");
}

export async function deleteScanAction(scanId: string) {
  const scan = await ownScan(scanId);
  await prisma.scan.delete({ where: { id: scan.id } });
  for (const p of scan.photos) await getStorage().delete(p.storageKey).catch(() => {});
  revalidatePath("/");
}

export async function retryScanAction(scanId: string) {
  const scan = await ownScan(scanId);
  await prisma.scan.update({ where: { id: scan.id }, data: { status: "PENDING", error: null } });
  after(() => processScan(scan.id));
  revalidatePath(`/scans/${scan.id}`);
}

/** Charge les prix de tous les livres d'un scan (utile pour un scan fait avant d'ajouter une source de prix). */
export async function refreshScanPricesAction(scanId: string) {
  const scan = await ownScan(scanId);
  const dets = await prisma.detection.findMany({ where: { scanId: scan.id, bookId: { not: null } }, select: { bookId: true } });
  const bookIds = [...new Set(dets.map((d) => d.bookId!))];
  // Les sources déjà interrogées avec succès il y a moins de 24 h ne sont pas rappelées (pas de jeton Keepa gaspillé).
  await mapLimit(bookIds, 6, (id) => refreshPrices(id, scan.country).catch((e) => console.warn("[prix] scan", id, e)));
  revalidatePath(`/scans/${scan.id}`);
}

/** Relance la recherche des livres « non identifiés » d'un scan (titres lus mais catalogue saturé ou injoignable). */
export async function identifyMissingAction(scanId: string) {
  const scan = await ownScan(scanId);
  const dets = await prisma.detection.findMany({ where: { scanId: scan.id, bookId: null, rawTitle: { not: null } } });
  // 4 à la fois seulement : c'est justement l'excès de recherches simultanées qui fait saturer Google Books.
  await mapLimit(dets, 4, async (d) => {
    const book = await findOrCreateBookByTitle({ title: d.rawTitle!, author: d.rawAuthor, language: scan.bookLanguage }).catch((e) => {
      console.warn("[scan] identification impossible", d.rawTitle, e);
      return null;
    });
    if (!book) return;
    await prisma.detection.update({ where: { id: d.id }, data: { bookId: book.id } });
    await refreshPrices(book.id, scan.country).catch((e) => console.warn("[prix] scan", book.id, e));
  });
  revalidatePath(`/scans/${scan.id}`);
}

export async function barcodeScanAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const d = await t();
  const norm = normalizeIsbn(str(fd, "isbn"));
  if (!norm) return { error: d.newScan.invalidIsbn };
  const country = str(fd, "country") || "FR";
  let book;
  try {
    book = await findOrCreateBookByIsbn(norm.isbn13);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  if (!book) return { error: d.price.notFound };
  await startSingleBookScan(user.id, book, country);
}

/** Scan d'un seul livre déjà identifié (par la photo de sa couverture, via /api/identify). */
export async function bookScanAction(bookId: string, country: string) {
  const user = await requireUser();
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) return;
  await startSingleBookScan(user.id, book, country || "FR");
}

async function startSingleBookScan(userId: string, book: { id: string; title: string; language: string | null }, country: string) {
  const scan = await prisma.scan.create({
    data: {
      userId,
      name: book.title,
      kind: "BARCODE",
      country,
      bookLanguage: book.language ?? "fr",
      detections: { create: { bookId: book.id, rawTitle: book.title } },
    },
  });
  after(() => processScan(scan.id));
  redirect(`/scans/${scan.id}`);
}

// ---------- Livres ----------

export async function saveNoteAction(detectionId: string, note: string) {
  const user = await requireUser();
  const det = await prisma.detection.findFirst({ where: { id: detectionId, scan: { userId: user.id } } });
  if (!det) return;
  await prisma.detection.update({ where: { id: det.id }, data: { note: note.trim() || null } });
  revalidatePath(`/scans/${det.scanId}`);
}

export async function addManualPriceAction(fd: FormData) {
  await requireUser();
  const bookId = str(fd, "bookId");
  const priceCents = parsePriceToCents(str(fd, "price"));
  const offerType = str(fd, "offerType") as OfferType;
  if (!priceCents || !OFFER_TYPES.includes(offerType)) return;
  await prisma.priceSnapshot.create({
    data: {
      bookId,
      platform: str(fd, "platform") || "autre",
      offerType,
      priceCents,
      country: str(fd, "country") || "FR",
      url: str(fd, "url") || null,
      source: "manual",
    },
  });
  revalidatePath((str(fd, "path") || "/").split("?")[0]);
}

export async function deletePriceAction(priceId: string, path: string) {
  await requireUser();
  // Seuls les prix saisis à la main peuvent être supprimés.
  await prisma.priceSnapshot.deleteMany({ where: { id: priceId, source: "manual" } });
  revalidatePath(path.split("?")[0]);
}

export async function refreshPricesAction(bookId: string, country: string, path: string) {
  await requireUser();
  await refreshPrices(bookId, country, { force: true });
  revalidatePath(path.split("?")[0]);
}

// ---------- Stock ----------

export async function addToStockAction(fd: FormData) {
  const user = await requireUser();
  const condition = str(fd, "condition") as BookCondition;
  await prisma.stockItem.create({
    data: {
      userId: user.id,
      bookId: str(fd, "bookId"),
      condition: CONDITIONS.includes(condition) ? condition : "GOOD",
      purchasePriceCents: parsePriceToCents(str(fd, "purchasePrice")) ?? null,
      note: str(fd, "note") || null,
    },
  });
  revalidatePath("/stock");
}

export async function updateStockItemAction(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "id");
  const status = str(fd, "status") as StockStatus;
  const condition = str(fd, "condition") as BookCondition;
  await prisma.stockItem.updateMany({
    where: { id, userId: user.id },
    data: {
      status: STOCK_STATUSES.includes(status) ? status : undefined,
      condition: CONDITIONS.includes(condition) ? condition : undefined,
      purchasePriceCents: str(fd, "purchasePrice") ? parsePriceToCents(str(fd, "purchasePrice")) : null,
      soldPriceCents: str(fd, "soldPrice") ? parsePriceToCents(str(fd, "soldPrice")) : null,
    },
  });
  revalidatePath("/stock");
}

export async function removeStockItemAction(id: string) {
  const user = await requireUser();
  await prisma.stockItem.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/stock");
}

// ---------- Listes d'achat ----------

export async function createListAction(fd: FormData) {
  const user = await requireUser();
  const name = str(fd, "name");
  if (!name) return;
  await prisma.shoppingList.create({ data: { userId: user.id, name } });
  revalidatePath("/lists");
  revalidatePath("/");
}

export async function deleteListAction(id: string) {
  const user = await requireUser();
  await prisma.shoppingList.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/lists");
  revalidatePath("/");
}

export async function addToListAction(fd: FormData) {
  const user = await requireUser();
  const list = await prisma.shoppingList.findFirst({ where: { id: str(fd, "listId"), userId: user.id } });
  if (!list) return;
  const bookId = str(fd, "bookId");
  await prisma.shoppingListItem.upsert({
    where: { listId_bookId: { listId: list.id, bookId } },
    create: { listId: list.id, bookId },
    update: {},
  });
  revalidatePath("/lists");
}

export async function removeFromListAction(itemId: string) {
  const user = await requireUser();
  await prisma.shoppingListItem.deleteMany({ where: { id: itemId, list: { userId: user.id } } });
  revalidatePath("/lists");
}
