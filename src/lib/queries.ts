// Requêtes de lecture partagées par les pages.
import "server-only";
import { prisma } from "./db";
import { computeStats, bestByPlatform, type PriceStats } from "./prices/stats";
import { resaleSettings } from "./prices";
import type { BadgeStats } from "./badges";
import type { Prisma } from "@prisma/client";
import type { NormalizedBox, Point, TextDirection } from "./geometry";
import { computeMetrics, type BookMetrics } from "./prices/metrics";
import { env } from "./env";

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
  salesRank: number | null;
  rating: number | null;
  reviewCount: number | null;
  stats: PriceStats;
  metrics: BookMetrics;
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
  const stats = computeStats(snaps, resaleSettings());
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
    salesRank: book.salesRank,
    rating: book.rating,
    reviewCount: book.reviewCount,
    stats,
    metrics: computeMetrics(snaps, stats, book, new Date(), { bangerMinProfitCents: env.bangerMinProfitCents() }),
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
  polygon: Point[] | null;
  textDirection: TextDirection | null;
  confidence: string | null;
  note: string | null;
  book: BookView | null;
  /** Le livre est déjà dans ton stock (non vendu). */
  inStock: boolean;
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
  const bookIds = [...new Set(scan.detections.flatMap((d) => (d.bookId ? [d.bookId] : [])))];
  const stocked = await prisma.stockItem.findMany({
    where: { userId, bookId: { in: bookIds }, status: { not: "SOLD" } },
    select: { bookId: true },
  });
  const inStock = new Set(stocked.map((s) => s.bookId));
  const detections: DetectionView[] = scan.detections.map((d) => ({
    id: d.id,
    photoId: d.photoId,
    rawTitle: d.rawTitle,
    rawAuthor: d.rawAuthor,
    bbox: (d.bbox as NormalizedBox | null) ?? null,
    polygon: (d.polygon as Point[] | null) ?? null,
    textDirection: (d.textDirection as TextDirection | null) ?? null,
    confidence: d.confidence,
    note: d.note,
    book: d.book ? toBookView(d.book, scan.country) : null,
    inStock: d.bookId ? inStock.has(d.bookId) : false,
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
