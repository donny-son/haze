import { describe, expect, it } from "vitest";
import {
  buildAnchors,
  freeFloatingAnchors,
  type PaletteEntry,
} from "./composition";

describe("composition: freeFloatingAnchors", () => {
  it("is deterministic for the same seed", () => {
    const a = freeFloatingAnchors(5, 42);
    const b = freeFloatingAnchors(5, 42);
    expect(a).toEqual(b);
  });

  it("differs across seeds", () => {
    const a = freeFloatingAnchors(5, 1);
    const b = freeFloatingAnchors(5, 2);
    expect(a).not.toEqual(b);
  });

  it("places all points within the margin-respected box", () => {
    const margin = 0.1;
    const pts = freeFloatingAnchors(8, 7, margin);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(margin);
      expect(p.x).toBeLessThanOrEqual(1 - margin);
      expect(p.y).toBeGreaterThanOrEqual(margin);
      expect(p.y).toBeLessThanOrEqual(1 - margin);
    }
  });

  it("spreads points (no two points coincide)", () => {
    const pts = freeFloatingAnchors(6, 99);
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i]!;
        const b = pts[j]!;
        expect(a.x === b.x && a.y === b.y).toBe(false);
      }
    }
  });

  it("returns the requested count", () => {
    expect(freeFloatingAnchors(0, 1).length).toBe(0);
    expect(freeFloatingAnchors(3, 1).length).toBe(3);
    expect(freeFloatingAnchors(12, 1).length).toBe(12);
  });
});

describe("composition: buildAnchors", () => {
  const palette: PaletteEntry[] = [
    { color: { r: 255, g: 0, b: 0 }, weight: 1, faithfulX: 0.2, faithfulY: 0.3 },
    { color: { r: 0, g: 255, b: 0 }, weight: 1, faithfulX: 0.8, faithfulY: 0.7 },
    { color: { r: 0, g: 0, b: 255 }, weight: 1, faithfulX: 0.5, faithfulY: 0.5 },
  ];

  it("at composition=0 ignores faithful positions", () => {
    const a = buildAnchors(palette, { composition: 0, seed: 7 });
    const free = freeFloatingAnchors(palette.length, 7);
    a.forEach((anchor, i) => {
      const f = free[i]!;
      expect(anchor.x).toBeCloseTo(f.x, 5);
      expect(anchor.y).toBeCloseTo(f.y, 5);
    });
  });

  it("at composition=1 returns faithful positions exactly", () => {
    const a = buildAnchors(palette, { composition: 1, seed: 7 });
    expect(a[0]!.x).toBeCloseTo(0.2, 5);
    expect(a[0]!.y).toBeCloseTo(0.3, 5);
    expect(a[1]!.x).toBeCloseTo(0.8, 5);
    expect(a[2]!.y).toBeCloseTo(0.5, 5);
  });

  it("at composition=0.5 lerps midway", () => {
    const free = freeFloatingAnchors(palette.length, 7);
    const half = buildAnchors(palette, { composition: 0.5, seed: 7 });
    half.forEach((anchor, i) => {
      const entry = palette[i]!;
      const f = free[i]!;
      const expectedX = (f.x + entry.faithfulX!) / 2;
      const expectedY = (f.y + entry.faithfulY!) / 2;
      expect(anchor.x).toBeCloseTo(expectedX, 5);
      expect(anchor.y).toBeCloseTo(expectedY, 5);
    });
  });

  it("preserves color and weight from palette", () => {
    const a = buildAnchors(palette, { composition: 0.5, seed: 1 });
    a.forEach((anchor, i) => {
      expect(anchor.color).toEqual(palette[i]!.color);
      expect(anchor.weight).toBe(palette[i]!.weight);
    });
  });

  it("falls back to free-floating when faithful coords are missing", () => {
    const bare: PaletteEntry[] = palette.map((p) => ({
      color: p.color,
      weight: p.weight,
    }));
    const a = buildAnchors(bare, { composition: 1, seed: 7 });
    const free = freeFloatingAnchors(bare.length, 7);
    a.forEach((anchor, i) => {
      const f = free[i]!;
      expect(anchor.x).toBeCloseTo(f.x, 5);
      expect(anchor.y).toBeCloseTo(f.y, 5);
    });
  });
});
