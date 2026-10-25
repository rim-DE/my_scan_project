// Worker en ligne de commande : traite les scans en attente en boucle.
// Utile si tu héberges l'appli sur un serveur classique (npm run worker).
import { processPendingScans } from "../src/lib/scan-processor";

async function main() {
  console.log("Worker démarré. Ctrl+C pour arrêter.");
  for (;;) {
    const n = await processPendingScans(5);
    if (n === 0) await new Promise((r) => setTimeout(r, 5000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
