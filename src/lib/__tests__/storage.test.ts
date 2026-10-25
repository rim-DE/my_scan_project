import { afterEach, describe, expect, it, vi } from "vitest";

const blobs = new Map<string, { data: Buffer; access: string }>();
vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (key: string, data: Buffer, opts: { access: string }) => {
    blobs.set(key, { data, access: opts.access });
  }),
  get: vi.fn(async (key: string) => {
    const b = blobs.get(key);
    return b ? { statusCode: 200, stream: new Response(new Uint8Array(b.data)).body } : null;
  }),
  del: vi.fn(async (key: string) => {
    blobs.delete(key);
  }),
}));

import { env } from "../env";
import { getStorage } from "../storage";

describe("stockage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("choisit Vercel Blob quand Vercel fournit un jeton ou un identifiant de magasin, sauf si STORAGE_DRIVER l'impose", () => {
    vi.stubEnv("STORAGE_DRIVER", "");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("BLOB_STORE_ID", "");
    expect(env.storageDriver()).toBe("local");
    vi.stubEnv("BLOB_STORE_ID", "store_abc");
    expect(env.storageDriver()).toBe("blob");
    vi.stubEnv("BLOB_STORE_ID", "");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_x");
    expect(env.storageDriver()).toBe("blob");
    vi.stubEnv("STORAGE_DRIVER", "s3");
    expect(env.storageDriver()).toBe("s3");
  });

  it("enregistre, relit et supprime une photo dans un magasin Blob privé", async () => {
    vi.stubEnv("STORAGE_DRIVER", "blob");
    const storage = getStorage();
    await storage.put("scans/u/s/a.jpg", Buffer.from("photo"), "image/jpeg");
    expect(blobs.get("scans/u/s/a.jpg")?.access).toBe("private");
    expect((await storage.get("scans/u/s/a.jpg")).toString()).toBe("photo");
    await storage.delete("scans/u/s/a.jpg");
    await expect(storage.get("scans/u/s/a.jpg")).rejects.toThrow("introuvable");
  });
});
