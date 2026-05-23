import { forwardRef } from "react";

type Props = {
  width: number;
  height: number;
  className?: string;
};

export const PreviewCanvas = forwardRef<HTMLCanvasElement, Props>(
  ({ width, height, className }, ref) => (
    <canvas
      ref={ref}
      width={width}
      height={height}
      className={
        className ??
        "block h-auto w-full max-w-full rounded-2xl shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)]"
      }
      style={{ aspectRatio: `${width} / ${height}` }}
    />
  ),
);
PreviewCanvas.displayName = "PreviewCanvas";
