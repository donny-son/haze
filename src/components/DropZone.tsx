import { useCallback, useRef, useState } from "react";

type Props = {
  onImage: (file: File) => void;
  disabled?: boolean;
};

const ACCEPT = "image/png, image/jpeg, image/webp";

export const DropZone: React.FC<Props> = ({ onImage, disabled }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);

  const handleFile = useCallback(
    (file: File | null | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) return;
      onImage(file);
    },
    [onImage],
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
        handleFile(e.dataTransfer.files[0]);
      }}
      className={`group flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-8 py-16 text-center transition ${
        hover
          ? "border-violet-300/70 bg-violet-300/10"
          : "border-ink-700 bg-ink-900 hover:border-ink-200/30"
      } ${disabled ? "pointer-events-none opacity-50" : ""}`}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
    >
      <div className="text-lg font-medium">Drop a photo</div>
      <div className="text-sm text-ink-200/70">
        or click to choose — PNG, JPEG, WebP. Processed locally in your browser.
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
};
