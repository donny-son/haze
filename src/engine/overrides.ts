// Applies per-keyframe per-slot palette overrides on top of the raw
// extracted keyframes. Pure function: (rawKeyframes, overrides) -> effective.
// Called once per render frame from App.tsx so user edits feed straight into
// the animator/renderer without rebuilding `memory`.

import type { Keyframe } from './animator';
import type { ColorOverride, PaletteOverrides } from '../state';
import { hexToRgb, rgbToOklab } from './color';

export function applyOverrides(
  keyframes: Keyframe[],
  overrides: PaletteOverrides,
): Keyframe[] {
  if (!overrides || Object.keys(overrides).length === 0) return keyframes;
  return keyframes.map((kf, k) => {
    const slots = overrides[k];
    if (!slots) return kf;
    const palette = kf.palette.map((entry, i) => {
      const ov = slots[i];
      if (!ov) return entry;
      let oklab = entry.oklab;
      let hex = entry.hex;
      if (ov.hex) {
        const [r, g, b] = hexToRgb(ov.hex);
        oklab = rgbToOklab(r, g, b);
        hex = ov.hex;
      }
      const weight = ov.weight ?? entry.weight;
      return { ...entry, oklab, hex, weight };
    });
    const anchors = kf.anchors.map((a, i) => {
      const ov = slots[i];
      if (!ov || (ov.x === undefined && ov.y === undefined)) return a;
      const x = ov.x ?? a.baseX;
      const y = ov.y ?? a.baseY;
      return { x, y, baseX: x, baseY: y };
    });
    return { ...kf, palette, anchors };
  });
}

/**
 * Immutably merge a slot override into the store. Pass `null` to clear that
 * slot entirely. Empty rows and empty keyframes prune themselves so the
 * "any overrides exist?" check is just `Object.keys(store).length > 0`.
 */
export function setOverride(
  store: PaletteOverrides,
  keyframe: number,
  slot: number,
  patch: ColorOverride | null,
): PaletteOverrides {
  const next: PaletteOverrides = { ...store };
  const kfSlots = { ...(next[keyframe] ?? {}) };
  if (patch === null) {
    delete kfSlots[slot];
  } else {
    const merged: ColorOverride = { ...(kfSlots[slot] ?? {}), ...patch };
    for (const key of Object.keys(merged) as (keyof ColorOverride)[]) {
      if (merged[key] === undefined) delete merged[key];
    }
    if (Object.keys(merged).length === 0) {
      delete kfSlots[slot];
    } else {
      kfSlots[slot] = merged;
    }
  }
  if (Object.keys(kfSlots).length === 0) {
    delete next[keyframe];
  } else {
    next[keyframe] = kfSlots;
  }
  return next;
}

export function hasAnyOverrides(store: PaletteOverrides): boolean {
  return Object.keys(store).length > 0;
}
