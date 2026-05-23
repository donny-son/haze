import { forwardRef } from 'react';

interface Props {
  width: number;
  height: number;
}

export const PreviewCanvas = forwardRef<HTMLCanvasElement, Props>(
  function PreviewCanvas({ width, height }, ref) {
    return (
      <div className="relative flex-1 bg-black/60 rounded-2xl overflow-hidden border border-paper/10 flex items-center justify-center min-h-[420px]">
        <canvas
          ref={ref}
          width={width}
          height={height}
          className="max-w-full max-h-full block"
          style={{ aspectRatio: `${width}/${height}` }}
        />
      </div>
    );
  },
);
