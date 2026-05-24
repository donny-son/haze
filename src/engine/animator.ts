// Animation drives anchor positions and palette OKLab values over time.
// Two motion sources, both running simultaneously when applicable:
//   1. Keyframed — from video samples (palette/anchor positions per keyframe)
//   2. Ambient breath — low-frequency wiggle on top, always on
//
// The animator is a pure function: (state, t) -> (palette, anchors). The
// renderer owns the GPU; the animator owns motion.

import type { Anchor } from './composition';
import type { OKLab } from './color';
import { mixOklab, rotateHueOklab } from './color';
import type { PaletteEntry } from './palette';

export interface Keyframe {
  t: number; // 0..1 normalized
  palette: PaletteEntry[];
  anchors: Anchor[];
}

export interface AnimationState {
  keyframes: Keyframe[];
  duration: number; // seconds
  breathAmplitude: number; // 0..1, scales position wiggle
  breathHueAmplitude: number; // radians, hue rotation magnitude
  loop: boolean;
}

/** Sample the animation at time `t` (seconds). Returns palette+anchors. */
export function sampleAnimation(
  state: AnimationState,
  t: number,
): { palette: PaletteEntry[]; anchors: Anchor[] } {
  const { keyframes, duration, breathAmplitude, breathHueAmplitude, loop } = state;
  const tn = duration > 0
    ? loop ? ((t % duration) + duration) % duration / duration
           : Math.min(1, Math.max(0, t / duration))
    : 0;

  let base: { palette: PaletteEntry[]; anchors: Anchor[] };
  if (keyframes.length === 0) {
    return { palette: [], anchors: [] };
  } else if (keyframes.length === 1) {
    base = { palette: keyframes[0].palette, anchors: keyframes[0].anchors };
  } else {
    // Find surrounding keyframes. If looping, wrap last->first.
    let i = 0;
    for (; i < keyframes.length - 1; i++) {
      if (tn < keyframes[i + 1].t) break;
    }
    const k0 = keyframes[i];
    const k1 = loop && i === keyframes.length - 1
      ? { ...keyframes[0], t: 1 }
      : keyframes[Math.min(i + 1, keyframes.length - 1)];
    const span = k1.t - k0.t;
    const local = span > 1e-6 ? (tn - k0.t) / span : 0;
    const eased = smoothstep(local);
    base = interpolateKeyframe(k0, k1, eased);
  }

  // Apply ambient breath. Low-frequency offsets per anchor; per-anchor
  // phase is taken from the anchor's base position so it's deterministic.
  const breathAnchors = base.anchors.map((a) => {
    const phaseX = a.baseX * 13.7 + a.baseY * 9.1;
    const phaseY = a.baseX * 5.3 + a.baseY * 11.9;
    const dx = Math.sin(t * 0.3 + phaseX) * 0.018 * breathAmplitude
             + Math.sin(t * 0.18 + phaseX * 1.7) * 0.012 * breathAmplitude;
    const dy = Math.cos(t * 0.27 + phaseY) * 0.018 * breathAmplitude
             + Math.cos(t * 0.21 + phaseY * 1.3) * 0.012 * breathAmplitude;
    return { ...a, x: a.baseX + dx, y: a.baseY + dy };
  });
  const breathPalette = base.palette.map((p, i) => {
    const phase = (i + 1) * 1.61803;
    const rot = Math.sin(t * 0.22 + phase) * breathHueAmplitude;
    const lab: OKLab = rotateHueOklab(p.oklab, rot);
    return { ...p, oklab: lab };
  });

  return { palette: breathPalette, anchors: breathAnchors };
}

function smoothstep(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

function interpolateKeyframe(
  a: Keyframe,
  b: Keyframe,
  t: number,
): { palette: PaletteEntry[]; anchors: Anchor[] } {
  const n = Math.min(a.palette.length, b.palette.length);
  const palette: PaletteEntry[] = [];
  const anchors: Anchor[] = [];
  for (let i = 0; i < n; i++) {
    const lab = mixOklab(a.palette[i].oklab, b.palette[i].oklab, t);
    palette.push({
      oklab: lab,
      hex: a.palette[i].hex,
      weight: a.palette[i].weight * (1 - t) + b.palette[i].weight * t,
      centroidX: a.palette[i].centroidX * (1 - t) + b.palette[i].centroidX * t,
      centroidY: a.palette[i].centroidY * (1 - t) + b.palette[i].centroidY * t,
      // Kind is discrete; hold the first frame's choice for the whole span.
      kind: a.palette[i].kind,
    });
    const ax = a.anchors[i] ?? { baseX: 0.5, baseY: 0.5, x: 0.5, y: 0.5 };
    const bx = b.anchors[i] ?? ax;
    const x = ax.baseX * (1 - t) + bx.baseX * t;
    const y = ax.baseY * (1 - t) + bx.baseY * t;
    anchors.push({ x, y, baseX: x, baseY: y });
  }
  return { palette, anchors };
}
