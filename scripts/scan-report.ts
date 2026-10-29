// Teste la chaîne complète sur une photo, sans base de données, et produit une page HTML autonome.
//
//   npm run scan:report -- etagere.jpg                       (détection Gemini ou Claude + catalogues + prix configurés)
//   npm run scan:report -- etagere.jpg --out resultat.html
//   npm run scan:report -- etagere.jpg --detections lecture.json   (rejoue une lecture déjà faite, sans appeler le modèle)
//   npm run scan:report -- etagere.jpg --demo                (prix de démonstration, FAUX, pour voir la mise en page)
//
// Le fichier --detections suit le format renvoyé par le modèle : { "books": [...] }, coins en pixels de la photo
// réduite (voir normalizePhoto). La commande écrit aussi ce fichier à côté de la page à chaque vraie détection.
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { env } from "../src/lib/env";
import { normalizePhoto } from "../src/lib/image";
import { cleanDetections, detectBooks, DetectionResultSchema, type CleanDetection } from "../src/lib/vision";
import { lookupByIsbn, lookupByTitle, type BookInfo } from "../src/lib/books";
import { enabledProviders, resaleSettings } from "../src/lib/prices";
import { bestAmazonOffer, siteLinks } from "../src/lib/prices/platforms";
import { demoPrices } from "../src/lib/prices/providers/demo";
import { computeStats } from "../src/lib/prices/stats";
import { computeMetrics } from "../src/lib/prices/metrics";
import type { PriceObservation, SalesEstimate } from "../src/lib/prices/types";
import { mapLimit } from "../src/lib/concurrency";
import { renderReport, type ReportBook } from "../src/lib/report";

async function identify(d: CleanDetection, language: string): Promise<BookInfo | null> {
  try {
    if (d.isbn) {
      const byIsbn = await lookupByIsbn(d.isbn.replace(/[^0-9Xx]/g, ""));
      if (byIsbn) return byIsbn;
    }
    return await lookupByTitle({ title: d.title, author: d.author, language });
  } catch (e) {
    console.warn(`  catalogue indisponible pour « ${d.title} » : ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

async function prices(info: BookInfo | null, d: CleanDetection, demo: boolean): Promise<{ obs: PriceObservation[]; sales?: SalesEstimate; demo: boolean }> {
  if (demo) {
    // En démo, un livre non identifié reçoit quand même des prix factices (calculés à partir du titre lu).
    return { obs: demoPrices(info?.isbn13 ?? d.title, "FR"), demo: true };
  }
  if (!info?.isbn13) return { obs: [], demo: false };
  const obs: PriceObservation[] = [];
  let sales: SalesEstimate | undefined;
  for (const p of enabledProviders()) {
    try {
      const r = await p.fetch({ isbn13: info.isbn13, isbn10: info.isbn10, title: info.title, authors: info.authors }, "FR");
      obs.push(...r.observations);
      sales = r.sales ?? sales;
    } catch (e) {
      console.warn(`  ${p.id} : ${e instanceof Error ? e.message : e}`);
    }
  }
  return { obs, sales, demo: enabledProviders().some((p) => p.source === "demo") };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string" },
      detections: { type: "string" },
      language: { type: "string", default: "fr" },
      demo: { type: "boolean", default: false },
      name: { type: "string" },
    },
  });
  const input = positionals[0];
  if (!input) throw new Error("Usage : npm run scan:report -- <photo.jpg> [--out page.html] [--detections lecture.json] [--demo]");
  const out = values.out ?? input.replace(/\.[^.]+$/, "") + "-resultat.html";

  const photo = await normalizePhoto(await readFile(input));
  console.log(`Photo : ${photo.width} × ${photo.height} px`);

  let detections: CleanDetection[];
  const notes: string[] = [];
  if (values.detections) {
    const file = JSON.parse(await readFile(values.detections, "utf8")) as { books?: Record<string, unknown>[] };
    // Les anciennes lectures n'ont pas de numéro d'étagère.
    const raw = DetectionResultSchema.parse({ books: (file.books ?? []).map((b) => ({ shelf: 0, ...b })) });
    detections = cleanDetections(raw.books, photo);
    notes.push(`Lecture de la photo rejouée depuis ${basename(values.detections)} (le modèle n'a pas été appelé).`);
  } else {
    console.log(`Détection des livres avec ${env.visionProvider() === "claude" ? "Claude" : "Gemini"}…`);
    detections = await detectBooks(photo.data, { language: values.language!, mode: "shelf" });
    const saved = out.replace(/\.html$/, "") + "-lecture.json";
    const books = detections.map((d) => ({ ...d, polygon: undefined, bbox: undefined }));
    await writeFile(saved, JSON.stringify({ books }, null, 1));
    console.log(`Lecture enregistrée dans ${saved}`);
  }
  console.log(`${detections.length} livre(s) détecté(s). Identification et prix…`);

  const books: ReportBook[] = await mapLimit(detections, 4, async (d) => {
    const info = await identify(d, values.language!);
    const { obs, sales, demo } = await prices(info, d, values.demo!);
    const now = new Date();
    const points = obs.map((o) => ({ ...o, observedAt: o.observedAt ?? now }));
    const stats = points.length ? computeStats(points, resaleSettings()) : null;
    const metrics = stats
      ? computeMetrics(points, stats, { listPriceCents: info?.listPriceCents ?? null, sales12m: sales?.sales12m ?? null, sales30d: sales?.sales30d ?? null })
      : null;
    const buyback = points.filter((p) => p.offerType === "BUYBACK").sort((a, b) => b.priceCents - a.priceCents)[0];
    const amazon = points.filter((p) => p.platform === "amazon" && (p.offerType === "NEW" || p.offerType === "USED"));
    const best = bestAmazonOffer(points);
    return {
      rawTitle: d.title,
      rawAuthor: d.author,
      confidence: d.confidence,
      polygon: d.polygon,
      textDirection: d.text_direction,
      book: info && {
        title: info.title,
        authors: info.authors,
        publisher: info.publisher,
        isbn13: info.isbn13,
        isbn10: info.isbn10,
        coverUrl: info.coverUrl,
        listPriceCents: info.listPriceCents,
      },
      stats,
      metrics,
      buyback: buyback ? { platform: buyback.platform, priceCents: buyback.priceCents, observedAt: buyback.observedAt.toISOString() } : null,
      amazon: amazon.length
        ? { priceCents: Math.min(...amazon.map((a) => a.priceCents)), count: amazon.length, url: amazon[0].url ?? null }
        : null,
      amazonBest: best ? { offerType: best.offerType, priceCents: best.priceCents, observedAt: best.observedAt.toISOString(), url: best.url ?? null } : null,
      sites: siteLinks({ isbn13: info?.isbn13 ?? null, title: info?.title ?? d.title, author: info?.authors[0] ?? d.author }, points),
      demo,
    };
  });

  const identified = books.filter((b) => b.book).length;
  notes.push(`${books.length} livres détectés, ${identified} identifiés dans Google Books / Open Library.`);
  if (books.some((b) => b.demo)) notes.push("Attention : les prix et ventes affichés sont des données de DÉMONSTRATION inventées, pas de vrais prix.");

  await writeFile(
    out,
    renderReport({
      name: values.name ?? basename(input),
      createdAt: new Date().toISOString(),
      photo: { dataUrl: `data:image/jpeg;base64,${photo.data.toString("base64")}`, width: photo.width, height: photo.height },
      books,
      notes,
    }),
  );
  console.log(`Page écrite : ${out}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
