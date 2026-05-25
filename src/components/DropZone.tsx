import { useRef, useState } from 'react';

interface Props {
  onFile: (f: File) => void;
}

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif',
                'video/mp4', 'video/webm', 'video/quicktime'];

export function DropZone({ onFile }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = (f: File | null | undefined) => {
    if (f && ACCEPT.includes(f.type)) onFile(f);
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]); }}
      onClick={() => inputRef.current?.click()}
      className={[
        'flex flex-col items-center justify-center gap-5 rounded-2xl cursor-pointer',
        'border-2 border-dashed transition-colors duration-150 select-none',
        'w-full max-w-lg aspect-video',
        dragging
          ? 'border-zinc-400 bg-zinc-800/30'
          : 'border-zinc-700 bg-zinc-900/20 hover:border-zinc-500',
      ].join(' ')}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT.join(',')}
        className="hidden"
        onChange={e => handle(e.target.files?.[0])}
      />

      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        className="text-zinc-500">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>

      <div className="text-center">
        <p className="text-sm text-zinc-300">Drop an image or video</p>
        <p className="text-xs text-zinc-600 mt-1">JPEG · PNG · WebP · MP4 · WebM</p>
      </div>
    </div>
  );
}
