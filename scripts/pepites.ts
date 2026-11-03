// Charge les pépites depuis Keepa et met à jour data/pepites.csv (voir src/lib/pepites.ts).
//
//   KEEPA_API_KEY=… npm run pepites
//   npm run pepites -- --max 200        (essai : 200 livres au plus)
//
// Lancé le 1er et le 15 du mois (6 passages ce jour-là, toutes les 4 h) par .github/workflows/pepites.yml. Coût : environ 1 jeton
// Keepa par livre. Keepa redonne 20 jetons par minute (1 200 par heure) : le script attend tout seul quand il n'en a plus.
// Un passage prend au plus MAX_PER_RUN fiches : les livres nouveaux d'abord, puis ceux dont les infos ont plus de
// STALE_DAYS jours. Chaque livre est ainsi remis à jour toutes les deux semaines.
// Un livre vendu moins de MIN_SALES_180 fois en 6 mois sort du fichier (sauf s'il vaut 50 € et plus et s'est
// vendu au moins une fois en 2 ans, voir sellsEnough) ; il est noté dans ECARTES pour ne pas
// être rechargé à chaque passage, et sera revu deux semaines plus tard (il revient s'il se vend de nouveau).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { BANDS, finderSelection, isAdultTitle, mergeRows, MIN_SALES_180, parseCsv, pepiteRow, sellsEnough, toCsv, type PepiteRow } from "../src/lib/pepites";

const FILE = "data/pepites.csv";
/** Livres écartés faute de ventes (« asin;date »), revus après STALE_DAYS jours. */
const ECARTES = "data/pepites-ecartes.csv";
const DOMAIN_FR = 4;
const PER_PAGE = 500;
const BATCH = 50;
/** Fiches chargées par passage : ~3 h 20 de jetons, sous la limite de 6 h d'une tâche GitHub. */
const MAX_PER_RUN = 4000;
/** Âge à partir duquel un livre déjà dans le fichier est remis à jour. */
const STALE_DAYS = 13;

const { values } = parseArgs({ options: { max: { type: "string" } } });
const max = values.max ? Number(values.max) : MAX_PER_RUN;
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
    for (let page = 0; ; page++) {
      const sel = finderSelection(band, page, PER_PAGE);
      const json = await keepa<{ asinList?: string[]; totalResults?: number }>(
        "query",
        { selection: JSON.stringify(sel) },
        10 + PER_PAGE / 100,
      );
      const list = json.asinList ?? [];
      list.forEach((a) => found.add(a));
      console.log(`Tranche ${band.min / 100} € et +${band.language === "english" ? " (anglais)" : ""}${band.minRank ? ` (rang ${band.minRank}+)` : ""} (page ${page}) : ${list.length} livres sur ${json.totalResults ?? "?"}`);
      if (list.length < PER_PAGE) break;
    }
  }
  return [...found];
}

async function main() {
  // Les livres érotiques chargés avant le filtre sont retirés, ainsi que ceux qui ne se vendent plus assez.
  const previous = (await readFile(FILE, "utf8").then(parseCsv, () => [] as PepiteRow[])).filter((r) => !isAdultTitle(r.titre));
  console.log(`${previous.length} livres déjà dans ${FILE}`);
  const staleBefore = new Date(Date.now() - STALE_DAYS * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  // Écartés récemment : on ne les recharge pas avant STALE_DAYS jours.
  const rejected = new Map(
    (await readFile(ECARTES, "utf8").catch(() => ""))
      .split("\n")
      .map((l) => l.trim().split(";"))
      .filter(([a, d]) => a && d && d >= staleBefore) as [string, string][],
  );
  const known = new Set([...previous.map((r) => r.asin), ...rejected.keys()]);
  const added = (await findAsins()).filter((a) => !known.has(a));
  // Les livres déjà connus sont remis à jour aussi, même s'ils ne sont plus dans la recherche : les plus anciens d'abord.
  const stale = previous.filter((r) => !r.maj || r.maj < staleBefore).sort((a, b) => a.maj.localeCompare(b.maj)).map((r) => r.asin);
  const asins = [...added, ...stale].slice(0, max);
  console.log(`${added.length} nouveaux livres, ${stale.length} à remettre à jour : ${asins.length} fiches chargées ce passage`);

  const fresh: PepiteRow[] = [];
  const result = () => {
    const rows = mergeRows(previous, fresh);
    for (const r of rows) if (!sellsEnough(r)) rejected.set(r.asin, today);
    return rows.filter((r) => sellsEnough(r));
  };
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
    if ((i / BATCH) % 10 === 9) await save(result(), rejected);
  }
  const rows = result();
  await save(rows, rejected);
  console.log(`${FILE} : ${rows.length} livres (${fresh.length} mis à jour, ${rejected.size} écartés : moins de ${MIN_SALES_180} ventes en 6 mois, ou livre à 50 € et plus pas vendu en 2 ans)`);
}

async function save(rows: PepiteRow[], rejected: Map<string, string>) {
  await mkdir(dirname(FILE), { recursive: true });
  await writeFile(FILE, toCsv(rows));
  await writeFile(ECARTES, [...rejected].map(([a, d]) => `${a};${d}`).join("\n") + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
