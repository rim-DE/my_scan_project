import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Le fichier de pépites est lu au moment des requêtes (src/lib/pepites-file.ts) : il doit partir avec les fonctions Vercel.
  outputFileTracingIncludes: { "/**/*": ["./data/pepites.csv"] },
};

export default nextConfig;
