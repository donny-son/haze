import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DropZone } from './components/DropZone';
import { ControlPanel } from './components/ControlPanel';
import { ExportPanel } from './components/ExportPanel';
import { PreviewCanvas } from './components/PreviewCanvas';
import { Minimap } from './components/Minimap';
import { PaletteEditor } from './components/PaletteEditor';
import { VideoTrim } from './video/trim';
import { extractPalette, type PaletteEntry } from './engine/palette';
import { buildAnchors, type Anchor } from './engine/composition';
import { buildBloom } from './engine/layers/bloom';
import { Renderer } from './engine/renderer';
import { sampleAnimation, type Keyframe } from './engine/animator';
import { applyOverrides } from './engine/overrides';
import { canvasToPng } from './engine/encoders/png';
import { exportAnimated } from './engine/encoders/webp';
import { buildCssGradient, cssBlob } from './engine/encoders/css';
import { buildPaletteJson, paletteJsonBlob } from './engine/encoders/paletteJson';
import {
  loadVideoMetadata,
  sampleVideoFrames,
  MAX_VIDEO_DURATION,
} from './video/decode';
import { DEFAULT_SETTINGS, EXPORT_PRESETS, type ExportPreset, type Settings } from './state';

interface Source {
  kind: 'image' | 'video';
  filename: string;
  // Image: a single ImageData. Video: trim range + url.
  imageData?: ImageData;
  videoUrl?: string;
  videoDuration?: number;
  videoStart?: number;
  videoEnd?: number;
  // Small data URL shown as a minimap so the user can keep the
  // original in view while comparing it to the haze.
  thumbnailUrl?: string;
}

interface Memory {
  keyframes: Keyframe[];
  durationSec: number; // playback duration of the animation
  bloom: ImageData;
}

export function App() {
  const [source, setSource] = useState<Source | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [previewPreset, setPreviewPreset] = useState<ExportPreset>(EXPORT_PRESETS[0]);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // When non-null, the renderer freezes the animation at this keyframe's
  // time so the user can edit a single moment without the haze drifting.
  const [editingKeyframe, setEditingKeyframe] = useState<number | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const animationStartRef = useRef<number>(performance.now());

  // The preview canvas is mounted conditionally (only once a source exists),
  // so we attach via a callback ref. This both fires when the canvas first
  // appears AND when it remounts after "drop another", so the renderer is
  // always bound to the live canvas element.
  const previewCanvasRef = useCallback((c: HTMLCanvasElement | null) => {
    if (!c) {
      rendererRef.current = null;
      return;
    }
    if (rendererRef.current?.canvas === c) return;
    try {
      rendererRef.current = new Renderer(c);
    } catch (err) {
      console.error(err);
      alert(
        'WebGL2 is required. ' +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }, []);

  const onFile = useCallback(async (file: File) => {
    setBusy('Reading…');
    setMemory(null);
    // A new source invalidates any palette edits the user had on the old one.
    setSettings((s) => ({ ...s, paletteOverrides: {} }));
    setEditingKeyframe(0);
    try {
      if (file.type.startsWith('image/')) {
        const imageData = await fileToImageData(file);
        const thumbnailUrl = imageDataToThumbnail(imageData);
        setSource({
          kind: 'image',
          filename: file.name,
          imageData,
          thumbnailUrl,
        });
      } else if (file.type.startsWith('video/')) {
        const meta = await loadVideoMetadata(file);
        const end = Math.min(meta.duration, MAX_VIDEO_DURATION);
        const thumbnailUrl = await videoFrameToThumbnail(meta.url, 0);
        setSource({
          kind: 'video',
          filename: file.name,
          videoUrl: meta.url,
          videoDuration: meta.duration,
          videoStart: 0,
          videoEnd: end,
          thumbnailUrl,
        });
      }
    } catch (err) {
      console.error(err);
      alert('Could not read file: ' + (err instanceof Error ? err.message : err));
    } finally {
      setBusy(null);
    }
  }, []);

  // Setter for the ControlPanel that clears palette overrides when the slot
  // count would change. Overrides are keyed by slot index; resizing the
  // palette makes those keys ambiguous.
  const updateSettings = useCallback((next: Settings) => {
    setSettings((prev) =>
      next.paletteSize !== prev.paletteSize
        ? { ...next, paletteOverrides: {} }
        : next,
    );
  }, []);

  // Derived effective keyframes — raw extraction with user edits applied on
  // top. Memoized so the animation tick doesn't recompute per frame.
  const effectiveKeyframes = useMemo(
    () => (memory ? applyOverrides(memory.keyframes, settings.paletteOverrides) : []),
    [memory, settings.paletteOverrides],
  );

  // Whenever source or palette-related settings change, rebuild the memory.
  useEffect(() => {
    if (!source) {
      setMemory(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setBusy(source.kind === 'video' ? 'Sampling frames…' : 'Reading palette…');
      try {
        const built = await buildMemory(source, settings);
        if (cancelled) return;
        setMemory(built);
        animationStartRef.current = performance.now();
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          alert(
            'Failed to process source: ' +
              (err instanceof Error ? err.message : err),
          );
        }
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    source,
    settings.paletteSize,
    settings.seed,
    settings.matchSource,
    settings.composition,
    settings.resemblance,
  ]);

  // Animation loop. Driven by requestAnimationFrame; updates the canvas
  // with the current sampled palette + anchors.
  useEffect(() => {
    if (!memory || !rendererRef.current) return;
    const renderer = rendererRef.current;
    renderer.setBloom(memory.bloom);
    let raf = 0;
    const tick = () => {
      const elapsed = (performance.now() - animationStartRef.current) / 1000;
      // Snap time to the selected keyframe so palette edits are stable.
      const t =
        editingKeyframe !== null && effectiveKeyframes.length > 0
          ? effectiveKeyframes[
              Math.min(editingKeyframe, effectiveKeyframes.length - 1)
            ].t * memory.durationSec
          : elapsed;
      const { palette, anchors } = sampleAnimation(
        {
          keyframes: effectiveKeyframes,
          duration: memory.durationSec,
          breathAmplitude: 1,
          breathHueAmplitude: 0.04,
          loop: true,
        },
        t,
      );
      if (palette.length > 0) {
        renderer.render(palette, anchors, {
          width: previewPreset.width,
          height: previewPreset.height,
          weights: settings.weights,
          softness: settings.softness,
          grain: settings.grain,
          seed: settings.seed,
          time: t,
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    memory,
    effectiveKeyframes,
    editingKeyframe,
    settings.weights,
    settings.softness,
    settings.grain,
    settings.seed,
    previewPreset,
  ]);

  const hasFaithfulData = source !== null;

  // --- exports ------------------------------------------------------------

  const renderToOffscreen = useCallback(
    async (
      preset: ExportPreset,
      timeSec: number,
    ): Promise<HTMLCanvasElement> => {
      if (!memory) throw new Error('No memory ready to export.');
      const canvas = document.createElement('canvas');
      canvas.width = preset.width;
      canvas.height = preset.height;
      const r = new Renderer(canvas);
      r.setBloom(memory.bloom);
      const { palette, anchors } = sampleAnimation(
        {
          keyframes: effectiveKeyframes,
          duration: memory.durationSec,
          breathAmplitude: 1,
          breathHueAmplitude: 0.04,
          loop: true,
        },
        timeSec,
      );
      r.render(palette, anchors, {
        width: preset.width,
        height: preset.height,
        weights: settings.weights,
        softness: settings.softness,
        grain: settings.grain,
        seed: settings.seed,
        time: timeSec,
      });
      return canvas;
    },
    [memory, effectiveKeyframes, settings],
  );

  const handlePng = useCallback(
    async (preset: ExportPreset) => {
      const c = await renderToOffscreen(preset, 0);
      const blob = await canvasToPng(c);
      downloadBlob(blob, `${stem(source?.filename)}.png`);
    },
    [renderToOffscreen, source],
  );

  const handleAnimated = useCallback(
    async (preset: ExportPreset, durationSec: number) => {
      if (!memory) return;
      const canvas = document.createElement('canvas');
      canvas.width = preset.width;
      canvas.height = preset.height;
      const r = new Renderer(canvas);
      r.setBloom(memory.bloom);
      // Append canvas to DOM (off-screen) so MediaRecorder reliably samples it.
      canvas.style.position = 'fixed';
      canvas.style.left = '-99999px';
      canvas.style.top = '0';
      canvas.style.pointerEvents = 'none';
      document.body.appendChild(canvas);
      try {
        const res = await exportAnimated({
          canvas,
          durationSec,
          fps: 24,
          drawFrame: (t) => {
            const { palette, anchors } = sampleAnimation(
              {
                keyframes: effectiveKeyframes,
                duration: memory.durationSec,
                breathAmplitude: 1,
                breathHueAmplitude: 0.04,
                loop: true,
              },
              t,
            );
            r.render(palette, anchors, {
              width: preset.width,
              height: preset.height,
              weights: settings.weights,
              softness: settings.softness,
              grain: settings.grain,
              seed: settings.seed,
              time: t,
            });
          },
        });
        downloadBlob(res.blob, `${stem(source?.filename)}.${res.extension}`);
      } finally {
        document.body.removeChild(canvas);
      }
    },
    [memory, effectiveKeyframes, settings, source],
  );

  const handleJson = useCallback(async () => {
    if (effectiveKeyframes.length === 0) return;
    const k0 = effectiveKeyframes[0];
    const json = buildPaletteJson(k0.palette, k0.anchors);
    downloadBlob(paletteJsonBlob(json), `${stem(source?.filename)}.palette.json`);
  }, [effectiveKeyframes, source]);

  const handleCss = useCallback(async () => {
    if (effectiveKeyframes.length === 0) return;
    const k0 = effectiveKeyframes[0];
    downloadBlob(
      cssBlob(buildCssGradient(k0.palette, k0.anchors)),
      `${stem(source?.filename)}.gradient.css`,
    );
  }, [effectiveKeyframes, source]);

  const animatedAvailable = useMemo(
    () =>
      typeof MediaRecorder !== 'undefined' &&
      (MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ||
        MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ||
        MediaRecorder.isTypeSupported('video/webm')),
    [],
  );

  return (
    <div className="min-h-full flex flex-col">
      <header className="px-6 py-4 border-b border-paper/10 flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-wide">haze</h1>
          <span className="text-xs opacity-50">
            a photo or video → a reusable color memory
          </span>
        </div>
        <div className="text-xs opacity-50">
          {source ? source.filename : 'no source yet'}
          {busy ? ` · ${busy}` : ''}
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 p-6 overflow-hidden">
        <div className="flex flex-col gap-4 min-w-0">
          {!source && <DropZone onFile={onFile} />}
          {source?.kind === 'video' && source.videoUrl != null && (
            <VideoTrim
              videoUrl={source.videoUrl}
              duration={source.videoDuration ?? 0}
              start={source.videoStart ?? 0}
              end={source.videoEnd ?? 0}
              onChange={(s, e) =>
                setSource({ ...source, videoStart: s, videoEnd: e })
              }
            />
          )}
          {source && (
            <PreviewCanvas
              ref={previewCanvasRef}
              width={previewPreset.width}
              height={previewPreset.height}
            >
              {source.thumbnailUrl && (
                <Minimap
                  key={source.thumbnailUrl}
                  url={source.thumbnailUrl}
                  label={source.filename}
                />
              )}
            </PreviewCanvas>
          )}
          {source && (
            <div className="flex justify-between text-xs opacity-50">
              <span>
                Preview at {previewPreset.width}×{previewPreset.height}.
              </span>
              <button
                className="underline hover:opacity-100 opacity-70"
                onClick={() => {
                  setSource(null);
                  setMemory(null);
                }}
              >
                drop another
              </button>
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-6 overflow-y-auto min-w-0">
          {source && (
            <>
              <ControlPanel
                settings={settings}
                onChange={updateSettings}
                hasFaithfulData={hasFaithfulData}
              />
              {memory && memory.keyframes.length > 0 && (
                <PaletteEditor
                  rawKeyframes={memory.keyframes}
                  overrides={settings.paletteOverrides}
                  onChangeOverrides={(o) =>
                    setSettings((s) => ({ ...s, paletteOverrides: o }))
                  }
                  isVideo={source.kind === 'video'}
                  editingKeyframe={editingKeyframe ?? 0}
                  onChangeEditingKeyframe={setEditingKeyframe}
                  previewAspect={previewPreset.width / previewPreset.height}
                />
              )}
              <ExportPanel
                onExportPng={handlePng}
                onExportAnimated={handleAnimated}
                onExportPaletteJson={handleJson}
                onExportCss={handleCss}
                animatedAvailable={animatedAvailable}
                animationDuration={memory?.durationSec ?? 6}
                onResolutionChange={setPreviewPreset}
              />
            </>
          )}
          {!source && (
            <div className="text-xs opacity-50 leading-relaxed space-y-3">
              <p>
                Drop a photo and you'll get a soft, gradient-like haze
                derived from its dominant colors. Drop a short video and the
                haze shifts through the clip's color story.
              </p>
              <p>
                Everything runs in this browser tab. No upload. No account.
                When you close the tab the memory only persists as files
                you've exported.
              </p>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

// --- helpers ----------------------------------------------------------------

async function buildMemory(source: Source, settings: Settings): Promise<Memory> {
  if (source.kind === 'image' && source.imageData) {
    const palette = extractPalette(
      source.imageData,
      settings.paletteSize,
      8,
      settings.seed,
    );
    const composition = settings.matchSource ? settings.composition : 0;
    const anchors = buildAnchors(palette, composition, settings.seed);
    const bloom = buildBloom(source.imageData, settings.resemblance);
    return {
      keyframes: [{ t: 0, palette, anchors }],
      durationSec: 6, // ambient breath has no inherent duration; pick a loop
      bloom,
    };
  }

  if (source.kind === 'video' && source.videoUrl) {
    const start = source.videoStart ?? 0;
    const end = source.videoEnd ?? Math.min(source.videoDuration ?? 0, MAX_VIDEO_DURATION);
    const clipDuration = Math.max(0.5, end - start);
    const keyframeCount = clamp(Math.round(clipDuration * 1.5), 6, 24);

    const frames = await sampleVideoFrames(
      source.videoUrl,
      start,
      end,
      keyframeCount,
    );

    // Build palette/anchors per keyframe. To keep continuity, use the same
    // seed across all keyframes (so the free-floating Poisson layout is
    // identical) and match palette entries between frames by similarity.
    const keyframes: Keyframe[] = [];
    let prevPalette: PaletteEntry[] | null = null;
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const palette = extractPalette(
        f.imageData,
        settings.paletteSize,
        8,
        settings.seed,
      );
      const composition = settings.matchSource ? settings.composition : 0;
      let anchors = buildAnchors(palette, composition, settings.seed);
      // Reorder palette+anchors so colors track between keyframes by
      // closest match to the previous frame.
      if (prevPalette) {
        const reordered = reorderToMatch(prevPalette, palette, anchors);
        keyframes.push({
          t: i / (frames.length - 1),
          palette: reordered.palette,
          anchors: reordered.anchors,
        });
        prevPalette = reordered.palette;
      } else {
        keyframes.push({
          t: i / Math.max(1, frames.length - 1),
          palette,
          anchors,
        });
        prevPalette = palette;
      }
    }

    // Use the first frame for bloom (could average across frames, but a
    // single ghost is more recognizable than a blur of the whole clip).
    const bloom = buildBloom(frames[0].imageData, settings.resemblance);
    return {
      keyframes,
      durationSec: clipDuration,
      bloom,
    };
  }

  throw new Error('Unrecognized source.');
}

function reorderToMatch(
  prev: PaletteEntry[],
  next: PaletteEntry[],
  anchors: Anchor[],
): { palette: PaletteEntry[]; anchors: Anchor[] } {
  // Greedy nearest assignment in OKLab. O(N^2) is fine for N ≤ 8.
  const used = new Set<number>();
  const order: number[] = [];
  for (let i = 0; i < prev.length; i++) {
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < next.length; j++) {
      if (used.has(j)) continue;
      const dL = prev[i].oklab[0] - next[j].oklab[0];
      const da = prev[i].oklab[1] - next[j].oklab[1];
      const db = prev[i].oklab[2] - next[j].oklab[2];
      const d = dL * dL + da * da + db * db;
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best >= 0) {
      used.add(best);
      order.push(best);
    }
  }
  // Anything not picked (size mismatch) trails on the end.
  for (let j = 0; j < next.length; j++) if (!used.has(j)) order.push(j);
  return {
    palette: order.map((i) => next[i]),
    anchors: order.map((i) => anchors[i] ?? { x: 0.5, y: 0.5, baseX: 0.5, baseY: 0.5 }),
  };
}

function imageDataToThumbnail(data: ImageData, maxDim = 256): string {
  const scale = Math.min(1, maxDim / Math.max(data.width, data.height));
  const w = Math.max(1, Math.round(data.width * scale));
  const h = Math.max(1, Math.round(data.height * scale));
  const src = document.createElement('canvas');
  src.width = data.width;
  src.height = data.height;
  src.getContext('2d')!.putImageData(data, 0, 0);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d')!.drawImage(src, 0, 0, w, h);
  return out.toDataURL('image/jpeg', 0.82);
}

async function videoFrameToThumbnail(
  url: string,
  atSec: number,
  maxDim = 256,
): Promise<string> {
  const v = document.createElement('video');
  v.src = url;
  v.muted = true;
  v.preload = 'auto';
  v.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    v.onloadedmetadata = () => resolve();
    v.onerror = () => reject(new Error('Could not load video for thumbnail.'));
  });
  await new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      v.removeEventListener('seeked', onSeeked);
      v.removeEventListener('error', onErr);
      resolve();
    };
    const onErr = () => {
      v.removeEventListener('seeked', onSeeked);
      v.removeEventListener('error', onErr);
      reject(new Error('Thumbnail seek failed.'));
    };
    v.addEventListener('seeked', onSeeked);
    v.addEventListener('error', onErr);
    v.currentTime = Math.max(0, Math.min(atSec, (v.duration || 0) - 0.01));
  });
  const scale = Math.min(1, maxDim / Math.max(v.videoWidth, v.videoHeight));
  const w = Math.max(1, Math.round(v.videoWidth * scale));
  const h = Math.max(1, Math.round(v.videoHeight * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.drawImage(v, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.82);
}

async function fileToImageData(file: File): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  const maxDim = 1024;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('No 2d context.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function stem(filename?: string): string {
  if (!filename) return 'haze';
  const i = filename.lastIndexOf('.');
  return (i > 0 ? filename.slice(0, i) : filename).replace(/\s+/g, '-');
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
