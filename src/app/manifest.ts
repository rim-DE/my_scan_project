import type { MetadataRoute } from "next";

// Permet d'ajouter l'appli à l'écran d'accueil du téléphone, avec son icône, et de l'ouvrir en plein écran.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BiblioScan perso",
    short_name: "BiblioScan",
    description: "Scan de livres et estimation des prix de revente",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f3d3e",
    icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" }],
  };
}
