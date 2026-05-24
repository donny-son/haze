import { forwardRef, type ReactNode } from 'react';

interface Props {
  width: number;
  height: number;
  // Rendered absolutely on top of the canvas (used for draggable anchors).
  // The wrapper hugs the canvas, so the overlay's 0..1 coordinates align
  // pixel-for-pixel with the canvas content.
  overlay?: ReactNode;
  children?: ReactNode;
}

export const PreviewCanvas = forwardRef<HTMLCanvasElement, Props>(
  function PreviewCanvas({ width, height, overlay, children }, ref) {
    return (
      <div className="relative flex-1 bg-black/60 rounded-2xl overflow-hidden border border-paper/10 flex items-center justify-center min-h-[420px]">
        <div className="relative">
          <canvas
            ref={ref}
            width={width}
            height={height}
            className="max-w-full max-h-full block"
            style={{ aspectRatio: `${width}/${height}` }}
          />
          {overlay}
        </div>
        {children}
      </div>
    );
  },
);
