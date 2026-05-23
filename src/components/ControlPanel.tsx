import type { Settings } from '../state';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  hasFaithfulData: boolean;
}

export function ControlPanel({ settings, onChange, hasFaithfulData }: Props) {
  const update = (patch: Partial<Settings>) =>
    onChange({ ...settings, ...patch });

  return (
    <div className="flex flex-col gap-5">
      <Section title="Layer weights">
        <Slider
          label="Bloom"
          help="Ghost silhouette of the source"
          value={settings.weights.bloom}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) =>
            update({ weights: { ...settings.weights, bloom: v } })
          }
        />
        <Slider
          label="Resemblance"
          help="How much of the original photo survives the bloom"
          value={settings.resemblance}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => update({ resemblance: v })}
        />
        <Slider
          label="Mesh"
          help="Soft gradient anchors in OKLab"
          value={settings.weights.mesh}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => update({ weights: { ...settings.weights, mesh: v } })}
        />
        <Slider
          label="Noise"
          help="Atmospheric drift, breaks banding"
          value={settings.weights.noise}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) =>
            update({ weights: { ...settings.weights, noise: v } })
          }
        />
      </Section>

      <Section title="Palette & feel">
        <Select
          label="Palette size"
          value={settings.paletteSize}
          options={[
            { v: 3, l: '3 — minimal' },
            { v: 5, l: '5 — balanced' },
            { v: 8, l: '8 — rich' },
          ]}
          onChange={(v) => update({ paletteSize: v })}
        />
        <Slider
          label="Softness"
          value={settings.softness}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => update({ softness: v })}
        />
        <Slider
          label="Grain"
          value={settings.grain}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => update({ grain: v })}
        />
      </Section>

      <Section title="Composition">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            Match source composition
            {!hasFaithfulData && (
              <span className="ml-2 text-xs opacity-50">(needs an image)</span>
            )}
          </span>
          <input
            type="checkbox"
            checked={settings.matchSource}
            disabled={!hasFaithfulData}
            onChange={(e) => update({ matchSource: e.target.checked })}
            className="accent-paper"
          />
        </label>
        {settings.matchSource && (
          <Slider
            label="Faithfulness"
            value={settings.composition}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => update({ composition: v })}
          />
        )}
      </Section>

      <Section title="Seed">
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={settings.seed}
            onChange={(e) =>
              update({ seed: parseInt(e.target.value, 10) || 0 })
            }
            className="w-24 bg-mist border border-paper/10 rounded px-2 py-1 text-sm"
          />
          <button
            onClick={() => update({ seed: Math.floor(Math.random() * 1e6) })}
            className="text-xs px-3 py-1.5 rounded bg-mist-soft hover:bg-paper/15 border border-paper/10"
          >
            Re-roll
          </button>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs uppercase tracking-wider opacity-50">{title}</div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Slider({
  label,
  help,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  help?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="text-xs tabular-nums opacity-50">
          {value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      {help && <div className="text-[11px] opacity-40">{help}</div>}
    </label>
  );
}

function Select<T extends number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { v: T; l: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as T)}
        className="bg-mist border border-paper/10 rounded px-2 py-1 text-sm"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </label>
  );
}
