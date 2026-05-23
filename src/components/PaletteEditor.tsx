import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Keyframe } from '../engine/animator';
import type { ColorOverride, PaletteOverrides } from '../state';
import { applyOverrides, hasAnyOverrides, setOverride } from '../engine/overrides';

interface Props {
  rawKeyframes: Keyframe[];
  overrides: PaletteOverrides;
  onChangeOverrides: (next: PaletteOverrides) => void;
  isVideo: boolean;
  editingKeyframe: number;
  onChangeEditingKeyframe: (k: number) => void;
  previewAspect: number; // width / height of the preview canvas
}

export function PaletteEditor({
  rawKeyframes,
  overrides,
  onChangeOverrides,
  isVideo,
  editingKeyframe,
  onChangeEditingKeyframe,
  previewAspect,
}: Props) {
  // The editor always operates on the raw keyframe, then we render the
  // effective values (raw + overrides) so the user sees what they've set.
  const effective = useMemo(
    () => applyOverrides(rawKeyframes, overrides),
    [rawKeyframes, overrides],
  );
  const kfIdx = Math.max(0, Math.min(editingKeyframe, rawKeyframes.length - 1));
  const kf = effective[kfIdx];
  const slotOverrides = overrides[kfIdx] ?? {};

  const patchSlot = useCallback(
    (slot: number, patch: ColorOverride | null) => {
      onChangeOverrides(setOverride(overrides, kfIdx, slot, patch));
    },
    [overrides, kfIdx, onChangeOverrides],
  );

  const resetAll = useCallback(
    () => onChangeOverrides({}),
    [onChangeOverrides],
  );

  if (!kf || kf.palette.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="text-xs uppercase tracking-wider opacity-50">Palette</div>
        <div className="text-xs opacity-50">No palette yet.</div>
      </div>
    );
  }

  // Mean lightness/chroma across the effective palette for the stat header.
  const stats = useMemo(() => {
    let totalWeight = 0;
    let weightedL = 0;
    let weightedC = 0;
    for (const e of kf.palette) {
      const c = Math.sqrt(e.oklab[1] ** 2 + e.oklab[2] ** 2);
      totalWeight += e.weight;
      weightedL += e.oklab[0] * e.weight;
      weightedC += c * e.weight;
    }
    const w = Math.max(totalWeight, 1e-6);
    return {
      meanL: weightedL / w,
      meanC: weightedC / w,
      count: kf.palette.length,
    };
  }, [kf.palette]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-wider opacity-50">Palette</div>
        <div className="text-[11px] opacity-50 tabular-nums">
          {stats.count} colors · L̄ {stats.meanL.toFixed(2)} · C̄ {stats.meanC.toFixed(2)}
        </div>
      </div>

      {isVideo && rawKeyframes.length > 1 && (
        <KeyframeStrip
          keyframes={effective}
          selected={kfIdx}
          onSelect={onChangeEditingKeyframe}
          overrides={overrides}
        />
      )}

      <AnchorMap
        palette={kf.palette}
        positions={kf.anchors}
        aspect={previewAspect}
        onMove={(slot, x, y) => patchSlot(slot, { x, y })}
      />

      <div className="flex flex-col gap-2">
        {kf.palette.map((entry, i) => (
          <SlotRow
            key={i}
            index={i}
            hex={entry.hex}
            weight={entry.weight}
            oklabL={entry.oklab[0]}
            oklabC={Math.sqrt(entry.oklab[1] ** 2 + entry.oklab[2] ** 2)}
            x={kf.anchors[i]?.x ?? 0.5}
            y={kf.anchors[i]?.y ?? 0.5}
            modified={!!slotOverrides[i]}
            onChange={(patch) => patchSlot(i, patch)}
            onReset={() => patchSlot(i, null)}
          />
        ))}
      </div>

      {hasAnyOverrides(overrides) && (
        <button
          onClick={resetAll}
          className="self-start text-[11px] px-2.5 py-1 rounded bg-mist-soft hover:bg-paper/15 border border-paper/10"
        >
          Reset palette edits
        </button>
      )}
    </div>
  );
}

function KeyframeStrip({
  keyframes,
  selected,
  onSelect,
  overrides,
}: {
  keyframes: Keyframe[];
  selected: number;
  onSelect: (k: number) => void;
  overrides: PaletteOverrides;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-[11px] opacity-50">
        <span>Keyframe</span>
        <span className="tabular-nums">
          {selected + 1} / {keyframes.length}
        </span>
      </div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${keyframes.length}, minmax(0, 1fr))` }}
      >
        {keyframes.map((kf, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            className={
              'flex flex-col h-8 rounded-sm overflow-hidden border ' +
              (i === selected
                ? 'border-paper'
                : 'border-paper/10 hover:border-paper/40')
            }
            title={`Keyframe ${i + 1}${overrides[i] ? ' (edited)' : ''}`}
          >
            <div className="flex-1 flex flex-col">
              {kf.palette.map((p, j) => (
                <div
                  key={j}
                  className="flex-1"
                  style={{ background: p.hex }}
                />
              ))}
            </div>
            {overrides[i] && (
              <div className="h-0.5 bg-paper" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function AnchorMap({
  palette,
  positions,
  aspect,
  onMove,
}: {
  palette: { hex: string }[];
  positions: { x: number; y: number }[];
  aspect: number;
  onMove: (slot: number, x: number, y: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<number | null>(null);

  const onPointerDown = (slot: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag(slot);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag === null || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
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

  return (
    <div
      ref={ref}
      className="relative w-full rounded border border-paper/10 bg-mist overflow-hidden select-none"
      style={{ aspectRatio: `${aspect}` }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {positions.map((p, i) => (
        <button
          type="button"
          key={i}
          onPointerDown={onPointerDown(i)}
          className={
            'absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-paper shadow-md cursor-grab ' +
            (drag === i ? 'cursor-grabbing scale-110' : '')
          }
          style={{
            left: `${p.x * 100}%`,
            top: `${p.y * 100}%`,
            background: palette[i]?.hex ?? '#888',
          }}
          title={`#${i + 1} · ${palette[i]?.hex ?? ''}`}
        />
      ))}
    </div>
  );
}

function SlotRow({
  index,
  hex,
  weight,
  oklabL,
  oklabC,
  x,
  y,
  modified,
  onChange,
  onReset,
}: {
  index: number;
  hex: string;
  weight: number;
  oklabL: number;
  oklabC: number;
  x: number;
  y: number;
  modified: boolean;
  onChange: (patch: ColorOverride) => void;
  onReset: () => void;
}) {
  const [hexInput, setHexInput] = useState(hex);
  // Sync the input from the prop when the underlying hex changes (e.g.
  // reset, keyframe switch, or external edit). The effect won't fire while
  // the user types because `hex` only updates when an override commits.
  useEffect(() => {
    setHexInput(hex);
  }, [hex]);

  const commitHex = (raw: string) => {
    const h = raw.trim().startsWith('#') ? raw.trim() : `#${raw.trim()}`;
    if (/^#[0-9a-fA-F]{6}$/.test(h)) {
      onChange({ hex: h.toLowerCase() });
    }
  };

  return (
    <div className="flex flex-col gap-1.5 p-2 rounded border border-paper/10 bg-mist/40">
      <div className="flex items-center gap-2">
        <span className="text-[10px] opacity-50 tabular-nums w-4">
          {index + 1}
        </span>
        <label className="relative w-7 h-7 rounded border border-paper/15 overflow-hidden cursor-pointer shrink-0">
          <span
            className="block w-full h-full"
            style={{ background: hex }}
          />
          <input
            type="color"
            value={hex}
            onChange={(e) => {
              setHexInput(e.target.value);
              onChange({ hex: e.target.value });
            }}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
        <input
          type="text"
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          onBlur={(e) => commitHex(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="flex-1 min-w-0 bg-mist border border-paper/10 rounded px-2 py-1 text-xs tabular-nums font-mono"
          spellCheck={false}
        />
        <span className="text-[11px] tabular-nums opacity-60 w-10 text-right">
          {(weight * 100).toFixed(0)}%
        </span>
        {modified && (
          <button
            type="button"
            onClick={onReset}
            className="text-[10px] opacity-60 hover:opacity-100 px-1.5 py-0.5 rounded bg-mist-soft border border-paper/10"
            title="Reset this color"
          >
            reset
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0.05}
          max={2}
          step={0.01}
          value={weight}
          onChange={(e) => onChange({ weight: parseFloat(e.target.value) })}
          className="flex-1 min-w-0"
          title="Influence weight"
        />
        <span className="text-[10px] tabular-nums opacity-40 whitespace-nowrap">
          L {oklabL.toFixed(2)} · C {oklabC.toFixed(2)} · {x.toFixed(2)},{y.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}
