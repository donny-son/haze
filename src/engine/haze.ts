// Top-level pure helpers for the haze engine.
// UI uses these to derive settings, anchors, and exports; the renderer
// consumes the resulting HazeState to draw frames.

import { buildAnchors, type Anchor, type PaletteEntry } from "./composition";

export type HazeSettings = {
  bloom: number;
  mesh: number;
  noise: number;
  matchSource: boolean;
  composition: number; // 0..1, only honored when matchSource is true
  paletteSize: 3 | 5 | 8;
  softness: number; // 0..1
  grain: number; // 0..1
  seed: number;
};

export const DEFAULT_SETTINGS: HazeSettings = {
  bloom: 0.55,
  mesh: 0.75,
  noise: 0.35,
  matchSource: false,
  composition: 0.6,
  paletteSize: 5,
  softness: 0.5,
  grain: 0.2,
  seed: 1337,
};

export const PALETTE_SIZES: ReadonlyArray<HazeSettings["paletteSize"]> = [
  3, 5, 8,
];

// Effective composition is 0 when matchSource is off — keeps free-floating
// purely free, even if the user previously dragged the slider.
export const effectiveComposition = (s: HazeSettings): number =>
  s.matchSource ? Math.max(0, Math.min(1, s.composition)) : 0;

export const anchorsFromPalette = (
  palette: PaletteEntry[],
  settings: HazeSettings,
): Anchor[] =>
  buildAnchors(palette, {
    seed: settings.seed,
    composition: effectiveComposition(settings),
  });

// Reroll: derive a fresh seed but keep the rest of the settings.
export const reroll = (s: HazeSettings, next: number): HazeSettings => ({
  ...s,
  seed: next,
});

export const clampPaletteSize = (
  n: number,
): HazeSettings["paletteSize"] => {
  if (n <= 3) return 3;
  if (n <= 5) return 5;
  return 8;
};

export const newSeed = (): number =>
  (Math.random() * 0x7fffffff) | 0 || 1;
