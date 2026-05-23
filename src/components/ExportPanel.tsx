import { useState } from "react";
import type { Anchor } from "../engine/composition";
import { cssDeclaration, cssGradientString } from "../engine/encoders/css";
import {
  buildPaletteJson,
  stringifyPaletteJson,
} from "../engine/encoders/paletteJson";
import type { HazeSettings } from "../engine/haze";

type Props = {
  canvas: HTMLCanvasElement | null;
  anchors: Anchor[];
  settings: HazeSettings;
  baseFilename?: string;
};

const triggerDownload = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const ExportPanel: React.FC<Props> = ({
  canvas,
  anchors,
  settings,
  baseFilename = "haze",
}) => {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const ready = !!canvas && anchors.length > 0;

  const exportPng = (): void => {
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      triggerDownload(blob, `${baseFilename}.png`);
    }, "image/png");
  };

  const exportPaletteJson = (): void => {
    const json = buildPaletteJson(anchors, {
      seed: settings.seed,
      composition: settings.matchSource ? settings.composition : 0,
    });
    const blob = new Blob([stringifyPaletteJson(json)], {
      type: "application/json",
    });
    triggerDownload(blob, `${baseFilename}.palette.json`);
  };

  const exportCss = (): void => {
    const text = cssDeclaration(anchors, { kind: "radial" });
    const blob = new Blob([text], { type: "text/css" });
    triggerDownload(blob, `${baseFilename}.css`);
  };

  const copyCss = async (): Promise<void> => {
    try {
      const text = cssGradientString(anchors, { kind: "radial" });
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1200);
    } catch {
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 1500);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-ink-900 p-5 ring-1 ring-ink-800">
      <div className="text-sm font-medium text-ink-100">Export</div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={exportPng}
          disabled={!ready}
          className="rounded-md border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 transition hover:border-ink-200/30 disabled:opacity-50"
        >
          PNG
        </button>
        <button
          type="button"
          onClick={exportPaletteJson}
          disabled={!ready}
          className="rounded-md border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 transition hover:border-ink-200/30 disabled:opacity-50"
        >
          Palette JSON
        </button>
        <button
          type="button"
          onClick={exportCss}
          disabled={!ready}
          className="rounded-md border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 transition hover:border-ink-200/30 disabled:opacity-50"
        >
          CSS file
        </button>
        <button
          type="button"
          onClick={copyCss}
          disabled={!ready}
          className="rounded-md border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 transition hover:border-ink-200/30 disabled:opacity-50"
        >
          {copyState === "copied"
            ? "Copied"
            : copyState === "error"
              ? "Copy failed"
              : "Copy CSS"}
        </button>
      </div>
      <p className="text-xs text-ink-200/60">
        Video and animated WebP exports are deferred to the next milestone.
      </p>
    </div>
  );
};
