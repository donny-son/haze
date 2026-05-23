// Sample N frames evenly from a trimmed video. Uses an HTMLVideoElement +
// canvas (works everywhere). WebCodecs would be faster on supported
// browsers but the simpler path is fine for v1 since we only ever sample
// 12–24 frames out of a clip ≤ 30s.

export interface SampledFrame {
  imageData: ImageData;
  timestampSec: number; // absolute time in the source video
}

export async function loadVideoMetadata(file: File): Promise<{
  url: string;
  duration: number;
  width: number;
  height: number;
}> {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.src = url;
  v.muted = true;
  v.preload = 'auto';
  v.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    v.onloadedmetadata = () => resolve();
    v.onerror = () => reject(new Error('Could not load video.'));
  });

  return {
    url,
    duration: v.duration,
    width: v.videoWidth,
    height: v.videoHeight,
  };
}

export async function sampleVideoFrames(
  url: string,
  startSec: number,
  endSec: number,
  count: number,
  targetWidth = 256,
  onProgress?: (p: number) => void,
): Promise<SampledFrame[]> {
  const v = document.createElement('video');
  v.src = url;
  v.muted = true;
  v.preload = 'auto';
  v.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    v.onloadedmetadata = () => resolve();
    v.onerror = () => reject(new Error('Could not load video for sampling.'));
  });

  const scale = targetWidth / v.videoWidth;
  const w = Math.max(32, Math.round(v.videoWidth * scale));
  const h = Math.max(32, Math.round(v.videoHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Cannot acquire 2d context for video sampling.');

  const out: SampledFrame[] = [];
  for (let i = 0; i < count; i++) {
    const t = startSec + ((endSec - startSec) * i) / Math.max(1, count - 1);
    await seek(v, t);
    ctx.drawImage(v, 0, 0, w, h);
    out.push({
      imageData: ctx.getImageData(0, 0, w, h),
      timestampSec: t,
    });
    if (onProgress) onProgress((i + 1) / count);
  }
  return out;
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      v.removeEventListener('seeked', onSeeked);
      v.removeEventListener('error', onErr);
      resolve();
    };
    const onErr = () => {
      v.removeEventListener('seeked', onSeeked);
      v.removeEventListener('error', onErr);
      reject(new Error('Seek failed.'));
    };
    v.addEventListener('seeked', onSeeked);
    v.addEventListener('error', onErr);
    v.currentTime = t;
  });
}

export const MAX_VIDEO_DURATION = 30;
