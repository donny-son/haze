// Dual-handle trim scrubber. The user can pick any sub-range of the
// uploaded video, but the picked range is hard-capped at MAX_VIDEO_DURATION
// (30 s). Drags clamp; never silently truncate.

import { useEffect, useRef, useState } from 'react';
import { MAX_VIDEO_DURATION } from './decode';

interface Props {
  videoUrl: string;
  duration: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
}

export function VideoTrim({ videoUrl, duration, start, end, onChange }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);
  // Local draft range during a drag — onChange fires once on release so we
  // don't re-sample the video frames on every pointer move.
  const [draft, setDraft] = useState<{ s: number; e: number }>({
    s: start,
    e: end,
  });
  const [preview, setPreview] = useState<number>(start);

  useEffect(() => {
    setDraft({ s: start, e: end });
    setPreview(start);
  }, [start, end]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = preview;
    }
  }, [preview]);

  useEffect(() => {
    if (!dragging) return;
    function onMove(ev: PointerEvent) {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const t = Math.max(
        0,
        Math.min(1, (ev.clientX - rect.left) / rect.width),
      );
      const time = t * duration;
      setDraft((d) => {
        if (dragging === 'start') {
          const ns = Math.min(time, d.e - 0.1);
          const cap = Math.max(ns, d.e - MAX_VIDEO_DURATION);
          setPreview(cap);
          return { s: cap, e: d.e };
        } else {
          const ne = Math.max(time, d.s + 0.1);
          const cap = Math.min(ne, d.s + MAX_VIDEO_DURATION);
          setPreview(cap);
          return { s: d.s, e: cap };
        }
      });
    }
    function onUp() {
      setDragging(null);
      setDraft((d) => {
        onChange(d.s, d.e);
        return d;
      });
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, duration, onChange]);

  const pctStart = (draft.s / Math.max(0.001, duration)) * 100;
  const pctEnd = (draft.e / Math.max(0.001, duration)) * 100;
  const selSec = Math.max(0, draft.e - draft.s);

  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-video bg-black/40 rounded-lg overflow-hidden border border-paper/10">
        <video
          ref={videoRef}
          src={videoUrl}
          muted
          playsInline
          className="w-full h-full object-contain"
        />
      </div>

      <div className="text-xs opacity-60 flex justify-between">
        <span>Trim · {selSec.toFixed(1)} s selected</span>
        <span>
          {formatTime(draft.s)} → {formatTime(draft.e)}
        </span>
      </div>

      <div
        ref={trackRef}
        className="relative h-9 bg-mist rounded-md select-none"
      >
        <div
          className="absolute top-0 bottom-0 bg-paper/15"
          style={{ left: `${pctStart}%`, width: `${pctEnd - pctStart}%` }}
        />
        <Handle
          x={pctStart}
          onDown={() => setDragging('start')}
          label="start"
        />
        <Handle
          x={pctEnd}
          onDown={() => setDragging('end')}
          label="end"
        />
      </div>

      {selSec > MAX_VIDEO_DURATION + 0.01 && (
        <div className="text-xs text-amber-300">
          Selection longer than 30 s; will be clamped on next drag.
        </div>
      )}
    </div>
  );
}

function Handle({
  x,
  onDown,
  label,
}: {
  x: number;
  onDown: () => void;
  label: string;
}) {
  return (
    <div
      role="slider"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        onDown();
      }}
      className="absolute top-0 bottom-0 w-3 -translate-x-1/2 cursor-ew-resize"
      style={{ left: `${x}%` }}
    >
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 bg-paper rounded-full shadow-md" />
    </div>
  );
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, '0')}`;
}
