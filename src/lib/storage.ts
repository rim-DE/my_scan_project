// Stockage des photos : disque local en développement ; Vercel Blob ou S3 (ou compatible : R2, Scaleway, MinIO…) en production.
import { promises as fs } from "fs";
import path from "path";
import { del, get, put } from "@vercel/blob";
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";

export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

function safeLocalPath(key: string): string {
  const root = path.resolve(env.localUploadDir());
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Clé de stockage invalide");
  return full;
}

const localStorage: Storage = {
  async put(key, data) {
    const p = safeLocalPath(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, data);
  },
  async get(key) {
    return fs.readFile(safeLocalPath(key));
  },
  async delete(key) {
    await fs.rm(safeLocalPath(key), { force: true });
  },
};

let s3Client: S3Client | null = null;
function s3(): S3Client {
  if (!s3Client) {
    const c = env.s3();
    s3Client = new S3Client({
      region: c.region,
      endpoint: c.endpoint,
      forcePathStyle: Boolean(c.endpoint),
      credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    });
  }
  return s3Client;
}

const s3Storage: Storage = {
  async put(key, data, contentType) {
    await s3().send(new PutObjectCommand({ Bucket: env.s3().bucket, Key: key, Body: data, ContentType: contentType }));
  },
  async get(key) {
    const res = await s3().send(new GetObjectCommand({ Bucket: env.s3().bucket, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  },
  async delete(key) {
    await s3().send(new DeleteObjectCommand({ Bucket: env.s3().bucket, Key: key }));
  },
};

// Magasin privé : les photos ne sont lisibles qu'à travers l'appli (route /api/photos/[id]).
const blobStorage: Storage = {
  async put(key, data, contentType) {
    await put(key, data, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true });
  },
  async get(key) {
    const res = await get(key, { access: "private" });
    if (!res || res.statusCode !== 200) throw new Error(`Photo introuvable : ${key}`);
    return Buffer.from(await new Response(res.stream).arrayBuffer());
  },
  async delete(key) {
    await del(key);
  },
};

export function getStorage(): Storage {
  const driver = env.storageDriver();
  return driver === "s3" ? s3Storage : driver === "blob" ? blobStorage : localStorage;
}
