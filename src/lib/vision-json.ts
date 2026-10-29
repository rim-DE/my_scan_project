// Outils communs aux modèles de vision appelés en HTTP direct (Gemini, OpenRouter) : schéma JSON, lecture, réessais.
import { z } from "zod";

/** Gemini, Qwen et Gemma repèrent les positions de 0 à 1000 sur chaque axe de l'image (leur format d'entraînement). */
export const NORMALIZED_SCALE = 1000;

/**
 * Le schéma zod devient un JSON Schema que le modèle respecte (« sortie structurée »), puis la réponse est revérifiée
 * par zod : les modèles ignorent certaines contraintes (nombre d'éléments…), on ne se fie donc pas qu'à eux.
 */
export function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return stripSafeIntBounds(json) as Record<string, unknown>;
}

/** zod ajoute à z.int() les bornes ±2^53 : inutiles, et certains modèles refusent des nombres aussi grands. */
function stripSafeIntBounds(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripSafeIntBounds);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if ((k === "minimum" || k === "maximum") && Math.abs(v as number) === Number.MAX_SAFE_INTEGER) continue;
    out[k] = stripSafeIntBounds(v);
  }
  return out;
}

export function parseModelJson<T>(text: string, schema: z.ZodType<T>): T {
  // Par précaution, on enlève un éventuel bloc ```json … ``` autour de la réponse.
  const raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("Réponse du modèle illisible.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new Error("Réponse du modèle illisible.");
  return parsed.data;
}

const MAX_TRIES = 6;

/**
 * Les bandes d'une photo partent en parallèle : en cas de limite de débit (429, fréquente en formule gratuite)
 * ou de surcharge passagère (500/503), on réessaie avec une attente croissante.
 */
export async function fetchWithRetry(service: string, url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_TRIES) {
      const detail = await res.text().catch(() => "");
      if (res.status === 401 || /API key not valid/i.test(detail)) throw new Error(`La clé API ${service} n'est pas valide.`);
      if (res.status === 402) throw new Error(`Crédit ${service} épuisé : recharge le compte.`);
      if (res.status === 429) throw new Error(`Limite d'utilisation de ${service} atteinte : réessaie dans quelques minutes.`);
      throw new Error(`Erreur de l'API ${service} (${res.status}) : ${detail.slice(0, 300)}`);
    }
    await new Promise((r) => setTimeout(r, Math.min(30_000, 2000 * 2 ** (attempt - 1)) + Math.random() * 1000));
  }
}
