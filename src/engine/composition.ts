// Anchor placement: free-floating, faithful (from source image), and lerp.

import { createRng, type Rng } from "./random";
import type { Rgb } from "./color";

export type Anchor = {
  color: Rgb;
  weight: number;
  x: number;
  y: number;
};

export type PaletteEntry = {
  color: Rgb;
  weight: number;
  // Optional faithful position derived from source image centroid (0..1).
  faithfulX?: number;
  faithfulY?: number;
};

// Poisson-ish placement via best-candidate sampling: pick from K candidates
// the one whose minimum distance to existing points is largest. Deterministic
// given the seed.
export const freeFloatingAnchors = (
  count: number,
  seed: number,
  margin = 0.1,
  candidates = 24,
): Array<{ x: number; y: number }> => {
  const rng = createRng(seed);
  const pts: Array<{ x: number; y: number }> = [];
  const lo = margin;
  const hi = 1 - margin;
  const span = hi - lo;

  for (let i = 0; i < count; i++) {
    if (pts.length === 0) {
      pts.push({ x: lo + rng() * span, y: lo + rng() * span });
      continue;
    }
    let best = { x: 0, y: 0 };
    let bestDist = -1;
    for (let k = 0; k < candidates; k++) {
      const cx = lo + rng() * span;
      const cy = lo + rng() * span;
      let minD = Infinity;
      for (const p of pts) {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const d = dx * dx + dy * dy;
        if (d < minD) minD = d;
      }
      if (minD > bestDist) {
        bestDist = minD;
        best = { x: cx, y: cy };
      }
    }
    pts.push(best);
  }
  return pts;
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export type CompositionOptions = {
  composition: number; // 0..1; 0 = free-floating, 1 = faithful
  seed: number;
  margin?: number;
};

// Build anchors from a palette. If composition > 0 and the entry has a
// faithfulX/Y, the position lerps from free-floating toward faithful.
export const buildAnchors = (
  palette: PaletteEntry[],
  options: CompositionOptions,
): Anchor[] => {
  const free = freeFloatingAnchors(
    palette.length,
    options.seed,
    options.margin ?? 0.1,
  );
  const t = Math.max(0, Math.min(1, options.composition));
  return palette.map((entry, i) => {
    const f = free[i] ?? { x: 0.5, y: 0.5 };
    const fx = entry.faithfulX;
    const fy = entry.faithfulY;
    const x = fx != null ? lerp(f.x, fx, t) : f.x;
    const y = fy != null ? lerp(f.y, fy, t) : f.y;
    return { color: entry.color, weight: entry.weight, x, y };
  });
};

// Helper used by ambient breath / future motion. Deterministic small drift.
export const breath = (rng: Rng, amplitude = 0.04): { dx: number; dy: number } => ({
  dx: (rng() * 2 - 1) * amplitude,
  dy: (rng() * 2 - 1) * amplitude,
});
