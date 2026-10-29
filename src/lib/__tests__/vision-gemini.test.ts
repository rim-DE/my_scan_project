import { afterEach, describe, expect, it } from "vitest";
import { env } from "../env";
import { boxToCorners, DetectionResultSchema, GeminiDetectionResultSchema } from "../vision";
import { geminiSchema, parseGeminiJson } from "../vision-gemini";

describe("geminiSchema", () => {
  it("donne un JSON Schema sans $schema ni bornes ±2^53", () => {
    const s = JSON.stringify(geminiSchema(DetectionResultSchema));
    expect(s).not.toContain("$schema");
    expect(s).not.toContain("9007199254740991");
    expect(s).toContain('"corners"');
    expect(s).toContain('"type":["string","null"]');
  });
});

describe("rectangle Gemini", () => {
  it("demande box_2d au lieu des 4 coins", () => {
    const s = JSON.stringify(geminiSchema(GeminiDetectionResultSchema));
    expect(s).toContain('"box_2d"');
    expect(s).not.toContain('"corners"');
  });

  it("convertit [ymin, xmin, ymax, xmax] de 0-1000 en 4 coins en pixels, même dans le désordre", () => {
    const expected = [
      { x: 200, y: 200 },
      { x: 260, y: 200 },
      { x: 260, y: 1800 },
      { x: 200, y: 1800 },
    ];
    expect(boxToCorners([100, 200, 900, 260], 1000, 2000)).toEqual(expected);
    expect(boxToCorners([900, 260, 100, 200], 1000, 2000)).toEqual(expected);
    expect(boxToCorners([1, 2, 3], 1000, 2000)).toEqual([]);
  });
});

describe("parseGeminiJson", () => {
  const book = {
    shelf: 1,
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
    expect(parseGeminiJson(text, DetectionResultSchema).books[0].title).toBe("Bambous rustiques");
  });

  it("refuse une réponse qui ne suit pas le schéma", () => {
    expect(() => parseGeminiJson('{"books":[{"title":1}]}', DetectionResultSchema)).toThrow("illisible");
    expect(() => parseGeminiJson("pas du JSON", DetectionResultSchema)).toThrow("illisible");
  });
});

describe("env.visionProvider", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });
  const set = (vars: Record<string, string | undefined>) => {
    for (const k of ["VISION_PROVIDER", "GEMINI_API_KEY", "ANTHROPIC_API_KEY"]) delete process.env[k];
    Object.assign(process.env, vars);
  };

  it("Gemini par défaut", () => {
    set({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" });
    expect(env.visionProvider()).toBe("gemini");
    set({});
    expect(env.visionProvider()).toBe("gemini");
  });

  it("Claude si seule sa clé existe, ou si VISION_PROVIDER=claude", () => {
    set({ ANTHROPIC_API_KEY: "a" });
    expect(env.visionProvider()).toBe("claude");
    set({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a", VISION_PROVIDER: "Claude" });
    expect(env.visionProvider()).toBe("claude");
  });
});
