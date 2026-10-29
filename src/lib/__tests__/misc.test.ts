import { describe, expect, it } from "vitest";
import { createLimiter, mapLimit } from "../concurrency";
import { BADGES, unlockedBadges } from "../badges";
import { formatPrice, parsePriceToCents } from "../money";
import { fmt, getDict } from "../i18n";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";

describe("utilitaires", () => {
  it("mapLimit respecte la limite et l'ordre", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12]);
    expect(peak).toBe(2);
  });

  it("createLimiter partage la limite entre plusieurs appelants", async () => {
    const limit = createLimiter(3);
    let running = 0;
    let peak = 0;
    const task = (n: number) =>
      limit(async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 2 + (n % 3)));
        running--;
        return n;
      });
    // Deux « photos » qui lancent chacune 5 tâches en même temps.
    const [a, b] = await Promise.all([Promise.all([1, 2, 3, 4, 5].map(task)), Promise.all([6, 7, 8, 9, 10].map(task))]);
    expect([...a, ...b]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(peak).toBe(3);
    expect(running).toBe(0);
  });

  it("badges", () => {
    const none = unlockedBadges({ scans: 0, booksDetected: 0, stockCount: 0, soldCount: 0, bestMedianCents: 0 });
    expect(none).toHaveLength(0);
    const all = unlockedBadges({ scans: 10, booksDetected: 100, stockCount: 10, soldCount: 1, bestMedianCents: 3000 });
    expect(all).toHaveLength(BADGES.length);
  });

  it("prix", () => {
    expect(parsePriceToCents("12,50")).toBe(1250);
    expect(parsePriceToCents("3 €")).toBe(300);
    expect(parsePriceToCents("abc")).toBe(0);
    expect(formatPrice(2200).replace(/\s/g, " ")).toBe("22 €");
    expect(formatPrice(null)).toBe("—");
  });

  it("traductions", () => {
    expect(fmt("{n} livre(s)", { n: 3 })).toBe("3 livre(s)");
    expect(getDict("en").nav.stock).toBe("My stock");
    expect(getDict("xx").nav.stock).toBe("Mon stock");
    // Les deux dictionnaires ont exactement les mêmes clés.
    const keys = (o: object, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(en).sort()).toEqual(keys(fr).sort());
  });
});
