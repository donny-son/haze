import type { Anchor } from '../composition';
import type { PaletteEntry } from '../palette';

export interface PaletteJsonEntry {
  hex: string;
  weight: number;
  x: number;
  y: number;
}

export function buildPaletteJson(
  palette: PaletteEntry[],
  anchors: Anchor[],
): PaletteJsonEntry[] {
  return palette.map((entry, i) => ({
    hex: entry.hex,
    weight: Number(entry.weight.toFixed(4)),
    x: Number((anchors[i]?.baseX ?? 0.5).toFixed(4)),
    y: Number((anchors[i]?.baseY ?? 0.5).toFixed(4)),
  }));
}

export function paletteJsonBlob(json: PaletteJsonEntry[]): Blob {
  return new Blob([JSON.stringify(json, null, 2)], {
    type: 'application/json',
  });
}
