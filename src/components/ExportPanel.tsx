import { useState } from 'react';
import { EXPORT_PRESETS, type ExportPreset } from '../state';

interface Props {
  onExportPng: (preset: ExportPreset) => Promise<void>;
  onExportAnimated: (
    preset: ExportPreset,
    durationSec: number,
  ) => Promise<void>;
  onExportPaletteJson: () => Promise<void>;
  onExportCss: () => Promise<void>;
  animatedAvailable: boolean;
  animationDuration: number; // suggested duration in seconds
}

export function ExportPanel({
  onExportPng,
  onExportAnimated,
  onExportPaletteJson,
  onExportCss,
  animatedAvailable,
  animationDuration,
}: Props) {
  const [preset, setPreset] = useState<ExportPreset>(EXPORT_PRESETS[0]);
  const [custom, setCustom] = useState<{ w: number; h: number }>({
    w: 2560,
    h: 1440,
  });
  const [useCustom, setUseCustom] = useState(false);
  const [duration, setDuration] = useState(Math.min(animationDuration, 6));
  const [busy, setBusy] = useState<string | null>(null);

  const chosen: ExportPreset = useCustom
    ? { name: 'Custom', width: custom.w, height: custom.h }
    : preset;

  const wrap = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      alert('Export failed: ' + msg);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="text-xs uppercase tracking-wider opacity-50">
          Resolution
        </div>
        <div className="grid grid-cols-2 gap-2">
          {EXPORT_PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => {
                setPreset(p);
                setUseCustom(false);
              }}
              className={[
                'text-left rounded-md border px-3 py-2 text-sm transition',
                !useCustom && p.name === preset.name
                  ? 'border-paper/70 bg-paper/5'
                  : 'border-paper/10 hover:border-paper/30 bg-mist',
              ].join(' ')}
            >
              <div className="font-medium">{p.name}</div>
              <div className="text-[11px] opacity-50">
                {p.width}×{p.height}
                {p.hint ? ` · ${p.hint}` : ''}
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={() => setUseCustom((u) => !u)}
          className={[
            'text-left rounded-md border px-3 py-2 text-sm transition',
            useCustom
              ? 'border-paper/70 bg-paper/5'
              : 'border-paper/10 hover:border-paper/30 bg-mist',
          ].join(' ')}
        >
          <div className="font-medium">Custom</div>
          {useCustom && (
            <div className="flex items-center gap-2 mt-2">
              <NumberInput
                value={custom.w}
                onChange={(v) => setCustom({ ...custom, w: v })}
              />
              <span className="opacity-50">×</span>
              <NumberInput
                value={custom.h}
                onChange={(v) => setCustom({ ...custom, h: v })}
              />
            </div>
          )}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-xs uppercase tracking-wider opacity-50">
          Export
        </div>
        <button
          disabled={busy !== null}
          onClick={() => wrap('png', () => onExportPng(chosen))}
          className="rounded-md px-3 py-2 text-sm bg-paper text-ink font-medium hover:bg-paper/90 disabled:opacity-50"
        >
          {busy === 'png' ? 'Rendering…' : `PNG · ${chosen.width}×${chosen.height}`}
        </button>

        <div className="flex flex-col gap-2 rounded-md border border-paper/10 bg-mist p-3">
          <div className="flex items-center justify-between text-sm">
            <span>Animated (WebM)</span>
            <span className="text-xs tabular-nums opacity-60">
              {duration.toFixed(1)} s
            </span>
          </div>
          <input
            type="range"
            min={2}
            max={30}
            step={0.5}
            value={duration}
            onChange={(e) => setDuration(parseFloat(e.target.value))}
          />
          <button
            disabled={busy !== null || !animatedAvailable}
            onClick={() =>
              wrap('webm', () => onExportAnimated(chosen, duration))
            }
            className="rounded-md px-3 py-2 text-sm bg-paper/10 hover:bg-paper/20 border border-paper/10 disabled:opacity-50"
          >
            {busy === 'webm'
              ? 'Recording…'
              : animatedAvailable
                ? `Export WebM · ${chosen.width}×${chosen.height}`
                : 'Recording not supported here'}
          </button>
          <div className="text-[11px] opacity-50">
            Animated WebP encoding has no native API; v1 records to WebM via
            MediaRecorder. Works in Chrome / Edge / Firefox.
          </div>
        </div>

        <button
          disabled={busy !== null}
          onClick={() => wrap('json', onExportPaletteJson)}
          className="rounded-md px-3 py-2 text-sm bg-paper/5 hover:bg-paper/15 border border-paper/10 disabled:opacity-50"
        >
          {busy === 'json' ? '…' : 'Palette JSON'}
        </button>

        <button
          disabled={busy !== null}
          onClick={() => wrap('css', onExportCss)}
          className="rounded-md px-3 py-2 text-sm bg-paper/5 hover:bg-paper/15 border border-paper/10 disabled:opacity-50"
        >
          {busy === 'css' ? '…' : 'CSS gradient'}
        </button>
      </div>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      min={64}
      max={8192}
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
      className="w-24 bg-mist-soft border border-paper/10 rounded px-2 py-1 text-sm"
    />
  );
}
