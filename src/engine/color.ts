// OKLab color space helpers.
// Reference: https://bottosson.github.io/posts/oklab/
// Smooth color blending in this product depends on these — sRGB averaging
// produces muddy midtones, so always blend in OKLab.

export type RGB = readonly [number, number, number];
export type OKLab = readonly [number, number, number];

const linearToSrgb = (v: number) =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;

const srgbToLinear = (v: number) =>
  v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

export function rgbToOklab(r: number, g: number, b: number): OKLab {
  const rl = srgbToLinear(r / 255);
  const gl = srgbToLinear(g / 255);
  const bl = srgbToLinear(b / 255);

  const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
  const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
  const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

export function oklabToRgb(L: number, a: number, b: number): RGB {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const rl = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gl = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return [
    Math.max(0, Math.min(255, Math.round(linearToSrgb(rl) * 255))),
    Math.max(0, Math.min(255, Math.round(linearToSrgb(gl) * 255))),
    Math.max(0, Math.min(255, Math.round(linearToSrgb(bl) * 255))),
  ];
}

export function mixOklab(a: OKLab, b: OKLab, t: number): OKLab {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

// Rotate hue in OKLab by an angle (radians). Hue in OKLab is the angle
// of (a, b); rotating preserves chroma and lightness.
export function rotateHueOklab(lab: OKLab, radians: number): OKLab {
  const [L, a, b] = lab;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [L, a * cos - b * sin, a * sin + b * cos];
}
