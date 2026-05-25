import { useState } from 'react';
import { DropZone } from './components/DropZone';
import { MosaicCanvas } from './components/MosaicCanvas';
import { Controls } from './components/Controls';
import { DEFAULT_SETTINGS, type MosaicSettings } from './engine/mosaic';

export function App() {
  const [file, setFile] = useState<File | null>(null);
  const [settings, setSettings] = useState<MosaicSettings>(DEFAULT_SETTINGS);

  if (!file) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-8 p-6">
        <div className="text-center">
          <h1 className="text-2xl font-mono tracking-[0.15em] text-zinc-100 mb-2">haze</h1>
          <p className="text-sm text-zinc-500">glossy mosaic — images &amp; video</p>
        </div>
        <DropZone onFile={setFile} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <header className="flex items-center px-6 py-4 border-b border-zinc-900 shrink-0">
        <h1 className="text-lg font-mono tracking-[0.15em] text-zinc-100">haze</h1>
        <span className="ml-4 text-xs text-zinc-500 truncate max-w-xs">{file.name}</span>
        <button
          onClick={() => setFile(null)}
          className="ml-auto text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
        >
          change file
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 flex items-start justify-center p-6 overflow-auto">
          <MosaicCanvas file={file} settings={settings} />
        </main>
        <Controls settings={settings} onChange={setSettings} />
      </div>
    </div>
  );
}
