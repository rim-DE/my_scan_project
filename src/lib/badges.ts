// Badges calculés à partir de ton activité (pas de table dédiée).

export interface BadgeStats {
  scans: number;
  booksDetected: number;
  stockCount: number;
  soldCount: number;
  bestMedianCents: number;
}

export interface Badge {
  id: string;
  emoji: string;
  name: { fr: string; en: string };
  description: { fr: string; en: string };
  unlocked: (s: BadgeStats) => boolean;
}

export const BADGES: Badge[] = [
  { id: "first-scan", emoji: "📸", name: { fr: "Premier scan", en: "First scan" }, description: { fr: "Faire un premier scan", en: "Do your first scan" }, unlocked: (s) => s.scans >= 1 },
  { id: "ten-scans", emoji: "📚", name: { fr: "Bibliophile", en: "Bibliophile" }, description: { fr: "Faire 10 scans", en: "Do 10 scans" }, unlocked: (s) => s.scans >= 10 },
  { id: "hundred-books", emoji: "🔎", name: { fr: "Chasseur de livres", en: "Book hunter" }, description: { fr: "Détecter 100 livres", en: "Detect 100 books" }, unlocked: (s) => s.booksDetected >= 100 },
  { id: "stock-10", emoji: "📦", name: { fr: "Stockiste", en: "Stockist" }, description: { fr: "Avoir 10 livres en stock", en: "Have 10 books in stock" }, unlocked: (s) => s.stockCount >= 10 },
  { id: "first-sale", emoji: "💶", name: { fr: "Première vente", en: "First sale" }, description: { fr: "Marquer un livre comme vendu", en: "Mark a book as sold" }, unlocked: (s) => s.soldCount >= 1 },
  { id: "treasure", emoji: "💎", name: { fr: "Trésor", en: "Treasure" }, description: { fr: "Trouver un livre à plus de 30 € (médiane)", en: "Find a book worth over €30 (median)" }, unlocked: (s) => s.bestMedianCents >= 3000 },
];

export function unlockedBadges(stats: BadgeStats): Badge[] {
  return BADGES.filter((b) => b.unlocked(stats));
}
