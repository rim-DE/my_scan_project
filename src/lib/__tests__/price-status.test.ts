import { describe, expect, it } from "vitest";
import { EMPTY_RETRY_BEFORE, needsFetch, priceStatus } from "../prices/status";

const recent = new Date(EMPTY_RETRY_BEFORE.getTime() + 60_000);
const old = new Date(EMPTY_RETRY_BEFORE.getTime() - 60_000);

describe("priceStatus", () => {
  it("ok dès qu'il y a un prix", () => {
    expect(priceStatus([], 2, ["keepa"])).toBe("ok");
  });
  it("en attente tant qu'une source n'a pas répondu correctement", () => {
    expect(priceStatus([], 0, ["keepa"])).toBe("waiting");
    expect(priceStatus([{ provider: "keepa", ok: false, fetchedAt: recent }], 0, ["keepa"])).toBe("waiting");
    expect(priceStatus([{ provider: "keepa", ok: true, fetchedAt: recent }], 0, ["keepa", "ebay"])).toBe("waiting");
  });
  it("introuvable quand toutes les sources ont répondu sans prix", () => {
    expect(priceStatus([{ provider: "keepa", ok: true, fetchedAt: recent }], 0, ["keepa"])).toBe("notFound");
  });
  it("aucune source configurée", () => {
    expect(priceStatus([], 0, [])).toBe("noSource");
  });
});

describe("needsFetch", () => {
  it("vrai si une source n'a jamais répondu correctement", () => {
    expect(needsFetch([{ provider: "keepa", ok: false, fetchedAt: recent }], ["keepa"], 0)).toBe(true);
    expect(needsFetch([{ provider: "keepa", ok: true, fetchedAt: recent }], ["keepa"], 0)).toBe(false);
  });
  it("redemande une fois les réponses vides d'avant la recherche par titre", () => {
    expect(needsFetch([{ provider: "keepa", ok: true, fetchedAt: old }], ["keepa"], 0)).toBe(true);
    expect(needsFetch([{ provider: "keepa", ok: true, fetchedAt: old }], ["keepa"], 3)).toBe(false);
  });
});
