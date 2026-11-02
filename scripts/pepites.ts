// Charge les pépites depuis Keepa et met à jour data/pepites.csv (voir src/lib/pepites.ts).
//
//   KEEPA_API_KEY=… npm run pepites
//   npm run pepites -- --max 200        (essai : 200 livres au plus)
//
// Lancé chaque semaine par .github/workflows/pepites.yml. Coût : environ 1 jeton Keepa par livre.
// Keepa redonne 20 jetons par minute : le script attend tout seul quand il n'en a plus.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { BANDS, finderSelection, mergeRows, parseCsv, pepiteRow, toCsv, type PepiteRow } from "../src/lib/pepites";

const FILE = "data/pepites.csv";
const DOMAIN_FR = 4;
const PER_PAGE = 500;
const BATCH = 50;

const { values } = parseArgs({ options: { max: { type: "string" } } });
const max = values.max ? Number(values.max) : Infinity;
const key = process.env.KEEPA_API_KEY;
if (!key) throw new Error("KEEPA_API_KEY manquante.");

interface TokenInfo {
  tokensLeft?: number;
  refillIn?: number;
  refillRate?: number;
}
let tokens: TokenInfo = {};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Attend d'avoir assez de jetons pour la prochaine demande. */
async function waitFor(needed: number) {
  const left = tokens.tokensLeft ?? needed;
  if (left >= needed) return;
  const rate = tokens.refillRate || 20;
  const ms = Math.ceil((needed - left) / rate) * 60000 + (tokens.refillIn ?? 0);
  console.log(`  ${left} jetons, il en faut ${needed} : pause de ${Math.round(ms / 1000)} s`);
  await sleep(ms);
  tokens.tokensLeft = needed;
}

async function keepa<T>(path: string, params: Record<string, string>, cost: number): Promise<T> {
  for (let attempt = 0; attempt < 10; attempt++) {
    await waitFor(cost);
    const url = new URL(`https://api.keepa.com/${path}`);
    url.searchParams.set("key", key!);
    url.searchParams.set("domain", String(DOMAIN_FR));
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url);
    const json = (await res.json().catch(() => ({}))) as T & TokenInfo;
    tokens = { tokensLeft: json.tokensLeft, refillIn: json.refillIn, refillRate: json.refillRate };
    if (res.status === 429) {
      // Plus de jetons : on attend que la réserve remonte, puis on recommence.
      await sleep(Math.max(json.refillIn ?? 60000, 5000));
      tokens.tokensLeft = undefined;
      continue;
    }
    // Keepa explique son refus dans la réponse (clé invalide, filtre inconnu…) : on l'affiche.
    if (!res.ok) throw new Error(`Keepa ${path} HTTP ${res.status} : ${JSON.stringify(json).slice(0, 500)}`);
    return json;
  }
  throw new Error(`Keepa ${path} : toujours pas de jetons après 10 essais.`);
}

/** ASIN des livres de chaque tranche de prix (10 jetons + 1 par 100 résultats). */
async function findAsins(): Promise<string[]> {
  const found = new Set<string>();
  for (const band of BANDS) {
    for (let page = 0; found.size < max; page++) {
      const sel = finderSelection(band, page, PER_PAGE);
      const json = await keepa<{ asinList?: string[]; totalResults?: number }>(
        "query",
        { selection: JSON.stringify(sel) },
        10 + PER_PAGE / 100,
      );
      const list = json.asinList ?? [];
      list.forEach((a) => found.add(a));
      console.log(`Tranche ${band.min / 100} € et + (page ${page}) : ${list.length} livres sur ${json.totalResults ?? "?"}`);
      if (list.length < PER_PAGE) break;
    }
  }
  return [...found].slice(0, max);
}

async function main() {
  const previous = await readFile(FILE, "utf8").then(parseCsv, () => [] as PepiteRow[]);
  console.log(`${previous.length} livres déjà dans ${FILE}`);
  // Les livres déjà connus sont rafraîchis aussi, même s'ils ne sont plus dans la recherche.
  const asins = [...new Set([...(await findAsins()), ...previous.map((r) => r.asin)])].slice(0, max);
  console.log(`${asins.length} fiches à charger (environ ${asins.length} jetons)`);

  const fresh: PepiteRow[] = [];
  for (let i = 0; i < asins.length; i += BATCH) {
    const batch = asins.slice(i, i + BATCH);
    const json = await keepa<{ products?: Parameters<typeof pepiteRow>[0][] }>(
      "product",
      { asin: batch.join(","), stats: "180", history: "1" },
      batch.length,
    );
    for (const p of json.products ?? []) {
      const row = pepiteRow(p);
      if (row) fresh.push(row);
    }
    console.log(`  ${Math.min(i + BATCH, asins.length)}/${asins.length} (jetons restants : ${tokens.tokensLeft ?? "?"})`);
    // Sauvegarde au fil de l'eau : si la tâche s'arrête, rien n'est perdu.
    if ((i / BATCH) % 10 === 9) await save(mergeRows(previous, fresh));
  }
  const rows = mergeRows(previous, fresh);
  await save(rows);
  console.log(`${FILE} : ${rows.length} livres (${fresh.length} mis à jour)`);
}

async function save(rows: PepiteRow[]) {
  await mkdir(dirname(FILE), { recursive: true });
  await writeFile(FILE, toCsv(rows));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
