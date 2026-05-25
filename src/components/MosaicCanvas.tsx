import { useEffect, useRef } from 'react';
import { MosaicRenderer, MosaicSettings } from '../engine/mosaic';

interface Props {
  file: File;
  settings: MosaicSettings;
  onAspect?: (a: number) => void;
}

export function MosaicCanvas({ file, settings, onAspect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MosaicRenderer | null>(null);
  const rafRef = useRef(0);
  const settingsRef = useRef(settings);

  // keep settings ref in sync for the video RAF loop
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = new MosaicRenderer(canvas);
    rendererRef.current = renderer;
    const isVideo = file.type.startsWith('video/');
    const url = URL.createObjectURL(file);

    if (!isVideo) {
      const img = new Image();
      img.onload = () => {
        canvas.width = canvas.offsetWidth || 800;
        canvas.height = Math.round(canvas.width / (img.naturalWidth / img.naturalHeight));
        renderer.load(img);
        renderer.render(settingsRef.current);
        onAspect?.(renderer.sourceAspect);
      };
      img.src = url;
    } else {
      const video = document.createElement('video');
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.src = url;

      video.addEventListener('loadedmetadata', () => {
        canvas.width = canvas.offsetWidth || 800;
        canvas.height = Math.round(canvas.width / (video.videoWidth / video.videoHeight));
        renderer.load(video);
        onAspect?.(renderer.sourceAspect);
        video.play().catch(() => {});
      });

      const tick = () => {
        if (video.readyState >= 2) renderer.updateFrame(video);
        renderer.render(settingsRef.current);
        rafRef.current = requestAnimationFrame(tick);
      };
      video.addEventListener('play', () => { rafRef.current = requestAnimationFrame(tick); });
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      renderer.dispose();
      URL.revokeObjectURL(url);
      rendererRef.current = null;
    };
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps

  // re-render on settings change (images; videos re-render automatically)
  useEffect(() => {
    rendererRef.current?.render(settings);
  }, [settings]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full block rounded-xl shadow-2xl"
      style={{ aspectRatio: 'auto' }}
    />
  );
}
