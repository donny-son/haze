// Palette extraction via k-means in OKLab.
// The result is k palette entries with normalized weights (cluster size /
// total) and centroid pixel positions for the optional "match source
// composition" mode.

import { type OKLab, oklabToRgb, rgbToOklab, rgbToHex } from './color';

// 'glow' = soft radial blob blended into the mesh (default).
// 'spike' = sharp 4-point sparkle drawn additively on top of the mesh.
export type AnchorKind = 'glow' | 'spike';

export interface PaletteEntry {
  hex: string;
  oklab: OKLab;
  weight: number; // normalized 0..1
  // Normalized centroid of pixels assigned to this cluster (0..1).
  // Used by "match source composition" mode in src/engine/composition.ts.
  centroidX: number;
  centroidY: number;
  kind: AnchorKind;
}

interface Sample {
  L: number;
  a: number;
  b: number;
  x: number;
  y: number;
}

/**
 * Reads pixels from an ImageBitmap or HTMLCanvasElement-backed source,
 * sub-samples them, runs k-means in OKLab, returns sorted palette entries.
 */
export function extractPalette(
  imageData: ImageData,
  k: number,
  iterations = 8,
  seed = 1,
): PaletteEntry[] {
  const { width, height, data } = imageData;
  const samples: Sample[] = [];

  // Sample at most ~4000 pixels for speed, evenly spaced.
  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / 4000)));
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      if (a < 8) continue;
      const [L, aa, bb] = rgbToOklab(r, g, b);
      samples.push({
        L,
        a: aa,
        b: bb,
        x: x / Math.max(1, width - 1),
        y: y / Math.max(1, height - 1),
      });
    }
  }

  if (samples.length === 0) {
    return [];
  }

  const centroids = seedKmeansPP(samples, k, seed);
  const assignments = new Int32Array(samples.length);

  for (let it = 0; it < iterations; it++) {
    let changed = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const dL = s.L - centroids[c][0];
        const da = s.a - centroids[c][1];
        const db = s.b - centroids[c][2];
        const d = dL * dL + da * da + db * db;
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best;
        changed++;
      }
    }

    // Recompute centroids.
    const sums = centroids.map(() => [0, 0, 0, 0, 0, 0]); // L,a,b,x,y,count
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const c = assignments[i];
      sums[c][0] += s.L;
      sums[c][1] += s.a;
      sums[c][2] += s.b;
      sums[c][3] += s.x;
      sums[c][4] += s.y;
      sums[c][5] += 1;
    }
    for (let c = 0; c < centroids.length; c++) {
      const n = sums[c][5];
      if (n > 0) {
        centroids[c] = [sums[c][0] / n, sums[c][1] / n, sums[c][2] / n];
      }
    }

    if (changed === 0) break;
  }

  // Final pass: centroid positions + weights.
  const final: PaletteEntry[] = centroids.map((c) => ({
    oklab: [c[0], c[1], c[2]] as OKLab,
    hex: '',
    weight: 0,
    centroidX: 0,
    centroidY: 0,
    kind: 'glow',
  }));
  const counts = new Array(centroids.length).fill(0);
  const xs = new Array(centroids.length).fill(0);
  const ys = new Array(centroids.length).fill(0);
  for (let i = 0; i < samples.length; i++) {
    const c = assignments[i];
    counts[c]++;
    xs[c] += samples[i].x;
    ys[c] += samples[i].y;
  }
  const total = samples.length;
  for (let c = 0; c < centroids.length; c++) {
    const n = counts[c] || 1;
    final[c].centroidX = xs[c] / n;
    final[c].centroidY = ys[c] / n;
    final[c].weight = counts[c] / total;
    const [r, g, b] = oklabToRgb(...final[c].oklab);
    final[c].hex = rgbToHex(r, g, b);
  }

  // Sort by descending weight so dominant colors come first.
  final.sort((a, b) => b.weight - a.weight);
  return final.filter((e) => e.weight > 0);
}

function seedKmeansPP(samples: Sample[], k: number, seed: number): number[][] {
  const rng = mulberry32(seed);
  const centroids: number[][] = [];
  const first = Math.floor(rng() * samples.length);
  centroids.push([samples[first].L, samples[first].a, samples[first].b]);

  while (centroids.length < k) {
    const dists = new Float64Array(samples.length);
    let total = 0;
    for (let i = 0; i < samples.length; i++) {
      let best = Infinity;
      const s = samples[i];
      for (const c of centroids) {
        const dL = s.L - c[0];
        const da = s.a - c[1];
        const db = s.b - c[2];
        const d = dL * dL + da * da + db * db;
        if (d < best) best = d;
      }
      dists[i] = best;
      total += best;
    }
    if (total === 0) break;
    let r = rng() * total;
    let pick = 0;
    for (let i = 0; i < samples.length; i++) {
      r -= dists[i];
      if (r <= 0) {
        pick = i;
        break;
      }
    }
    centroids.push([samples[pick].L, samples[pick].a, samples[pick].b]);
  }
  return centroids;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
