// Applique les migrations de la base pendant le déploiement Vercel.
// - Seulement en production : les aperçus (PR) partagent la même base, ils ne doivent pas la modifier avant le merge.
// - Connexion directe à Neon (sans « pooler ») : le verrou de migration de Prisma ne passe pas par le pooler.
// - Jusqu'à 3 essais : quand Neon se réveille, la première connexion peut expirer.
import { spawnSync } from "node:child_process";

if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
  console.log(`[migrate] Déploiement « ${process.env.VERCEL_ENV} » : migrations ignorées (faites au déploiement de production).`);
  process.exit(0);
}

function directUrl() {
  const explicit = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING;
  if (explicit) return explicit;
  const url = process.env.DATABASE_URL;
  if (!url) return url;
  try {
    const u = new URL(url);
    // Neon : « ep-xxx-pooler.region.aws.neon.tech » → « ep-xxx.region.aws.neon.tech ».
    u.hostname = u.hostname.replace(/-pooler\./, ".");
    return u.toString();
  } catch {
    return url;
  }
}

const env = { ...process.env, DATABASE_URL: directUrl() };
for (let attempt = 1; attempt <= 3; attempt++) {
  const res = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env });
  if (res.status === 0) process.exit(0);
  if (attempt < 3) {
    console.log(`[migrate] Échec (essai ${attempt}/3), nouvel essai dans 10 s…`);
    await new Promise((r) => setTimeout(r, 10000));
  }
}
process.exit(1);
