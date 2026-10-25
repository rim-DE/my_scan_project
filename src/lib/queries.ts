// Requêtes de lecture partagées par les pages.
import "server-only";
import { prisma } from "./db";
import { computeStats, bestByPlatform, type PriceStats } from "./prices/stats";
import { resaleSettings } from "./prices";
import type { BadgeStats } from "./badges";
import type { Prisma } from "@prisma/client";
import type { NormalizedBox } from "./vision";

export interface PriceRow {
  id: string;
  platform: string;
  offerType: "NEW" | "USED" | "BUYBACK" | "SOLD";
  priceCents: number;
  currency: string;
  url: string | null;
  source: string;
  observedAt: string;
}

export interface BookView {
  id: string;
  isbn13: string | null;
  isbn10: string | null;
  title: string;
  authors: string[];
  publisher: string | null;
  publishedDate: string | null;
  coverUrl: string | null;
  listPriceCents: number | null;
  stats: PriceStats;
  prices: PriceRow[];
  hasDemo: boolean;
}

type BookWithPrices = Prisma.BookGetPayload<{ include: { prices: true } }>;

export function toBookView(book: BookWithPrices, country: string): BookView {
  const snaps = book.prices.filter((p) => p.country === country);
  const rows: PriceRow[] = snaps
    .map((p) => ({
      id: p.id,
      platform: p.platform,
      offerType: p.offerType,
      priceCents: p.priceCents,
      currency: p.currency,
      url: p.url,
      source: p.source,
      observedAt: p.observedAt.toISOString(),
    }))
    .sort((a, b) => a.priceCents - b.priceCents);
  return {
    id: book.id,
    isbn13: book.isbn13,
    isbn10: book.isbn10,
    title: book.title,
    authors: book.authors,
    publisher: book.publisher,
    publishedDate: book.publishedDate,
    coverUrl: book.coverUrl,
    listPriceCents: book.listPriceCents,
    stats: computeStats(snaps, resaleSettings()),
    prices: bestByPlatform(rows),
    hasDemo: snaps.some((s) => s.source === "demo"),
  };
}

export interface DetectionView {
  id: string;
  photoId: string | null;
  rawTitle: string | null;
  rawAuthor: string | null;
  bbox: NormalizedBox | null;
  confidence: string | null;
  note: string | null;
  book: BookView | null;
}

export async function getScanView(scanId: string, userId: string) {
  const scan = await prisma.scan.findFirst({
    where: { id: scanId, userId },
    include: {
      photos: { orderBy: { position: "asc" } },
      detections: { orderBy: { createdAt: "asc" }, include: { book: { include: { prices: true } } } },
    },
  });
  if (!scan) return null;
  const detections: DetectionView[] = scan.detections.map((d) => ({
    id: d.id,
    photoId: d.photoId,
    rawTitle: d.rawTitle,
    rawAuthor: d.rawAuthor,
    bbox: (d.bbox as NormalizedBox | null) ?? null,
    confidence: d.confidence,
    note: d.note,
    book: d.book ? toBookView(d.book, scan.country) : null,
  }));
  return { scan, detections };
}

export async function getBadgeStats(userId: string): Promise<BadgeStats> {
  const [scans, booksDetected, stockCount, soldCount, used] = await Promise.all([
    prisma.scan.count({ where: { userId } }),
    prisma.detection.count({ where: { scan: { userId }, bookId: { not: null } } }),
    prisma.stockItem.count({ where: { userId, status: { not: "SOLD" } } }),
    prisma.stockItem.count({ where: { userId, status: "SOLD" } }),
    prisma.priceSnapshot.findMany({
      where: { offerType: { in: ["USED", "SOLD"] }, book: { detections: { some: { scan: { userId } } } } },
      select: { bookId: true, platform: true, offerType: true, priceCents: true },
      take: 5000,
    }),
  ]);
  const byBook = new Map<string, typeof used>();
  for (const p of used) byBook.set(p.bookId, [...(byBook.get(p.bookId) ?? []), p]);
  let bestMedianCents = 0;
  for (const pts of byBook.values()) {
    const m = computeStats(pts, resaleSettings()).medianCents ?? 0;
    if (m > bestMedianCents) bestMedianCents = m;
  }
  return { scans, booksDetected, stockCount, soldCount, bestMedianCents };
}
