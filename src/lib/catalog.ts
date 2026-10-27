// Enregistre les livres identifiés en base, avec un cache des recherches.
import { prisma } from "./db";
import { lookupByIsbn, lookupByTitle, lookupCacheKey, type BookInfo } from "./books";
import { normalizeIsbn } from "./isbn";

async function upsertBook(info: BookInfo) {
  const data = {
    isbn10: info.isbn10,
    title: info.title,
    authors: info.authors,
    publisher: info.publisher,
    publishedDate: info.publishedDate,
    language: info.language,
    pageCount: info.pageCount,
    coverUrl: info.coverUrl,
    listPriceCents: info.listPriceCents,
    source: info.source,
  };
  if (info.isbn13) {
    return prisma.book.upsert({ where: { isbn13: info.isbn13 }, create: { isbn13: info.isbn13, ...data }, update: {} });
  }
  return prisma.book.create({ data });
}

export async function findOrCreateBookByIsbn(raw: string) {
  const norm = normalizeIsbn(raw);
  if (!norm) return null;
  const existing = await prisma.book.findUnique({ where: { isbn13: norm.isbn13 } });
  if (existing) return existing;
  const info = await lookupByIsbn(norm.isbn13);
  if (!info) return null;
  return upsertBook({ ...info, isbn13: norm.isbn13, isbn10: info.isbn10 ?? norm.isbn10 });
}

export async function findOrCreateBookByTitle(q: { title: string; author?: string | null; publisher?: string | null; language: string }) {
  const key = lookupCacheKey(q.title, q.author, q.language, q.publisher);
  const cached = await prisma.lookupCache.findUnique({ where: { key } });
  if (cached) return cached.bookId ? prisma.book.findUnique({ where: { id: cached.bookId } }) : null;

  const info = await lookupByTitle(q);
  const book = info ? await upsertBook(info) : null;
  await prisma.lookupCache.upsert({ where: { key }, create: { key, bookId: book?.id ?? null }, update: { bookId: book?.id ?? null } });
  return book;
}
