import { describe, expect, it } from "vitest";
import { zoomArea, zoomBoxToPhoto } from "../refine";

describe("recadrage des vignettes", () => {
  it("élargit le zoom autour du livre sans sortir de la photo", () => {
    const a = zoomArea({ x: 0.05, y: 0.5, w: 0.02, h: 0.3 });
    expect(a.x).toBe(0);
    expect(a.y).toBeCloseTo(0.42);
    expect(a.x + a.w).toBeCloseTo(0.19);
    expect(a.y + a.h).toBeCloseTo(0.88);
  });

  it("ramène le rectangle du zoom (0-1000) dans la photo entière", () => {
    const b = zoomBoxToPhoto([100, 500, 900, 600], { x: 0.2, y: 0.4, w: 0.2, h: 0.5 })!;
    expect(b.x).toBeCloseTo(0.3);
    expect(b.w).toBeCloseTo(0.02);
    expect(b.y).toBeCloseTo(0.45);
    expect(b.h).toBeCloseTo(0.4);
  });

  it("refuse un rectangle vide ou mal formé", () => {
    expect(zoomBoxToPhoto([100, 500, 100, 600], { x: 0, y: 0, w: 1, h: 1 })).toBeNull();
    expect(zoomBoxToPhoto([1, 2, 3], { x: 0, y: 0, w: 1, h: 1 })).toBeNull();
  });
});
