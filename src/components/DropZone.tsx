import { useCallback, useRef, useState } from 'react';

interface Props {
  onFile: (file: File) => void;
}

const ACCEPT_IMAGE = ['image/png', 'image/jpeg', 'image/webp'];
const ACCEPT_VIDEO = ['video/mp4', 'video/webm', 'video/quicktime'];

export function DropZone({ onFile }: Props) {
  const [hover, setHover] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = useCallback(
    (file: File | null | undefined) => {
      if (!file) return;
      const t = file.type;
      const ok = [...ACCEPT_IMAGE, ...ACCEPT_VIDEO].includes(t);
      if (!ok) {
        setError(
          `Unsupported file type: ${t || file.name}. ` +
            'Use a PNG / JPEG / WebP image, or an MP4 / WebM / MOV video.',
        );
        return;
      }
      setError(null);
      onFile(file);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        handle(e.dataTransfer.files?.[0]);
      }}
      onClick={() => inputRef.current?.click()}
      className={[
        'flex flex-col items-center justify-center gap-3 cursor-pointer',
        'border border-dashed rounded-2xl px-10 py-16 text-center',
        'transition-colors select-none',
        hover
          ? 'border-paper/60 bg-mist-soft/40'
          : 'border-paper/15 hover:border-paper/40 hover:bg-mist/60',
      ].join(' ')}
    >
      <div className="text-lg font-medium">Drop a photo or short video</div>
      <div className="text-sm opacity-60 max-w-sm">
        One moment in. One soft memory out. Everything runs locally — no
        upload, no account.
      </div>
      <div className="text-xs opacity-40">
        PNG · JPEG · WebP · MP4 · WebM · MOV — videos trim to 30 s
      </div>
      {error && (
        <div className="text-xs text-red-300 mt-2 max-w-sm">{error}</div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={[...ACCEPT_IMAGE, ...ACCEPT_VIDEO].join(',')}
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
      />
    </div>
  );
}
