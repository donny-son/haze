// Palette extraction via chroma-weighted k-means in OKLab.
// Plain k-means averages every pixel in a cluster, which pulls centroids
// toward whatever gray scaffolding dominates a photo and produces muddy,
// foggy palette entries. We instead bias the centroid recomputation by
// chroma so vivid pixels carry more pull, then pick a "vivid representative"
// per cluster (the chroma-weighted mean of its top-chroma quantile),
// tone-shape lightness, and gamut-safely boost chroma. The result is a
// palette of sharp accent colors that drives a colorful gradient.

import {
  type OKLab,
  oklabInSrgbGamut,
  oklabToRgb,
  rgbToOklab,
  rgbToHex,
} from './color';

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
  chroma: number;
  // Influence weight in centroid math. Saturated samples count for more so
  // a small splash of red isn't averaged away by the gray background.
  cw: number;
}

// Tunables. These were chosen so a typical "moody" photo (lots of dark
// near-gray + a few colorful regions) produces a palette where the
// colorful regions actually show up in the gradient.
const CHROMA_WEIGHT_GAMMA = 1.6;
const VIVID_TOP_QUANTILE = 0.35;
const L_FLOOR = 0.38;
const L_CEIL = 0.92;
const CHROMA_BOOST = 1.45;

/**
 * Reads pixels from an ImageBitmap or HTMLCanvasElement-backed source,
 * sub-samples them, runs chroma-weighted k-means in OKLab, returns sorted
 * palette entries.
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
      const chroma = Math.hypot(aa, bb);
      samples.push({
        L,
        a: aa,
        b: bb,
        x: x / Math.max(1, width - 1),
        y: y / Math.max(1, height - 1),
        chroma,
        // (chroma + ε)^γ keeps gray pixels informative but small.
        cw: Math.pow(chroma + 0.01, CHROMA_WEIGHT_GAMMA),
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

    // Chroma-weighted centroid recompute. Saturated samples pull harder,
    // so cluster centers drift toward vivid regions instead of the gray mean.
    const sums = centroids.map(() => [0, 0, 0, 0]); // L*w, a*w, b*w, w
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const c = assignments[i];
      const w = s.cw;
      sums[c][0] += s.L * w;
      sums[c][1] += s.a * w;
      sums[c][2] += s.b * w;
      sums[c][3] += w;
    }
    for (let c = 0; c < centroids.length; c++) {
      const w = sums[c][3];
      if (w > 0) {
        centroids[c] = [sums[c][0] / w, sums[c][1] / w, sums[c][2] / w];
      }
    }

    if (changed === 0) break;
  }

  // Group samples by cluster for the vivid-representative pass.
  const buckets: Sample[][] = centroids.map(() => []);
  for (let i = 0; i < samples.length; i++) {
    buckets[assignments[i]].push(samples[i]);
  }

  // Coverage weight uses chroma-weighted share of the image. This is what
  // makes a small splash of vivid color visible in the mesh instead of
  // being drowned out by a large gray background cluster.
  let totalChromaWeight = 0;
  for (const bucket of buckets) {
    for (const s of bucket) totalChromaWeight += s.cw;
  }
  if (totalChromaWeight <= 0) totalChromaWeight = 1;

  const final: PaletteEntry[] = centroids.map(() => ({
    oklab: [0, 0, 0] as OKLab,
    hex: '',
    weight: 0,
    centroidX: 0.5,
    centroidY: 0.5,
    kind: 'glow',
  }));

  for (let c = 0; c < centroids.length; c++) {
    const bucket = buckets[c];
    if (bucket.length === 0) continue;

    // Vivid representative: chroma-weighted average of the top quantile
    // by chroma. The cluster's most saturated pixels define its character;
    // the dim ones just tag along.
    const sorted = bucket.slice().sort((a, b) => b.chroma - a.chroma);
    const topN = Math.max(1, Math.ceil(sorted.length * VIVID_TOP_QUANTILE));
    let tL = 0, ta = 0, tb = 0, tw = 0, tx = 0, ty = 0;
    for (let i = 0; i < topN; i++) {
      const s = sorted[i];
      tL += s.L * s.cw;
      ta += s.a * s.cw;
      tb += s.b * s.cw;
      tx += s.x * s.cw;
      ty += s.y * s.cw;
      tw += s.cw;
    }
    if (tw <= 0) tw = 1;
    let L = tL / tw;
    let aLab = ta / tw;
    let bLab = tb / tw;

    // Tone shaping: pull pitch-dark entries up and washed highlights down
    // so the gradient sits in a useful, colorful range.
    if (L < L_FLOOR) L = L_FLOOR;
    else if (L > L_CEIL) L = L_CEIL;

    // Gamut-safe chroma boost. Push (a, b) outward; if the boosted color
    // leaves the sRGB cube, binary-search the largest factor that fits so
    // we get the maximum sharpness without clipping.
    [aLab, bLab] = gamutSafeBoost(L, aLab, bLab, CHROMA_BOOST);

    final[c].oklab = [L, aLab, bLab];
    final[c].centroidX = tx / tw;
    final[c].centroidY = ty / tw;

    let bucketW = 0;
    for (const s of bucket) bucketW += s.cw;
    final[c].weight = bucketW / totalChromaWeight;

    const [r, g, b] = oklabToRgb(L, aLab, bLab);
    final[c].hex = rgbToHex(r, g, b);
  }

  // Sort by descending weight so dominant colors come first.
  final.sort((a, b) => b.weight - a.weight);
  return final.filter((e) => e.weight > 0);
}

function gamutSafeBoost(
  L: number,
  a: number,
  b: number,
  factor: number,
): [number, number] {
  if (oklabInSrgbGamut(L, a * factor, b * factor)) {
    return [a * factor, b * factor];
  }
  // Anything in [1, factor] that fits — binary search keeps the highest
  // representable chroma rather than falling all the way back to the
  // original dull value.
  let lo = 1;
  let hi = factor;
  for (let i = 0; i < 14; i++) {
    const m = (lo + hi) / 2;
    if (oklabInSrgbGamut(L, a * m, b * m)) lo = m;
    else hi = m;
  }
  return [a * lo, b * lo];
}

function seedKmeansPP(samples: Sample[], k: number, seed: number): number[][] {
  const rng = mulberry32(seed);
  const centroids: number[][] = [];
  // Seed the first centroid biased by chroma so the algorithm starts from
  // an interesting accent color rather than a dim background sample.
  const first = pickChromaWeighted(samples, rng);
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
      // Chroma-weighted D^2 sampling: standard k-means++ but vivid samples
      // get extra probability mass, so subsequent seeds land on accent
      // colors rather than yet another gray.
      const w = best * s.cw;
      dists[i] = w;
      total += w;
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

function pickChromaWeighted(samples: Sample[], rng: () => number): number {
  let total = 0;
  for (const s of samples) total += s.cw;
  if (total <= 0) return Math.floor(rng() * samples.length);
  let r = rng() * total;
  for (let i = 0; i < samples.length; i++) {
    r -= samples[i].cw;
    if (r <= 0) return i;
  }
  return samples.length - 1;
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
