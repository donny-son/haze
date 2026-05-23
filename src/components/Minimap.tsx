import { useState } from 'react';

interface Props {
  url: string;
  label?: string;
}

export function Minimap({ url, label }: Props) {
  const [visible, setVisible] = useState(true);

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="absolute top-3 right-3 text-[10px] uppercase tracking-wider text-paper/70 hover:text-paper bg-black/50 hover:bg-black/70 px-2 py-1 rounded-md transition-colors"
      >
        show original
      </button>
    );
  }

  return (
    <div className="group absolute top-3 right-3">
      <img
        src={url}
        alt={label ?? 'Original source'}
        className="block max-w-[180px] max-h-[120px] rounded-lg border border-paper/30 shadow-lg opacity-90 group-hover:opacity-100 transition-opacity"
      />
      <div className="pointer-events-none absolute bottom-1 left-1.5 text-[10px] uppercase tracking-wider text-paper/80 opacity-0 group-hover:opacity-100 transition-opacity drop-shadow">
        original
      </div>
      <button
        onClick={() => setVisible(false)}
        aria-label="Hide original"
        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-black/80 text-paper text-xs leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
      >
        ×
      </button>
    </div>
  );
}
