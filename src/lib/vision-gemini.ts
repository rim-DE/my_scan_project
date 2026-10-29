// Appel de l'API Gemini (Google AI Studio) pour la vision : image + consigne -> JSON qui suit un schéma zod.
// Appel HTTP direct (API generateContent) : pas de SDK supplémentaire à installer.
import { z } from "zod";
import { env } from "./env";

/** Gemini repère les positions de 0 à 1000 sur chaque axe de l'image (son format d'entraînement). */
export const GEMINI_SCALE = 1000;

const API = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_TRIES = 6;

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
}

/**
 * Le schéma zod devient un JSON Schema que Gemini respecte (« sortie structurée »), puis la réponse est revérifiée
 * par zod : Gemini ignore certaines contraintes (nombre d'éléments…), on ne se fie donc pas qu'à lui.
 */
export function geminiSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return stripSafeIntBounds(json) as Record<string, unknown>;
}

/** zod ajoute à z.int() les bornes ±2^53 : inutiles, et Gemini peut refuser des nombres aussi grands. */
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

/** Appel Gemini avec une image, ou texte seul (jpeg = null) : beaucoup moins cher, pour retrouver un livre d'après son titre. */
export async function callGemini<T>(jpeg: Buffer | null, prompt: string, schema: z.ZodType<T>): Promise<T> {
  const key = env.geminiApiKey();
  if (!key) throw new Error("GEMINI_API_KEY n'est pas configurée.");
  const thinking = env.geminiThinking();
  const body = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [...(jpeg ? [{ inlineData: { mimeType: "image/jpeg", data: jpeg.toString("base64") } }] : []), { text: prompt }],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: geminiSchema(schema),
      // Une étagère pleine peut contenir plus de 100 livres : on laisse de la place à la réponse.
      maxOutputTokens: 65536,
      ...(thinking ? { thinkingConfig: { thinkingLevel: thinking } } : {}),
    },
  });

  const res = await fetchWithRetry(`${API}/${encodeURIComponent(env.geminiModel())}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body,
  });
  const data = (await res.json()) as GeminiResponse;

  if (data.promptFeedback?.blockReason) throw new Error("L'analyse de la photo a été refusée par le modèle.");
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new Error("Trop de livres sur une seule photo : essaie de photographier moins d'étagères à la fois.");
  }
  if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT") {
    throw new Error("L'analyse de la photo a été refusée par le modèle.");
  }
  // Les morceaux marqués « thought » sont la réflexion du modèle, pas la réponse.
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought && p.text)
    .map((p) => p.text)
    .join("");
  return parseGeminiJson(text, schema);
}

export function parseGeminiJson<T>(text: string, schema: z.ZodType<T>): T {
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

/**
 * Les bandes d'une photo partent en parallèle : en cas de limite de débit (429, fréquente en formule gratuite)
 * ou de surcharge passagère (500/503), on réessaie avec une attente croissante.
 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_TRIES) {
      const detail = await res.text().catch(() => "");
      if (res.status === 400 && /API key not valid/i.test(detail)) throw new Error("GEMINI_API_KEY n'est pas valide.");
      if (res.status === 429) throw new Error("Limite d'utilisation de Gemini atteinte : réessaie dans quelques minutes.");
      throw new Error(`Erreur de l'API Gemini (${res.status}) : ${detail.slice(0, 300)}`);
    }
    await new Promise((r) => setTimeout(r, Math.min(30_000, 2000 * 2 ** (attempt - 1)) + Math.random() * 1000));
  }
}
