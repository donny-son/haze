// Animated export. The brief flags animated WebP encoding in-browser as
// the highest engineering risk (§9, §11): there's no native API, and the
// only viable path is a WASM build of libwebp + webpmux. For v1 we ship
// the brief's listed fallback — record the live canvas with MediaRecorder
// and produce a WebM (VP9 or VP8) clip. This preserves the "memory
// breathes" experience without taking on the WASM blob; swapping in a
// real animated-WebP encoder later is isolated to this module.

export interface AnimatedExportOptions {
  canvas: HTMLCanvasElement;
  durationSec: number;
  fps: number;
  drawFrame: (timeSec: number) => void;
  onProgress?: (p: number) => void;
}

export interface AnimatedExportResult {
  blob: Blob;
  format: 'webm';
  mime: string;
  extension: string;
}

export async function exportAnimated(
  opts: AnimatedExportOptions,
): Promise<AnimatedExportResult> {
  const { canvas, durationSec, fps, drawFrame, onProgress } = opts;

  const stream = canvas.captureStream(fps);
  const mime = pickWebmMime();
  if (!mime) {
    throw new Error(
      'This browser cannot record canvas to WebM. Animated export is ' +
      'unavailable; PNG export still works.',
    );
  }

  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 8_000_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    recorder.onerror = (ev) => reject(ev);
  });

  recorder.start();

  const totalFrames = Math.max(1, Math.round(durationSec * fps));
  const start = performance.now();
  for (let i = 0; i < totalFrames; i++) {
    const t = (i / fps);
    drawFrame(t);
    // Yield so MediaRecorder can sample the canvas.
    await waitForFrame();
    if (onProgress) onProgress((i + 1) / totalFrames);
  }
  // Pad slightly so the encoder flushes the last frame.
  const elapsed = (performance.now() - start) / 1000;
  if (elapsed < durationSec) {
    await sleep((durationSec - elapsed) * 1000);
  }
  recorder.stop();
  const blob = await finished;

  return {
    blob,
    format: 'webm',
    mime,
    extension: 'webm',
  };
}

function pickWebmMime(): string | null {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return null;
}

function waitForFrame(): Promise<void> {
  return new Promise((res) => requestAnimationFrame(() => res()));
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
