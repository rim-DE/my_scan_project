// Appel d'OpenRouter pour la vision : une seule clé donne accès aux modèles open source (Qwen, Gemma…).
// API compatible OpenAI (chat/completions), appelée en HTTP direct : pas de SDK supplémentaire à installer.
import { z } from "zod";
import { env } from "./env";
import { fetchWithRetry, jsonSchemaFor, parseModelJson } from "./vision-json";

const API = "https://openrouter.ai/api/v1/chat/completions";

interface OpenRouterResponse {
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string | null }[];
  error?: { message?: string; code?: number };
}

export async function callOpenRouter<T>(jpeg: Buffer, prompt: string, schema: z.ZodType<T>): Promise<T> {
  const key = env.openRouterApiKey();
  if (!key) throw new Error("OPENROUTER_API_KEY n'est pas configurée.");
  const body = JSON.stringify({
    model: env.openRouterModel(),
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` } },
          { type: "text", text: prompt },
        ],
      },
    ],
    response_format: { type: "json_schema", json_schema: { name: "books", strict: true, schema: jsonSchemaFor(schema) } },
    // N'envoie la demande qu'aux hébergeurs qui savent respecter le schéma JSON.
    provider: { require_parameters: true },
    // Une étagère pleine peut contenir plus de 100 livres : on laisse de la place à la réponse.
    max_tokens: 32000,
  });

  const res = await fetchWithRetry("OpenRouter", API, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body,
  });
  const data = (await res.json()) as OpenRouterResponse;

  // OpenRouter peut répondre 200 avec une erreur de l'hébergeur dans le corps.
  if (data.error) throw new Error(`Erreur de l'API OpenRouter : ${data.error.message ?? "inconnue"}`);
  const choice = data.choices?.[0];
  if (choice?.finish_reason === "length") {
    throw new Error("Trop de livres sur une seule photo : essaie de photographier moins d'étagères à la fois.");
  }
  if (choice?.message?.refusal || choice?.finish_reason === "content_filter") {
    throw new Error("L'analyse de la photo a été refusée par le modèle.");
  }
  return parseModelJson(choice?.message?.content ?? "", schema);
}
