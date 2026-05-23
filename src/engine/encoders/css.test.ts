import { describe, expect, it } from "vitest";
import {
  cssDeclaration,
  cssGradientString,
  linearGradientString,
  radialGradientString,
} from "./css";
import type { Anchor } from "../composition";

const anchors: Anchor[] = [
  { color: { r: 255, g: 0, b: 0 }, weight: 1, x: 0.2, y: 0.3 },
  { color: { r: 0, g: 128, b: 255 }, weight: 0.6, x: 0.8, y: 0.7 },
  { color: { r: 0, g: 200, b: 50 }, weight: 0.3, x: 0.5, y: 0.5 },
];

describe("css: radialGradientString", () => {
  it("emits one radial-gradient per anchor", () => {
    const css = radialGradientString(anchors);
    const matches = css.match(/radial-gradient\(/g) ?? [];
    expect(matches.length).toBe(anchors.length);
  });

  it("places anchors at percent coordinates", () => {
    const css = radialGradientString(anchors);
    expect(css).toContain("circle at 20% 30%");
    expect(css).toContain("circle at 80% 70%");
  });

  it("uses rgba with anchor color", () => {
    const css = radialGradientString(anchors);
    expect(css).toContain("rgba(255, 0, 0,");
    expect(css).toContain("rgba(0, 128, 255,");
  });

  it("handles empty anchors safely", () => {
    expect(radialGradientString([])).toContain("radial-gradient(");
  });
});

describe("css: linearGradientString", () => {
  it("emits a linear-gradient with angle and stops", () => {
    const css = linearGradientString(anchors);
    expect(css).toMatch(/^linear-gradient\(\d+deg, /);
    expect(css).toContain("#ff0000");
    expect(css).toContain("#0080ff");
  });

  it("orders stops along the chosen axis", () => {
    const horizontal: Anchor[] = [
      { color: { r: 255, g: 0, b: 0 }, weight: 1, x: 0.1, y: 0.5 },
      { color: { r: 0, g: 0, b: 255 }, weight: 1, x: 0.9, y: 0.5 },
    ];
    const css = linearGradientString(horizontal);
    const redIdx = css.indexOf("#ff0000");
    const blueIdx = css.indexOf("#0000ff");
    expect(redIdx).toBeGreaterThan(-1);
    expect(blueIdx).toBeGreaterThan(redIdx);
  });

  it("handles empty anchors safely", () => {
    expect(linearGradientString([])).toContain("linear-gradient(");
  });
});

describe("css: cssGradientString / cssDeclaration", () => {
  it("defaults to radial", () => {
    expect(cssGradientString(anchors)).toContain("radial-gradient");
  });
  it("can switch to linear", () => {
    expect(cssGradientString(anchors, { kind: "linear" })).toContain(
      "linear-gradient",
    );
  });
  it("declaration includes fallback background-color and image", () => {
    const decl = cssDeclaration(anchors);
    expect(decl).toContain("background-color:");
    expect(decl).toContain("background-image:");
  });
  it("declaration uses dominant anchor as fallback", () => {
    const decl = cssDeclaration(anchors);
    expect(decl).toContain("background-color: #ff0000");
  });
});
