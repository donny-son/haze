import type { HazeSettings } from "../engine/haze";
import { PALETTE_SIZES } from "../engine/haze";

type Props = {
  settings: HazeSettings;
  onChange: (next: HazeSettings) => void;
  onReroll: () => void;
};

const Slider: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}> = ({ label, value, min = 0, max = 1, step = 0.01, onChange }) => (
  <label className="flex flex-col gap-1.5">
    <span className="flex items-baseline justify-between text-xs text-ink-200/80">
      <span>{label}</span>
      <span className="font-mono text-ink-200/60">{value.toFixed(2)}</span>
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full"
    />
  </label>
);

export const ControlPanel: React.FC<Props> = ({
  settings,
  onChange,
  onReroll,
}) => {
  const set = <K extends keyof HazeSettings>(key: K, value: HazeSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <div className="flex flex-col gap-5 rounded-2xl bg-ink-900 p-5 ring-1 ring-ink-800">
      <div>
        <div className="mb-3 text-sm font-medium text-ink-100">Layers</div>
        <div className="flex flex-col gap-3">
          <Slider
            label="Bloom"
            value={settings.bloom}
            onChange={(v) => set("bloom", v)}
          />
          <Slider
            label="Mesh"
            value={settings.mesh}
            onChange={(v) => set("mesh", v)}
          />
          <Slider
            label="Noise"
            value={settings.noise}
            onChange={(v) => set("noise", v)}
          />
        </div>
      </div>

      <div>
        <div className="mb-3 text-sm font-medium text-ink-100">Composition</div>
        <label className="flex items-center justify-between gap-3">
          <span className="text-xs text-ink-200/80">Match source</span>
          <input
            type="checkbox"
            checked={settings.matchSource}
            onChange={(e) => set("matchSource", e.target.checked)}
            className="h-4 w-4 accent-violet-300"
          />
        </label>
        {settings.matchSource && (
          <div className="mt-3">
            <Slider
              label="Faithfulness"
              value={settings.composition}
              onChange={(v) => set("composition", v)}
            />
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 text-sm font-medium text-ink-100">Palette</div>
        <div className="flex gap-2">
          {PALETTE_SIZES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => set("paletteSize", n)}
              className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition ${
                settings.paletteSize === n
                  ? "border-violet-300/70 bg-violet-300/15 text-ink-100"
                  : "border-ink-700 text-ink-200/70 hover:border-ink-200/30"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-3 text-sm font-medium text-ink-100">Texture</div>
        <div className="flex flex-col gap-3">
          <Slider
            label="Softness"
            value={settings.softness}
            onChange={(v) => set("softness", v)}
          />
          <Slider
            label="Grain"
            value={settings.grain}
            onChange={(v) => set("grain", v)}
          />
        </div>
      </div>

      <div>
        <div className="mb-3 text-sm font-medium text-ink-100">Seed</div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={settings.seed}
            onChange={(e) =>
              set("seed", parseInt(e.target.value || "0", 10) | 0)
            }
            className="w-full rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5 font-mono text-sm text-ink-100"
          />
          <button
            type="button"
            onClick={onReroll}
            className="rounded-md border border-violet-300/40 bg-violet-300/10 px-3 py-1.5 text-sm text-ink-100 transition hover:bg-violet-300/20"
          >
            Reroll
          </button>
        </div>
      </div>
    </div>
  );
};
