// Appel de l'API Gemini (Google AI Studio) pour la vision : image + consigne -> JSON qui suit un schéma zod.
// Appel HTTP direct (API generateContent) : pas de SDK supplémentaire à installer.
import { z } from "zod";
import { env } from "./env";
import { fetchWithRetry, jsonSchemaFor, parseModelJson } from "./vision-json";

const API = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
}

export async function callGemini<T>(jpeg: Buffer, prompt: string, schema: z.ZodType<T>): Promise<T> {
  const key = env.geminiApiKey();
  if (!key) throw new Error("GEMINI_API_KEY n'est pas configurée.");
  const thinking = env.geminiThinking();
  const body = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [{ inlineData: { mimeType: "image/jpeg", data: jpeg.toString("base64") } }, { text: prompt }],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: jsonSchemaFor(schema),
      // Une étagère pleine peut contenir plus de 100 livres : on laisse de la place à la réponse.
      maxOutputTokens: 65536,
      ...(thinking ? { thinkingConfig: { thinkingLevel: thinking } } : {}),
    },
  });

  const res = await fetchWithRetry("Gemini", `${API}/${encodeURIComponent(env.geminiModel())}:generateContent`, {
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
  return parseModelJson(text, schema);
}
