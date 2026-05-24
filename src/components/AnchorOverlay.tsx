// Draggable anchor handles. Used twice:
//   1. Overlaid on the live preview canvas in App.tsx (direct manipulation).
//   2. Inside the sidebar PaletteEditor as a small abstract map.
// Both share the same gesture and write to the same paletteOverrides store.

import { useRef, useState } from 'react';
import type { AnchorKind } from '../engine/palette';

interface Props {
  palette: { hex: string; kind: AnchorKind }[];
  positions: { x: number; y: number }[];
  onMove: (slot: number, x: number, y: number) => void;
  // Optional: when false, render only handles (no background). Use this when
  // the overlay sits on top of the rendered preview.
  background?: boolean;
  // Optional aspect ratio (width/height). Required when background is true so
  // the abstract map matches the preview's shape.
  aspect?: number;
}

export function AnchorOverlay({
  palette,
  positions,
  onMove,
  background = false,
  aspect,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<number | null>(null);

  const onPointerDown = (slot: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag(slot);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag === null || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onMove(drag, clamp01(x), clamp01(y));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (drag !== null) {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    }
    setDrag(null);
  };

  const wrapperClass = background
    ? 'relative w-full rounded border border-paper/10 bg-mist overflow-hidden select-none'
    : 'absolute inset-0 select-none';

  return (
    <div
      ref={ref}
      className={wrapperClass}
      style={background && aspect ? { aspectRatio: `${aspect}` } : undefined}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {positions.map((p, i) => {
        const entry = palette[i];
        const kind = entry?.kind ?? 'glow';
        const isSpike = kind === 'spike';
        return (
          <button
            type="button"
            key={i}
            onPointerDown={onPointerDown(i)}
            className={
              'absolute -ml-2.5 -mt-2.5 w-5 h-5 cursor-grab ' +
              (drag === i ? 'cursor-grabbing scale-110 ' : '') +
              (isSpike
                ? 'rotate-45 border-2 border-paper shadow-md'
                : 'rounded-full border-2 border-paper shadow-md')
            }
            style={{
              left: `${p.x * 100}%`,
              top: `${p.y * 100}%`,
              background: entry?.hex ?? '#888',
            }}
            title={`#${i + 1} · ${entry?.hex ?? ''} · ${kind}`}
          />
        );
      })}
    </div>
  );
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}
