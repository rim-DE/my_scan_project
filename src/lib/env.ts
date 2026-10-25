// Lecture centralisée des variables d'environnement (voir .env.example).

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1";
}

export const env = {
  get authSecret(): string {
    const s = process.env.AUTH_SECRET;
    if (!s || s.length < 32) {
      throw new Error("AUTH_SECRET manquant ou trop court (32 caractères minimum).");
    }
    return s;
  },
  allowRegistration: () => bool("ALLOW_REGISTRATION", false),
  initialCredits: () => num("INITIAL_CREDITS", 100),
  creditsPerPhoto: () => num("CREDITS_PER_PHOTO", 1),

  anthropicApiKey: () => process.env.ANTHROPIC_API_KEY,
  anthropicModel: () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5",

  googleBooksApiKey: () => process.env.GOOGLE_BOOKS_API_KEY,

  /** STORAGE_DRIVER l'emporte ; sinon Vercel Blob dès que Vercel fournit BLOB_READ_WRITE_TOKEN, sinon disque local. */
  storageDriver: (): "local" | "s3" | "blob" => {
    const d = process.env.STORAGE_DRIVER;
    if (d === "s3" || d === "blob" || d === "local") return d;
    return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local";
  },
  localUploadDir: () => process.env.LOCAL_UPLOAD_DIR || "./uploads",
  s3: () => ({
    bucket: process.env.S3_BUCKET || "",
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  }),

  priceCacheTtlHours: () => num("PRICE_CACHE_TTL_HOURS", 24),
  priceDemoMode: () => bool("PRICE_DEMO_MODE", false),
  ebayClientId: () => process.env.EBAY_CLIENT_ID,
  ebayClientSecret: () => process.env.EBAY_CLIENT_SECRET,
  keepaApiKey: () => process.env.KEEPA_API_KEY,

  resaleFeeRate: () => num("RESALE_FEE_RATE", 0.15),
  resaleFixedCostCents: () => num("RESALE_FIXED_COST_CENTS", 150),
  targetRoi: () => num("TARGET_ROI", 1),

  cronSecret: () => process.env.CRON_SECRET,
};
