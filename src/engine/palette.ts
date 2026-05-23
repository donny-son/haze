// Lightweight palette extraction from an HTMLImageElement / ImageBitmap.
// Approach: downsample to a small canvas, bucket pixels in OKLab via a
// k-means-lite (a few iterations from a stratified seed). Cheap, deterministic
// for a given seed, and good enough for v1.

import { oklabToRgb, rgbToOklab, type Oklab } from "./color";
import { createRng } from "./random";
import type { PaletteEntry } from "./composition";

export type ExtractOptions = {
  size: 3 | 5 | 8;
  seed: number;
  // Downsample target — small for speed.
  sampleDim?: number;
  iterations?: number;
};

type Pixel = {
  L: number;
  a: number;
  b: number;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
};

const downsample = (
  source: CanvasImageSource,
  sampleDim: number,
): { data: Uint8ClampedArray; w: number; h: number } => {
  const w = sampleDim;
  const h = sampleDim;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas not available");
  ctx.drawImage(source, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
};

const distSq = (p: Pixel, c: Oklab): number => {
  const dL = p.L - c.L;
  const da = p.a - c.a;
  const db = p.b - c.b;
  return dL * dL + da * da + db * db;
};

export const extractPalette = (
  source: CanvasImageSource,
  options: ExtractOptions,
): PaletteEntry[] => {
  const sampleDim = options.sampleDim ?? 64;
  const iters = options.iterations ?? 6;
  const { data, w, h } = downsample(source, sampleDim);

  const pixels: Pixel[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const alpha = data[i + 3] ?? 0;
      if (alpha < 8) continue;
      const lab = rgbToOklab({
        r: data[i] ?? 0,
        g: data[i + 1] ?? 0,
        b: data[i + 2] ?? 0,
      });
      pixels.push({
        L: lab.L,
        a: lab.a,
        b: lab.b,
        x: x / Math.max(1, w - 1),
        y: y / Math.max(1, h - 1),
      });
    }
  }

  if (pixels.length === 0) {
    return [{ color: { r: 128, g: 128, b: 128 }, weight: 1 }];
  }

  // Seed centers: stratified pick across pixels.
  const rng = createRng(options.seed);
  const centers: Oklab[] = [];
  const k = options.size;
  for (let i = 0; i < k; i++) {
    const idx = Math.min(
      pixels.length - 1,
      Math.floor(((i + rng()) / k) * pixels.length),
    );
    const p = pixels[idx]!;
    centers.push({ L: p.L, a: p.a, b: p.b });
  }

  const assignments = new Int32Array(pixels.length);
  for (let iter = 0; iter < iters; iter++) {
    // Assign.
    for (let p = 0; p < pixels.length; p++) {
      const px = pixels[p]!;
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = distSq(px, centers[c]!);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assignments[p] = best;
    }
    // Update.
    const sums = Array.from({ length: k }, () => ({
      L: 0,
      a: 0,
      b: 0,
      n: 0,
    }));
    for (let p = 0; p < pixels.length; p++) {
      const c = assignments[p]!;
      const px = pixels[p]!;
      const s = sums[c]!;
      s.L += px.L;
      s.a += px.a;
      s.b += px.b;
      s.n += 1;
    }
    for (let c = 0; c < k; c++) {
      const s = sums[c]!;
      if (s.n === 0) {
        // Re-seed empty cluster from a random pixel.
        const p = pixels[Math.floor(rng() * pixels.length)]!;
        centers[c] = { L: p.L, a: p.a, b: p.b };
      } else {
        centers[c] = { L: s.L / s.n, a: s.a / s.n, b: s.b / s.n };
      }
    }
  }

  // Compute weights and faithful centroids per cluster.
  const stats = Array.from({ length: k }, () => ({
    n: 0,
    sx: 0,
    sy: 0,
  }));
  for (let p = 0; p < pixels.length; p++) {
    const c = assignments[p]!;
    const px = pixels[p]!;
    const s = stats[c]!;
    s.n += 1;
    s.sx += px.x;
    s.sy += px.y;
  }

  const total = pixels.length || 1;
  const entries: PaletteEntry[] = centers.map((c, i) => {
    const s = stats[i]!;
    const rgb = oklabToRgb(c);
    const entry: PaletteEntry = {
      color: rgb,
      weight: s.n / total,
    };
    if (s.n > 0) {
      entry.faithfulX = s.sx / s.n;
      entry.faithfulY = s.sy / s.n;
    }
    return entry;
  });

  // Sort by weight desc so the dominant color is index 0.
  entries.sort((a, b) => b.weight - a.weight);
  return entries;
};
