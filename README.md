# haze

Turn a photo or short video into a reusable color memory.

A single image (or up to 30 s of video) collapses into one soft, gradient-like
haze — a vivid abstraction that captures the feel of the moment without
reproducing it. The result is reusable: a wallpaper, a palette, a CSS
gradient.

Everything runs locally in the browser. No upload, no account.

## Project brief

The full design brief — locked product decisions, engine architecture,
animation/export notes, risks, milestones — is in
[`docs/project-brief.md`](docs/project-brief.md).

## Run it

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## What's inside

The engine has three stackable layers, each with a weight slider:

- **Bloom** — a heavy blur of a downsampled source. The ghost silhouette
  that puts colors roughly where they were.
- **Mesh** — palette anchors radiating soft glows, blended in **OKLab** so
  midtones don't go muddy.
- **Noise** — atmospheric simplex noise that breaks banding and gives the
  composition a "living" quality.

Two motion sources, both running simultaneously when applicable:

- **Ambient breath** — low-frequency drift on every anchor, always on.
- **Keyframed** — for videos: 6–24 frames sampled across the trim range
  contribute palettes and centroids that interpolate smoothly.

Colors track between video keyframes via greedy nearest-neighbor matching
in OKLab so the haze doesn't pop.

## Exports

| Format | Notes |
| --- | --- |
| **PNG** | Renders at the chosen resolution (4K desktop / phone / square / custom). |
| **WebM** | Animated export via MediaRecorder. The brief calls out animated WebP encoding as the highest engineering risk — there's no native API and the WASM path is heavy. WebM is the listed fallback (§9). Swapping in a real animated-WebP encoder is isolated to `src/engine/encoders/webp.ts`. |
| **Palette JSON** | `[{ hex, weight, x, y }]` — palette colors with normalized anchor positions. |
| **CSS gradient** | A best-effort `radial-gradient(...)` stack approximating the haze. |

## Repo layout

```
src/
├── App.tsx
├── main.tsx
├── state.ts
├── index.css
├── components/
│   ├── DropZone.tsx
│   ├── PreviewCanvas.tsx
│   ├── ControlPanel.tsx
│   └── ExportPanel.tsx
├── engine/
│   ├── color.ts          # OKLab helpers
│   ├── palette.ts        # k-means palette extraction in OKLab
│   ├── composition.ts    # Poisson-disk + faithful centroid + lerp
│   ├── animator.ts       # ambient breath + keyframe interpolation
│   ├── renderer.ts       # WebGL2 composite (bloom + mesh + noise + grain)
│   ├── layers/
│   │   └── bloom.ts      # downsample + gaussian on the CPU
│   └── encoders/
│       ├── png.ts
│       ├── webp.ts       # MediaRecorder → WebM (animated WebP deferred)
│       ├── paletteJson.ts
│       └── css.ts
└── video/
    ├── decode.ts         # sample N frames from a trimmed clip
    └── trim.tsx          # dual-handle 30 s trim scrubber
```

## Decisions worth surfacing

- **OKLab everywhere**: palette extraction, mesh interpolation, keyframe
  interpolation, hue rotation. sRGB averaging produces brown midtones; the
  whole product hinges on smooth color transitions so this is non-optional.
- **WebGL2 renderer** with a single fullscreen fragment shader. Canvas 2D
  would be too slow for 4K and unworkable for animation.
- **Preview at 720p, export at full**: knob changes update the canvas in
  well under 100 ms.
- **Animated-WebP encoder deferred to WebM via MediaRecorder.** Documented
  on §9/§11 of the brief; trivially swappable later.
- **No persistence in v1.** A memory exists only as the files you export.

## Lineage

A conceptual descendant of [Gradient Studio](https://github.com/donny-son/gradient-studio).
This is a new product, not a refactor: studio framing → diary framing,
geometric gradient → painterly haze, image only → image *or* video,
PNG only → PNG + animated.
