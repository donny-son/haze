// Canvas 2D renderer for haze (v0).
//
// Pipeline:
//   1. Bloom: downsample source, heavy blur, upscale, weighted into canvas.
//   2. Mesh: layered radial gradients per anchor, blended additively.
//   3. Noise: deterministic value noise modulating lightness/hue subtly.
//   4. Grain: small fine-grain additive noise.
//
// Structured so the GPU implementation can drop in later; the public API
// is `renderHaze(canvas, source, anchors, settings)`.

import { mixOklab, oklabToRgb, rgbToOklab, type Rgb } from "./color";
import type { Anchor } from "./composition";
import type { HazeSettings } from "./haze";
import { createRng } from "./random";

export type RenderInput = {
  source?: CanvasImageSource | null;
  width: number;
  height: number;
  anchors: Anchor[];
  settings: HazeSettings;
};

const ensureCtx = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  return ctx;
};

const drawBloom = (
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  softness: number,
  weight: number,
): void => {
  if (weight <= 0) return;
  // Downsample to a small canvas, then upscale with heavy blur on the dest.
  const small = document.createElement("canvas");
  const target = Math.max(16, Math.round(64 + softness * 96));
  small.width = target;
  small.height = target;
  const sctx = small.getContext("2d");
  if (!sctx) return;
  sctx.drawImage(source, 0, 0, target, target);

  const blurPx = Math.round(24 + softness * 96);
  ctx.save();
  ctx.globalAlpha = weight;
  ctx.globalCompositeOperation = "source-over";
  // CSS-style filter — supported on canvas in modern browsers.
  // Fallback handled by simply drawing without blur if unsupported.
  try {
    ctx.filter = `blur(${blurPx}px) saturate(115%)`;
  } catch {
    ctx.filter = "none";
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Draw slightly oversized so blur doesn't reveal hard edges.
  const oversize = 1.1;
  const w = width * oversize;
  const h = height * oversize;
  ctx.drawImage(small, (width - w) / 2, (height - h) / 2, w, h);
  ctx.filter = "none";
  ctx.restore();
};

const drawMesh = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  anchors: Anchor[],
  softness: number,
  weight: number,
): void => {
  if (weight <= 0 || anchors.length === 0) return;
  ctx.save();
  ctx.globalAlpha = weight;
  ctx.globalCompositeOperation = "lighter";

  // Radius scales with softness and palette size.
  const base = Math.max(width, height);
  const radius = base * (0.45 + 0.45 * softness);

  for (const a of anchors) {
    const cx = a.x * width;
    const cy = a.y * height;
    const r = radius * (0.55 + 0.55 * a.weight);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const inner = `rgba(${a.color.r}, ${a.color.g}, ${a.color.b}, ${0.55 * Math.min(1, a.weight * 2 + 0.3)})`;
    const mid = `rgba(${a.color.r}, ${a.color.g}, ${a.color.b}, 0.18)`;
    const outer = `rgba(${a.color.r}, ${a.color.g}, ${a.color.b}, 0)`;
    grad.addColorStop(0, inner);
    grad.addColorStop(0.5, mid);
    grad.addColorStop(1, outer);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();
};

// Cheap 2D value noise, deterministic given seed.
const valueNoise = (
  width: number,
  height: number,
  cell: number,
  seed: number,
): ImageData => {
  const cols = Math.ceil(width / cell) + 2;
  const rows = Math.ceil(height / cell) + 2;
  const rng = createRng(seed);
  const grid = new Float32Array(cols * rows);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();

  const smooth = (t: number): number => t * t * (3 - 2 * t);
  const at = (cx: number, ry: number): number => {
    const c = ((cx % cols) + cols) % cols;
    const r = ((ry % rows) + rows) % rows;
    return grid[r * cols + c] ?? 0;
  };

  const out = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    const gy = y / cell;
    const ry = Math.floor(gy);
    const fy = smooth(gy - ry);
    for (let x = 0; x < width; x++) {
      const gx = x / cell;
      const cx = Math.floor(gx);
      const fx = smooth(gx - cx);
      const v00 = at(cx, ry);
      const v10 = at(cx + 1, ry);
      const v01 = at(cx, ry + 1);
      const v11 = at(cx + 1, ry + 1);
      const top = v00 + (v10 - v00) * fx;
      const bot = v01 + (v11 - v01) * fx;
      const v = top + (bot - top) * fy;
      const idx = (y * width + x) * 4;
      const c = Math.round(v * 255);
      out.data[idx] = c;
      out.data[idx + 1] = c;
      out.data[idx + 2] = c;
      out.data[idx + 3] = 255;
    }
  }
  return out;
};

const drawNoise = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  softness: number,
  seed: number,
  weight: number,
): void => {
  if (weight <= 0) return;
  // Larger cell = smoother atmospheric drift.
  const cell = Math.max(24, Math.round(48 + softness * 96));
  const noise = valueNoise(width, height, cell, seed);

  // Tint noise toward a soft warm/cool by sampling existing pixel and
  // shifting lightness in OKLab.
  const target = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < target.data.length; i += 4) {
    const n = ((noise.data[i] ?? 128) / 255 - 0.5) * 2; // -1..1
    const rgb: Rgb = {
      r: target.data[i] ?? 0,
      g: target.data[i + 1] ?? 0,
      b: target.data[i + 2] ?? 0,
    };
    const lab = rgbToOklab(rgb);
    const shifted = oklabToRgb({
      L: Math.max(0, Math.min(1, lab.L + n * 0.06 * weight)),
      a: lab.a + n * 0.012 * weight,
      b: lab.b + n * 0.012 * weight,
    });
    target.data[i] = shifted.r;
    target.data[i + 1] = shifted.g;
    target.data[i + 2] = shifted.b;
  }
  ctx.putImageData(target, 0, 0);
};

const drawGrain = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  seed: number,
  weight: number,
): void => {
  if (weight <= 0) return;
  const rng = createRng(seed ^ 0x9e3779b9);
  const img = ctx.getImageData(0, 0, width, height);
  const amp = 24 * weight;
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rng() - 0.5) * amp;
    img.data[i] = Math.max(0, Math.min(255, (img.data[i] ?? 0) + n));
    img.data[i + 1] = Math.max(0, Math.min(255, (img.data[i + 1] ?? 0) + n));
    img.data[i + 2] = Math.max(0, Math.min(255, (img.data[i + 2] ?? 0) + n));
  }
  ctx.putImageData(img, 0, 0);
};

const fillBackground = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  anchors: Anchor[],
): void => {
  // Average the top two anchors in OKLab as a sensible base color.
  let base: Rgb = { r: 18, g: 18, b: 24 };
  if (anchors.length >= 2) {
    base = mixOklab(anchors[0]!.color, anchors[1]!.color, 0.5);
  } else if (anchors.length === 1) {
    base = anchors[0]!.color;
  }
  ctx.fillStyle = `rgb(${base.r}, ${base.g}, ${base.b})`;
  ctx.fillRect(0, 0, width, height);
};

export const renderHaze = (
  canvas: HTMLCanvasElement,
  input: RenderInput,
): void => {
  const { width, height, anchors, settings, source } = input;
  canvas.width = width;
  canvas.height = height;
  const ctx = ensureCtx(canvas);
  ctx.clearRect(0, 0, width, height);

  fillBackground(ctx, width, height, anchors);

  if (source && settings.bloom > 0) {
    drawBloom(ctx, source, width, height, settings.softness, settings.bloom);
  }

  drawMesh(ctx, width, height, anchors, settings.softness, settings.mesh);

  if (settings.noise > 0) {
    drawNoise(ctx, width, height, settings.softness, settings.seed, settings.noise);
  }

  if (settings.grain > 0) {
    drawGrain(ctx, width, height, settings.seed, settings.grain);
  }
};
