import { describe, expect, it } from "vitest";
import { needsFetch, priceStatus } from "../prices/status";

describe("priceStatus", () => {
  it("ok dès qu'il y a un prix", () => {
    expect(priceStatus([], 2, ["keepa"])).toBe("ok");
  });
  it("en attente tant qu'une source n'a pas répondu correctement", () => {
    expect(priceStatus([], 0, ["keepa"])).toBe("waiting");
    expect(priceStatus([{ provider: "keepa", ok: false }], 0, ["keepa"])).toBe("waiting");
    expect(priceStatus([{ provider: "keepa", ok: true }], 0, ["keepa", "ebay"])).toBe("waiting");
  });
  it("introuvable quand toutes les sources ont répondu sans prix", () => {
    expect(priceStatus([{ provider: "keepa", ok: true }], 0, ["keepa"])).toBe("notFound");
  });
  it("aucune source configurée", () => {
    expect(priceStatus([], 0, [])).toBe("noSource");
  });
});

describe("needsFetch", () => {
  it("vrai si une source n'a jamais répondu correctement", () => {
    expect(needsFetch([{ provider: "keepa", ok: false }], ["keepa"])).toBe(true);
    expect(needsFetch([{ provider: "keepa", ok: true }], ["keepa"])).toBe(false);
  });
});
