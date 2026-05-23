// Best-effort CSS gradient generation from anchors.
// CSS gradients cannot reproduce a mesh exactly, so we approximate:
//  - linear: blend dominant anchors along the primary axis
//  - radial: stack one radial gradient per anchor, dominant last on top

import { rgbToHex, rgbaString } from "../color";
import type { Anchor } from "../composition";

export type CssGradientKind = "linear" | "radial";

export type CssGradientOptions = {
  kind?: CssGradientKind;
  radius?: number; // for radial layers, in % (e.g. 60)
  bgFallback?: string; // background-color fallback
};

const clamp = (n: number, lo: number, hi: number): number =>
  n < lo ? lo : n > hi ? hi : n;

const pct = (n: number, digits = 2): string => {
  const f = Math.pow(10, digits);
  return `${Math.round(n * 100 * f) / f}%`;
};

const sortByWeight = (anchors: Anchor[]): Anchor[] =>
  [...anchors].sort((a, b) => b.weight - a.weight);

export const linearGradientString = (anchors: Anchor[]): string => {
  if (anchors.length === 0) return "linear-gradient(180deg, #000, #000)";
  const sorted = sortByWeight(anchors);
  // Use the centroid spread to pick an angle: orient along longest axis.
  let xMin = 1;
  let xMax = 0;
  let yMin = 1;
  let yMax = 0;
  for (const a of sorted) {
    if (a.x < xMin) xMin = a.x;
    if (a.x > xMax) xMax = a.x;
    if (a.y < yMin) yMin = a.y;
    if (a.y > yMax) yMax = a.y;
  }
  const dx = xMax - xMin;
  const dy = yMax - yMin;
  const angle = dx >= dy ? 90 : 180;
  const projection = (a: Anchor): number => (angle === 90 ? a.x : a.y);
  const stops = [...sorted]
    .sort((a, b) => projection(a) - projection(b))
    .map((a) => `${rgbToHex(a.color)} ${pct(clamp(projection(a), 0, 1))}`);
  return `linear-gradient(${angle}deg, ${stops.join(", ")})`;
};

export const radialGradientString = (
  anchors: Anchor[],
  radius = 60,
): string => {
  if (anchors.length === 0) return "radial-gradient(circle, #000, #000)";
  // Build one radial-gradient layer per anchor, dominant first so weakest is
  // on top? CSS multi-backgrounds render first-listed on top, so we want the
  // strongest anchor LAST in the comma list... actually the first listed is
  // painted on top. Put strongest last so it sinks visually behind, no —
  // we want strongest visible. Put strongest first so it paints on top.
  const sorted = sortByWeight(anchors);
  const layers = sorted.map((a) => {
    const start = rgbaString(a.color, clamp(a.weight, 0.05, 1));
    const end = rgbaString(a.color, 0);
    return `radial-gradient(circle at ${pct(a.x)} ${pct(a.y)}, ${start} 0%, ${end} ${pct(clamp(radius / 100, 0.05, 1))})`;
  });
  return layers.join(", ");
};

export const cssGradientString = (
  anchors: Anchor[],
  options: CssGradientOptions = {},
): string => {
  const kind = options.kind ?? "radial";
  if (kind === "linear") return linearGradientString(anchors);
  return radialGradientString(anchors, options.radius ?? 60);
};

// Returns a CSS declaration block (one or more lines) the user can paste.
export const cssDeclaration = (
  anchors: Anchor[],
  options: CssGradientOptions = {},
): string => {
  const gradient = cssGradientString(anchors, options);
  const fallback = options.bgFallback ?? rgbToHex(anchors[0]?.color ?? { r: 0, g: 0, b: 0 });
  return `background-color: ${fallback};\nbackground-image: ${gradient};`;
};
