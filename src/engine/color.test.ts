import { describe, expect, it } from "vitest";
import {
  hexToRgb,
  mixOklab,
  oklabToRgb,
  rgbToHex,
  rgbToOklab,
} from "./color";

const closeTo = (a: number, b: number, eps = 1): boolean => Math.abs(a - b) <= eps;

describe("color: rgbToOklab / oklabToRgb", () => {
  const samples = [
    { r: 0, g: 0, b: 0 },
    { r: 255, g: 255, b: 255 },
    { r: 255, g: 0, b: 0 },
    { r: 0, g: 255, b: 0 },
    { r: 0, g: 0, b: 255 },
    { r: 200, g: 120, b: 80 },
    { r: 30, g: 60, b: 200 },
    { r: 128, g: 128, b: 128 },
  ];

  it.each(samples)("round-trips %j within 1 unit", (rgb) => {
    const back = oklabToRgb(rgbToOklab(rgb));
    expect(closeTo(back.r, rgb.r)).toBe(true);
    expect(closeTo(back.g, rgb.g)).toBe(true);
    expect(closeTo(back.b, rgb.b)).toBe(true);
  });

  it("produces L≈0 for black and L≈1 for white", () => {
    const black = rgbToOklab({ r: 0, g: 0, b: 0 });
    const white = rgbToOklab({ r: 255, g: 255, b: 255 });
    expect(black.L).toBeCloseTo(0, 3);
    expect(white.L).toBeCloseTo(1, 2);
  });
});

describe("color: mixOklab", () => {
  it("returns c1 at t=0 and c2 at t=1", () => {
    const c1 = { r: 200, g: 30, b: 60 };
    const c2 = { r: 20, g: 200, b: 240 };
    const m0 = mixOklab(c1, c2, 0);
    const m1 = mixOklab(c1, c2, 1);
    expect(closeTo(m0.r, c1.r)).toBe(true);
    expect(closeTo(m0.g, c1.g)).toBe(true);
    expect(closeTo(m0.b, c1.b)).toBe(true);
    expect(closeTo(m1.r, c2.r)).toBe(true);
    expect(closeTo(m1.g, c2.g)).toBe(true);
    expect(closeTo(m1.b, c2.b)).toBe(true);
  });

  it("midpoint of blue + yellow does not yield muddy gray (key OKLab property)", () => {
    // sRGB averaging of blue and yellow gives gray; OKLab keeps a hue.
    const blue = { r: 0, g: 0, b: 255 };
    const yellow = { r: 255, g: 255, b: 0 };
    const mid = mixOklab(blue, yellow, 0.5);
    // Not all channels equal — keeps perceptual color information.
    const equalish = mid.r === mid.g && mid.g === mid.b;
    expect(equalish).toBe(false);
  });

  it("interpolates monotonically along L for grayscale", () => {
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 255, g: 255, b: 255 };
    const a = mixOklab(black, white, 0.25);
    const b = mixOklab(black, white, 0.5);
    const c = mixOklab(black, white, 0.75);
    expect(a.r).toBeLessThan(b.r);
    expect(b.r).toBeLessThan(c.r);
  });
});

describe("color: hex helpers", () => {
  it("parses #rrggbb", () => {
    expect(hexToRgb("#ff8040")).toEqual({ r: 255, g: 128, b: 64 });
  });
  it("parses #rgb shorthand", () => {
    expect(hexToRgb("#f84")).toEqual({ r: 255, g: 136, b: 68 });
  });
  it("round-trips through rgbToHex", () => {
    expect(rgbToHex({ r: 18, g: 52, b: 86 })).toBe("#123456");
  });
  it("throws on invalid hex", () => {
    expect(() => hexToRgb("nope")).toThrow();
  });
});
