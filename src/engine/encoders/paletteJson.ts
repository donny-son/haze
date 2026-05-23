import { rgbToHex } from "../color";
import type { Anchor } from "../composition";

export type PaletteJsonEntry = {
  hex: string;
  weight: number;
  x: number;
  y: number;
};

export type PaletteJson = {
  version: 1;
  generator: "haze";
  generatedAt: string;
  seed?: number;
  composition?: number;
  palette: PaletteJsonEntry[];
};

export type PaletteJsonOptions = {
  seed?: number;
  composition?: number;
  now?: () => Date;
};

const round = (n: number, digits = 4): number => {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
};

export const buildPaletteJson = (
  anchors: Anchor[],
  options: PaletteJsonOptions = {},
): PaletteJson => {
  const now = (options.now ?? (() => new Date()))();
  const result: PaletteJson = {
    version: 1,
    generator: "haze",
    generatedAt: now.toISOString(),
    palette: anchors.map((a) => ({
      hex: rgbToHex(a.color),
      weight: round(a.weight, 4),
      x: round(a.x, 4),
      y: round(a.y, 4),
    })),
  };
  if (options.seed != null) result.seed = options.seed;
  if (options.composition != null) result.composition = options.composition;
  return result;
};

export const stringifyPaletteJson = (json: PaletteJson): string =>
  JSON.stringify(json, null, 2);
