import { describe, expect, it } from "vitest";
import {
  buildPaletteJson,
  stringifyPaletteJson,
} from "./paletteJson";
import type { Anchor } from "../composition";

const anchors: Anchor[] = [
  { color: { r: 255, g: 0, b: 0 }, weight: 0.5, x: 0.123456, y: 0.654321 },
  { color: { r: 0, g: 128, b: 255 }, weight: 0.25, x: 0.5, y: 0.5 },
];

describe("paletteJson: buildPaletteJson", () => {
  it("encodes anchors with hex, weight, x, y", () => {
    const j = buildPaletteJson(anchors, {
      now: () => new Date("2026-01-01T00:00:00Z"),
    });
    expect(j.version).toBe(1);
    expect(j.generator).toBe("haze");
    expect(j.generatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(j.palette).toEqual([
      { hex: "#ff0000", weight: 0.5, x: 0.1235, y: 0.6543 },
      { hex: "#0080ff", weight: 0.25, x: 0.5, y: 0.5 },
    ]);
  });

  it("includes seed and composition when provided", () => {
    const j = buildPaletteJson(anchors, {
      seed: 42,
      composition: 0.3,
      now: () => new Date("2026-01-01T00:00:00Z"),
    });
    expect(j.seed).toBe(42);
    expect(j.composition).toBe(0.3);
  });

  it("omits seed/composition when undefined", () => {
    const j = buildPaletteJson(anchors, {
      now: () => new Date("2026-01-01T00:00:00Z"),
    });
    expect(j.seed).toBeUndefined();
    expect(j.composition).toBeUndefined();
  });

  it("stringifies to valid JSON", () => {
    const j = buildPaletteJson(anchors, {
      now: () => new Date("2026-01-01T00:00:00Z"),
    });
    const text = stringifyPaletteJson(j);
    expect(() => JSON.parse(text)).not.toThrow();
    expect(JSON.parse(text)).toEqual(j);
  });
});
