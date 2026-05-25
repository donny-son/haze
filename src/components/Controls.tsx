import { MosaicSettings } from '../engine/mosaic';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display?: (v: number) => string;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step, display, onChange }: SliderProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs tracking-widest uppercase text-zinc-400">{label}</span>
        <span className="text-xs font-mono text-zinc-300">
          {display ? display(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

interface Props {
  settings: MosaicSettings;
  onChange: (s: MosaicSettings) => void;
}

export function Controls({ settings, onChange }: Props) {
  const set = (key: keyof MosaicSettings) => (v: number) =>
    onChange({ ...settings, [key]: v });

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <aside className="w-72 shrink-0 bg-zinc-950 border-l border-zinc-900 flex flex-col gap-8 p-6 overflow-y-auto">
      <div>
        <h2 className="text-xs tracking-[0.2em] uppercase text-zinc-500 mb-6">Mosaic</h2>
        <div className="flex flex-col gap-6">
          <Slider
            label="Tile size"
            value={settings.tileSize}
            min={4}
            max={96}
            step={1}
            display={v => `${v}px`}
            onChange={set('tileSize')}
          />
          <Slider
            label="Gloss"
            value={settings.glossAmount}
            min={0}
            max={1}
            step={0.01}
            display={pct}
            onChange={set('glossAmount')}
          />
          <Slider
            label="Gap"
            value={settings.gap}
            min={0}
            max={8}
            step={0.5}
            display={v => `${v}px`}
            onChange={set('gap')}
          />
          <Slider
            label="Shape"
            value={settings.roundness}
            min={0}
            max={0.5}
            step={0.01}
            display={v => v === 0 ? 'square' : v >= 0.49 ? 'circle' : pct(v * 2)}
            onChange={set('roundness')}
          />
        </div>
      </div>
    </aside>
  );
}
