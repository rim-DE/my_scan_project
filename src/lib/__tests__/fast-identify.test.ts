import { afterEach, describe, expect, it, vi } from "vitest";
import { retryableDetections } from "../prices/fill";

describe("mode rapide", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("n'identifie pas en tâche de fond les livres hors liste", async () => {
    vi.stubEnv("PEPITES_ONLY", "true");
    await expect(retryableDetections("scan")).resolves.toEqual([]);
  });
});
