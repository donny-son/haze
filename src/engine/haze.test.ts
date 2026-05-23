import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  anchorsFromPalette,
  clampPaletteSize,
  effectiveComposition,
  reroll,
} from "./haze";
import type { PaletteEntry } from "./composition";

const palette: PaletteEntry[] = [
  { color: { r: 255, g: 0, b: 0 }, weight: 0.5, faithfulX: 0.2, faithfulY: 0.2 },
  { color: { r: 0, g: 255, b: 0 }, weight: 0.3, faithfulX: 0.8, faithfulY: 0.8 },
  { color: { r: 0, g: 0, b: 255 }, weight: 0.2, faithfulX: 0.5, faithfulY: 0.5 },
];

describe("haze: effectiveComposition", () => {
  it("returns 0 when matchSource is false", () => {
    const s = { ...DEFAULT_SETTINGS, matchSource: false, composition: 0.7 };
    expect(effectiveComposition(s)).toBe(0);
  });
  it("returns slider value when matchSource is true", () => {
    const s = { ...DEFAULT_SETTINGS, matchSource: true, composition: 0.7 };
    expect(effectiveComposition(s)).toBe(0.7);
  });
  it("clamps to [0,1]", () => {
    expect(
      effectiveComposition({
        ...DEFAULT_SETTINGS,
        matchSource: true,
        composition: 2,
      }),
    ).toBe(1);
    expect(
      effectiveComposition({
        ...DEFAULT_SETTINGS,
        matchSource: true,
        composition: -1,
      }),
    ).toBe(0);
  });
});

describe("haze: anchorsFromPalette", () => {
  it("is deterministic for the same settings", () => {
    const a = anchorsFromPalette(palette, DEFAULT_SETTINGS);
    const b = anchorsFromPalette(palette, DEFAULT_SETTINGS);
    expect(a).toEqual(b);
  });
  it("differs with a new seed", () => {
    const a = anchorsFromPalette(palette, DEFAULT_SETTINGS);
    const b = anchorsFromPalette(palette, reroll(DEFAULT_SETTINGS, 9999));
    expect(a).not.toEqual(b);
  });
  it("uses faithful coords when matchSource is on at composition=1", () => {
    const s = { ...DEFAULT_SETTINGS, matchSource: true, composition: 1 };
    const a = anchorsFromPalette(palette, s);
    expect(a[0]!.x).toBeCloseTo(0.2, 5);
    expect(a[1]!.x).toBeCloseTo(0.8, 5);
  });
});

describe("haze: clampPaletteSize", () => {
  it("snaps to 3/5/8", () => {
    expect(clampPaletteSize(1)).toBe(3);
    expect(clampPaletteSize(3)).toBe(3);
    expect(clampPaletteSize(4)).toBe(5);
    expect(clampPaletteSize(5)).toBe(5);
    expect(clampPaletteSize(7)).toBe(8);
    expect(clampPaletteSize(8)).toBe(8);
    expect(clampPaletteSize(20)).toBe(8);
  });
});
