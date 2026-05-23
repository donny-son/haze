import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ControlPanel } from "./components/ControlPanel";
import { DropZone } from "./components/DropZone";
import { ExportPanel } from "./components/ExportPanel";
import { PreviewCanvas } from "./components/PreviewCanvas";
import type { PaletteEntry } from "./engine/composition";
import {
  anchorsFromPalette,
  DEFAULT_SETTINGS,
  newSeed,
  type HazeSettings,
} from "./engine/haze";
import { extractPalette } from "./engine/palette";
import { renderHaze } from "./engine/renderer";

const PREVIEW_W = 1280;
const PREVIEW_H = 720;

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      resolve(img);
      // Revoke after the image is in memory; the decoded bitmap stays valid.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image"));
    };
    img.src = url;
  });

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [settings, setSettings] = useState<HazeSettings>(DEFAULT_SETTINGS);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [palette, setPalette] = useState<PaletteEntry[]>([]);
  const [filename, setFilename] = useState<string>("haze");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anchors = useMemo(
    () => anchorsFromPalette(palette, settings),
    [palette, settings],
  );

  // Re-extract palette when image or palette size changes; cheap helper.
  useEffect(() => {
    if (!image) {
      setPalette([]);
      return;
    }
    try {
      const p = extractPalette(image, {
        size: settings.paletteSize,
        seed: settings.seed,
      });
      setPalette(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Palette extraction failed");
    }
  }, [image, settings.paletteSize, settings.seed]);

  // Render whenever settings or anchors change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || anchors.length === 0) return;
    try {
      renderHaze(canvas, {
        source: image,
        width: PREVIEW_W,
        height: PREVIEW_H,
        anchors,
        settings,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Render failed");
    }
  }, [anchors, image, settings]);

  const onImage = useCallback(async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const img = await loadImage(file);
      setImage(img);
      const base = file.name.replace(/\.[^.]+$/, "") || "haze";
      setFilename(`${base}-haze`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read image");
    } finally {
      setBusy(false);
    }
  }, []);

  const onReroll = useCallback(() => {
    setSettings((s) => ({ ...s, seed: newSeed() }));
  }, []);

  const empty = !image;

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">haze</h1>
          <p className="text-sm text-ink-200/70">
            Turn a photo into a soft color memory — local, in your browser.
          </p>
        </div>
        <a
          href="https://github.com/donny-son/haze"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-ink-200/60 hover:text-ink-100"
        >
          source
        </a>
      </header>

      <main className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex flex-col gap-4">
          {empty ? (
            <DropZone onImage={onImage} disabled={busy} />
          ) : (
            <div className="relative">
              <PreviewCanvas
                ref={canvasRef}
                width={PREVIEW_W}
                height={PREVIEW_H}
              />
              {busy && (
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-ink-950/70 text-sm">
                  Reading image…
                </div>
              )}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-md border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-sm text-rose-200"
            >
              {error}
            </div>
          )}

          {!empty && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-200/60">
              <button
                type="button"
                onClick={() => {
                  setImage(null);
                  setPalette([]);
                  setError(null);
                  setFilename("haze");
                }}
                className="rounded border border-ink-700 px-2 py-1 hover:border-ink-200/30"
              >
                Choose another image
              </button>
              <span>
                Preview at {PREVIEW_W}×{PREVIEW_H}. Export renders the canvas as-is.
              </span>
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <ControlPanel
            settings={settings}
            onChange={setSettings}
            onReroll={onReroll}
          />
          <ExportPanel
            canvas={canvasRef.current}
            anchors={anchors}
            settings={settings}
            baseFilename={filename}
          />
        </aside>
      </main>

      <footer className="text-xs text-ink-200/40">
        v0 still-image preview · video & animated WebP coming later
      </footer>
    </div>
  );
}

export default App;
