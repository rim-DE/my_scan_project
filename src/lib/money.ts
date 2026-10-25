export function formatPrice(cents: number | null | undefined, currency = "EUR", locale = "fr-FR"): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** "12,50" ou "12.5" -> 1250 centimes. */
export function parsePriceToCents(input: string): number | null {
  const n = Number(input.replace(",", ".").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
