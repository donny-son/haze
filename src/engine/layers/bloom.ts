// Bloom: downsample the source image and apply a heavy gaussian blur.
// The result is uploaded as a texture and sampled by the renderer; its
// only job is to put a soft ghost of the source's color geography behind
// the mesh layer.
//
// Doing the blur on the CPU is fine because we run it on a ~96px-wide
// version of the source. Two separable passes, fixed radius.

export function buildBloom(
  source: ImageData,
  resemblance = 0,
): ImageData {
  // resemblance ∈ [0, 1] sweeps the bloom from "abstract ghost" to
  // "recognizable photo". Higher resemblance keeps more pixels and applies
  // a lighter blur, so the source's geometry survives.
  const r = Math.max(0, Math.min(1, resemblance));
  const targetWidth = Math.round(96 + (512 - 96) * r);
  const blurFrac = 0.125 + (0.02 - 0.125) * r;

  const scale = targetWidth / source.width;
  const w = Math.max(8, Math.round(source.width * scale));
  const h = Math.max(8, Math.round(source.height * scale));

  const down = downsample(source, w, h);
  const radius = Math.max(2, Math.round(Math.min(w, h) * blurFrac));
  const blurred = gaussianBlur(down, radius);
  return blurred;
}

function downsample(src: ImageData, dw: number, dh: number): ImageData {
  // Simple box average — good enough for the bloom prior; the final
  // gaussian smooths out any aliasing.
  const out = new ImageData(dw, dh);
  const { width: sw, height: sh, data: sd } = src;
  const od = out.data;
  for (let y = 0; y < dh; y++) {
    const sy0 = Math.floor((y / dh) * sh);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) / dh) * sh));
    for (let x = 0; x < dw; x++) {
      const sx0 = Math.floor((x / dw) * sw);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) / dw) * sw));
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * sw + sx) * 4;
          r += sd[i];
          g += sd[i + 1];
          b += sd[i + 2];
          n++;
        }
      }
      const o = (y * dw + x) * 4;
      od[o] = r / n;
      od[o + 1] = g / n;
      od[o + 2] = b / n;
      od[o + 3] = 255;
    }
  }
  return out;
}

function gaussianBlur(src: ImageData, radius: number): ImageData {
  const kernel = makeGaussianKernel(radius);
  const w = src.width;
  const h = src.height;
  const tmp = new Uint8ClampedArray(w * h * 4);
  const out = new ImageData(w, h);

  // Horizontal.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, wsum = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        const idx = (y * w + xx) * 4;
        const kw = kernel[k + radius];
        r += src.data[idx] * kw;
        g += src.data[idx + 1] * kw;
        b += src.data[idx + 2] * kw;
        wsum += kw;
      }
      const o = (y * w + x) * 4;
      tmp[o] = r / wsum;
      tmp[o + 1] = g / wsum;
      tmp[o + 2] = b / wsum;
      tmp[o + 3] = 255;
    }
  }

  // Vertical.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, wsum = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        const idx = (yy * w + x) * 4;
        const kw = kernel[k + radius];
        r += tmp[idx] * kw;
        g += tmp[idx + 1] * kw;
        b += tmp[idx + 2] * kw;
        wsum += kw;
      }
      const o = (y * w + x) * 4;
      out.data[o] = r / wsum;
      out.data[o + 1] = g / wsum;
      out.data[o + 2] = b / wsum;
      out.data[o + 3] = 255;
    }
  }
  return out;
}

function makeGaussianKernel(radius: number): number[] {
  const sigma = radius / 2;
  const kernel: number[] = [];
  for (let i = -radius; i <= radius; i++) {
    kernel.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  }
  return kernel;
}
