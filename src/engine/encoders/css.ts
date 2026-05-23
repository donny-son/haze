// Best-effort CSS gradient string derived from palette + anchor positions.
// Each anchor becomes a radial-gradient layer; we stack them on top of a
// solid base color (the most dominant palette entry). It's an
// approximation — the real renderer does soft Shepard interpolation in
// OKLab — but it's good enough to drop into a CSS background.

import type { Anchor } from '../composition';
import type { PaletteEntry } from '../palette';

export function buildCssGradient(
  palette: PaletteEntry[],
  anchors: Anchor[],
): string {
  if (palette.length === 0) return 'background: #000;';
  const base = palette[0].hex;
  const layers: string[] = [];
  for (let i = palette.length - 1; i >= 1; i--) {
    const p = palette[i];
    const a = anchors[i] ?? { baseX: 0.5, baseY: 0.5 };
    const x = (a.baseX * 100).toFixed(1);
    const y = (a.baseY * 100).toFixed(1);
    const radius = (35 + p.weight * 35).toFixed(1);
    layers.push(
      `radial-gradient(circle at ${x}% ${y}%, ${p.hex} 0%, ${p.hex}00 ${radius}%)`,
    );
  }
  return [
    'background-color: ' + base + ';',
    'background-image:',
    '  ' + layers.join(',\n  ') + ';',
    'background-blend-mode: screen;',
  ].join('\n');
}

export function cssBlob(css: string): Blob {
  return new Blob([css], { type: 'text/css' });
}
