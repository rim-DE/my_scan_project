import { afterEach, describe, expect, it } from "vitest";
import { env } from "../env";
import { DetectionResultSchema } from "../vision";
import { jsonSchemaFor, parseModelJson } from "../vision-json";

describe("jsonSchemaFor", () => {
  it("donne un JSON Schema sans $schema ni bornes ±2^53", () => {
    const s = JSON.stringify(jsonSchemaFor(DetectionResultSchema));
    expect(s).not.toContain("$schema");
    expect(s).not.toContain("9007199254740991");
    expect(s).toContain('"corners"');
    expect(s).toContain('"type":["string","null"]');
  });
});

describe("parseModelJson", () => {
  const book = {
    title: "Bambous rustiques",
    author: null,
    publisher: null,
    isbn: null,
    corners: [
      { x: 10, y: 20 },
      { x: 30, y: 20 },
      { x: 30, y: 900 },
      { x: 10, y: 900 },
    ],
    text_direction: "bottom_to_top",
    confidence: "high",
  };

  it("lit la réponse, même entourée d'un bloc ```json", () => {
    const text = "```json\n" + JSON.stringify({ books: [book] }) + "\n```";
    expect(parseModelJson(text, DetectionResultSchema).books[0].title).toBe("Bambous rustiques");
  });

  it("refuse une réponse qui ne suit pas le schéma", () => {
    expect(() => parseModelJson('{"books":[{"title":1}]}', DetectionResultSchema)).toThrow("illisible");
    expect(() => parseModelJson("pas du JSON", DetectionResultSchema)).toThrow("illisible");
  });
});

describe("env.visionProvider", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });
  const set = (vars: Record<string, string | undefined>) => {
    for (const k of ["VISION_PROVIDER", "GEMINI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY"]) delete process.env[k];
    Object.assign(process.env, vars);
  };

  it("Gemini par défaut", () => {
    set({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" });
    expect(env.visionProvider()).toBe("gemini");
    set({});
    expect(env.visionProvider()).toBe("gemini");
  });

  it("OpenRouter seulement si VISION_PROVIDER=openrouter", () => {
    set({ GEMINI_API_KEY: "g", OPENROUTER_API_KEY: "o", VISION_PROVIDER: " OpenRouter" });
    expect(env.visionProvider()).toBe("openrouter");
    set({ OPENROUTER_API_KEY: "o" });
    expect(env.visionProvider()).toBe("gemini");
  });

  it("Claude si seule sa clé existe, ou si VISION_PROVIDER=claude", () => {
    set({ ANTHROPIC_API_KEY: "a" });
    expect(env.visionProvider()).toBe("claude");
    set({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a", VISION_PROVIDER: "Claude" });
    expect(env.visionProvider()).toBe("claude");
  });
});
