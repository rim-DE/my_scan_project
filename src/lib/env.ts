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

  /**
   * Modèle qui lit les photos. VISION_PROVIDER l'emporte ; sinon Gemini (le moins cher) dès que GEMINI_API_KEY existe,
   * sinon Claude si seule ANTHROPIC_API_KEY existe (un déploiement sans clé Gemini continue donc de marcher).
   */
  visionProvider: (): "gemini" | "claude" | "google-vision" => {
    const p = process.env.VISION_PROVIDER?.toLowerCase();
    if (p === "gemini" || p === "claude" || p === "google-vision") return p;
    return !process.env.GEMINI_API_KEY && process.env.ANTHROPIC_API_KEY ? "claude" : "gemini";
  },
  geminiApiKey: () => process.env.GEMINI_API_KEY,
  /** Google Cloud Vision (VISION_PROVIDER=google-vision) ; à défaut, la clé Google Books si l'API Vision y est autorisée. */
  googleVisionApiKey: () => process.env.GOOGLE_VISION_API_KEY || process.env.GOOGLE_BOOKS_API_KEY,
  geminiModel: () => process.env.GEMINI_MODEL || "gemini-3.8-flash",
  /** Recadrage des vignettes par un appel Gemini par livre (payant) : désactivé sauf REFINE_SPINES=true. */
  refineSpines: () => bool("REFINE_SPINES", false),
  /** Niveau de réflexion Gemini ("minimal", "low", "medium", "high") ; vide = réglage par défaut du modèle. */
  geminiThinking: () => process.env.GEMINI_THINKING || undefined,

  anthropicApiKey: () => process.env.ANTHROPIC_API_KEY,
  anthropicModel: () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
  /** Effort de réflexion pour la détection : "high" (précis, défaut), "medium" ou "low" (plus rapides). */
  anthropicEffort: (): "low" | "medium" | "high" => {
    const v = process.env.ANTHROPIC_EFFORT;
    return v === "low" || v === "medium" ? v : "high";
  },

  googleBooksApiKey: () => process.env.GOOGLE_BOOKS_API_KEY,

  /**
   * STORAGE_DRIVER l'emporte ; sinon Vercel Blob dès qu'un magasin est relié au projet, sinon disque local.
   * Vercel fournit soit BLOB_READ_WRITE_TOKEN (jeton), soit BLOB_STORE_ID (connexion OIDC, le SDK obtient le jeton tout seul).
   */
  storageDriver: (): "local" | "s3" | "blob" => {
    const d = process.env.STORAGE_DRIVER;
    if (d === "s3" || d === "blob" || d === "local") return d;
    return process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID ? "blob" : "local";
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

  // Calés sur BiblioScan : commission Amazon 15 % + 1,01 € TVA comprise, plus ~3 € d'envoi.
  resaleFeeRate: () => num("RESALE_FEE_RATE", 0.2),
  resaleFixedCostCents: () => num("RESALE_FIXED_COST_CENTS", 410),
  targetRoi: () => num("TARGET_ROI", 2),

  cronSecret: () => process.env.CRON_SECRET,
};
