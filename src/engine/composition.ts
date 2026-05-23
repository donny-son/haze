// Anchor placement. In free-floating mode anchors come from a Poisson-disk
// distribution (visually balanced, decoupled from source). In faithful mode
// they sit at each color's centroid in the source image. The composition
// slider lerps positions between the two.

import type { PaletteEntry } from './palette';

export interface Anchor {
  x: number; // 0..1
  y: number; // 0..1
  // baseX/baseY are the rendering positions BEFORE ambient breath is applied
  // — kept here so the animator can wiggle around a stable anchor.
  baseX: number;
  baseY: number;
}

/**
 * Bridson's Poisson-disk sampling on the unit square. Returns N points if
 * possible; will return fewer if the radius can't fit them.
 */
export function poissonDisk(
  n: number,
  seed: number,
  k = 30,
  marginPercent = 0.08,
): Array<{ x: number; y: number }> {
  const rng = mulberry32(seed);
  const margin = marginPercent;

  // Pick a radius so we expect roughly N points to fit. The square area
  // available is (1 - 2m)^2; a disc of radius r needs ~πr^2 area to
  // exclude. So r ≈ sqrt((1-2m)^2 / N) * something to space them out.
  const area = (1 - 2 * margin) * (1 - 2 * margin);
  const r = Math.sqrt(area / n) * 0.85;
  const cell = r / Math.SQRT2;
  const gridW = Math.ceil(1 / cell);
  const grid: Array<{ x: number; y: number } | null> = new Array(gridW * gridW).fill(null);
  const active: Array<{ x: number; y: number }> = [];
  const out: Array<{ x: number; y: number }> = [];

  const first = {
    x: margin + rng() * (1 - 2 * margin),
    y: margin + rng() * (1 - 2 * margin),
  };
  out.push(first);
  active.push(first);
  grid[Math.floor(first.y / cell) * gridW + Math.floor(first.x / cell)] = first;

  while (active.length > 0 && out.length < n) {
    const idx = Math.floor(rng() * active.length);
    const p = active[idx];
    let placed = false;
    for (let attempt = 0; attempt < k; attempt++) {
      const angle = rng() * Math.PI * 2;
      const dist = r + rng() * r;
      const nx = p.x + Math.cos(angle) * dist;
      const ny = p.y + Math.sin(angle) * dist;
      if (nx < margin || nx > 1 - margin || ny < margin || ny > 1 - margin) {
        continue;
      }
      const gx = Math.floor(nx / cell);
      const gy = Math.floor(ny / cell);
      let ok = true;
      for (let oy = -2; oy <= 2 && ok; oy++) {
        for (let ox = -2; ox <= 2 && ok; ox++) {
          const cx = gx + ox;
          const cy = gy + oy;
          if (cx < 0 || cx >= gridW || cy < 0 || cy >= gridW) continue;
          const other = grid[cy * gridW + cx];
          if (other) {
            const dx = other.x - nx;
            const dy = other.y - ny;
            if (dx * dx + dy * dy < r * r) ok = false;
          }
        }
      }
      if (ok) {
        const np = { x: nx, y: ny };
        out.push(np);
        active.push(np);
        grid[gy * gridW + gx] = np;
        placed = true;
        if (out.length >= n) break;
      }
    }
    if (!placed) {
      active.splice(idx, 1);
    }
  }

  // If we under-filled (radius too large) jitter random extras in.
  while (out.length < n) {
    out.push({
      x: margin + rng() * (1 - 2 * margin),
      y: margin + rng() * (1 - 2 * margin),
    });
  }
  return out.slice(0, n);
}

export function buildAnchors(
  palette: PaletteEntry[],
  composition: number, // 0 = free-floating, 1 = faithful
  seed: number,
): Anchor[] {
  const free = poissonDisk(palette.length, seed);
  // Sort the free anchors by reading order so colors fall in stable slots
  // when the seed changes — important for animation continuity.
  free.sort((a, b) => a.y - b.y || a.x - b.x);

  return palette.map((entry, i) => {
    const fx = free[i].x;
    const fy = free[i].y;
    const tx = entry.centroidX;
    const ty = entry.centroidY;
    const x = fx + (tx - fx) * composition;
    const y = fy + (ty - fy) * composition;
    return { x, y, baseX: x, baseY: y };
  });
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
