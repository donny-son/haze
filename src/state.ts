export interface Weights {
  bloom: number;
  mesh: number;
  noise: number;
}

export interface ColorOverride {
  hex?: string;
  weight?: number; // clamp >= 0.01 at apply time
  x?: number; // 0..1
  y?: number; // 0..1
}

// keyframe index -> slot index -> override
export type PaletteOverrides = Record<number, Record<number, ColorOverride>>;

export interface Settings {
  weights: Weights;
  paletteSize: 3 | 5 | 8;
  softness: number;
  grain: number;
  seed: number;
  matchSource: boolean;
  composition: number; // 0..1 lerp toward faithful
  resemblance: number; // 0..1 — how much of the source's shape survives the bloom
  paletteOverrides: PaletteOverrides;
}

export const DEFAULT_SETTINGS: Settings = {
  weights: { bloom: 0.45, mesh: 0.7, noise: 0.35 },
  paletteSize: 5,
  softness: 0.55,
  grain: 0.25,
  seed: 7,
  matchSource: false,
  composition: 0.5,
  resemblance: 0.35,
  paletteOverrides: {},
};

export interface ExportPreset {
  name: string;
  width: number;
  height: number;
  hint?: string;
}

export const EXPORT_PRESETS: ExportPreset[] = [
  { name: '4K desktop', width: 3840, height: 2160, hint: '16:9 wallpaper' },
  { name: 'Phone', width: 1290, height: 2796, hint: 'iPhone 15 Pro' },
  { name: 'Square', width: 2048, height: 2048 },
  { name: 'Preview', width: 1280, height: 720, hint: 'quick share' },
];
