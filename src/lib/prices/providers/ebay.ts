// eBay Browse API (officielle) : annonces en cours par ISBN (GTIN).
// Inscription gratuite sur https://developer.ebay.com -> crée une "Production keyset".
import { env } from "../../env";
import type { Condition, PriceObservation, PriceProvider } from "../types";

const MARKETPLACES: Record<string, { id: string; currency: string }> = {
  FR: { id: "EBAY_FR", currency: "EUR" },
  US: { id: "EBAY_US", currency: "USD" },
  DE: { id: "EBAY_DE", currency: "EUR" },
  GB: { id: "EBAY_GB", currency: "GBP" },
  ES: { id: "EBAY_ES", currency: "EUR" },
  IT: { id: "EBAY_IT", currency: "EUR" },
  CA: { id: "EBAY_CA", currency: "CAD" },
};

let token: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const basic = Buffer.from(`${env.ebayClientId()}:${env.ebayClientSecret()}`).toString("base64");
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });
  if (!res.ok) throw new Error(`eBay OAuth HTTP ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return token.value;
}

interface EbayItemSummary {
  price?: { value?: string; currency?: string };
  condition?: string;
  conditionId?: string;
  itemWebUrl?: string;
}

export function mapEbayCondition(conditionId: string | undefined): Condition | null {
  switch (conditionId) {
    case "1000":
      return "NEW";
    case "2750":
      return "LIKE_NEW";
    case "3000":
      return "GOOD";
    case "4000":
      return "VERY_GOOD";
    case "5000":
      return "GOOD";
    case "6000":
      return "ACCEPTABLE";
    default:
      return null;
  }
}

export function parseEbayItems(items: EbayItemSummary[], currency: string): PriceObservation[] {
  const out: PriceObservation[] = [];
  for (const it of items) {
    const value = Number(it.price?.value);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (it.price?.currency && it.price.currency !== currency) continue;
    const condition = mapEbayCondition(it.conditionId);
    out.push({
      platform: "ebay",
      offerType: condition === "NEW" ? "NEW" : "USED",
      condition,
      priceCents: Math.round(value * 100),
      currency,
      url: it.itemWebUrl ?? null,
    });
  }
  return out;
}

export const ebayProvider: PriceProvider = {
  id: "ebay",
  source: "api",
  enabled: () => Boolean(env.ebayClientId() && env.ebayClientSecret()),
  async fetch(book, country) {
    const mp = MARKETPLACES[country] ?? MARKETPLACES.FR;
    const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
    url.searchParams.set("gtin", book.isbn13);
    url.searchParams.set("limit", "50");
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${await getToken()}`, "X-EBAY-C-MARKETPLACE-ID": mp.id },
    });
    if (!res.ok) throw new Error(`eBay Browse HTTP ${res.status}`);
    const json = (await res.json()) as { itemSummaries?: EbayItemSummary[] };
    return { observations: parseEbayItems(json.itemSummaries ?? [], mp.currency) };
  },
};
