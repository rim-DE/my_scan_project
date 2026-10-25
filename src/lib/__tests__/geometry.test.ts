import { describe, expect, it } from "vitest";
import { boxToQuad, iou, normalizeQuad, orderAround, quadToBox, spineFrame, spineTransform, type Point } from "../geometry";

/** Applique la transformation canvas (a, b, c, d, e, f) à un point. */
const apply = (t: number[], p: Point): Point => ({ x: t[0] * p.x + t[2] * p.y + t[4], y: t[1] * p.x + t[3] * p.y + t[5] });

describe("géométrie", () => {
  it("remet les coins dans l'ordre, quel que soit l'ordre donné par le modèle", () => {
    const pts = orderAround([
      { x: 1, y: 1 },
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ]);
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]);
  });

  it("refuse les formes plates et borne les coins à la photo", () => {
    expect(normalizeQuad([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }], 100, 100)).toBeNull();
    const q = normalizeQuad([{ x: -10, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 150 }, { x: -10, y: 150 }], 100, 100)!;
    expect(quadToBox(q)).toEqual({ x: 0, y: 0, w: 0.5, h: 1 });
  });

  it("mesure le recouvrement de deux rectangles", () => {
    const a = { x: 0, y: 0, w: 0.2, h: 0.2 };
    expect(iou(a, a)).toBe(1);
    expect(iou(a, { x: 0.5, y: 0.5, w: 0.1, h: 0.1 })).toBe(0);
    expect(iou(a, { x: 0.1, y: 0, w: 0.2, h: 0.2 })).toBeCloseTo(1 / 3);
  });

  it("redresse une tranche verticale lue de bas en haut : le bas du livre arrive à gauche", () => {
    // Tranche de 20 × 100 px dans une photo de 100 × 200 px.
    const quad = boxToQuad({ x: 0.4, y: 0.25, w: 0.2, h: 0.5 });
    const f = spineFrame(quad, 100, 200, "bottom_to_top");
    expect(f.length).toBeCloseTo(100);
    expect(f.thickness).toBeCloseTo(20);
    const t = spineTransform(f);
    // Coin bas-gauche de la tranche -> en haut à gauche de la vignette ; coin haut-droit -> en bas à droite.
    const bl = apply(t, { x: 40, y: 150 });
    const tr = apply(t, { x: 60, y: 50 });
    expect(bl.x).toBeCloseTo(0);
    expect(bl.y).toBeCloseTo(0);
    expect(tr.x).toBeCloseTo(100);
    expect(tr.y).toBeCloseTo(20);
  });

  it("redresse une tranche penchée : sa longueur est conservée", () => {
    // Rectangle de 10 × 100 incliné de 30°.
    const a = Math.PI / 6;
    const u = { x: Math.sin(a), y: -Math.cos(a) };
    const v = { x: Math.cos(a), y: Math.sin(a) };
    const base = { x: 100, y: 200 };
    const pts = [
      base,
      { x: base.x + v.x * 10, y: base.y + v.y * 10 },
      { x: base.x + v.x * 10 + u.x * 100, y: base.y + v.y * 10 + u.y * 100 },
      { x: base.x + u.x * 100, y: base.y + u.y * 100 },
    ].map((p) => ({ x: p.x / 300, y: p.y / 300 }));
    const f = spineFrame(orderAround(pts), 300, 300, null);
    expect(f.length).toBeCloseTo(100);
    expect(f.thickness).toBeCloseTo(10);
    // Par défaut, une tranche verticale se lit de bas en haut : l'axe de lecture monte.
    expect(f.u.y).toBeLessThan(0);
  });

  it("une étiquette horizontale sur une tranche debout donne quand même une vignette dans le sens de la tranche", () => {
    const f = spineFrame(boxToQuad({ x: 0.4, y: 0.1, w: 0.1, h: 0.8 }), 100, 100, "left_to_right");
    expect(f.u.y).toBeCloseTo(-1);
    expect(f.length).toBeCloseTo(80);
    expect(f.thickness).toBeCloseTo(10);
  });

  it("un livre couché à l'envers est retourné", () => {
    const f = spineFrame(boxToQuad({ x: 0.1, y: 0.1, w: 0.5, h: 0.05 }), 100, 100, "right_to_left");
    expect(f.u.x).toBeCloseTo(-1);
    expect(f.d.y).toBeCloseTo(-1);
  });

  it("une tranche horizontale se lit de gauche à droite", () => {
    const f = spineFrame(boxToQuad({ x: 0.1, y: 0.1, w: 0.5, h: 0.05 }), 100, 100, null);
    expect(f.u.x).toBeCloseTo(1);
    expect(f.d.y).toBeCloseTo(1);
  });
});
