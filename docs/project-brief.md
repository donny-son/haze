# Gradient Memories — Project Brief

> Handoff document for the agent bootstrapping a **new repository** for this
> project. Everything below is the result of a brainstorming session between
> the project owner and a prior agent. Decisions marked **LOCKED** were
> explicitly chosen by the owner and should not be relitigated without asking.
> Items marked **OPEN** are deliberately left for the implementing agent to
> decide (with a suggested default in most cases).

---

## 1. Core thesis

A single photo or short video collapses into one **abstract haze artifact** — a
soft, gradient-like color composition that captures the *feel* of the moment
without reproducing the image. The artifact is **reusable**: a wallpaper, a
palette, a CSS gradient, an editor theme seed.

The product is memory-first, not studio-first. The user drops a moment in;
they get a vivid abstraction out. Knobs exist, but the default output should
already feel right.

One-liner: **"Turn a photo or video into a reusable color memory."**

---

## 2. Lineage and origin context

This project is a conceptual descendant of **Gradient Studio**
(https://github.com/donny-son/gradient-studio), an existing React/Vite app
that extracts a 5-color palette from an uploaded image and renders it as a
geometric gradient (linear / radial / conic / glow) with knobs for angle,
girth, band width, grain, and export.

Gradient Memories shares the *palette-from-image* primitive but diverges
sharply in intent and aesthetic:

| Axis            | Gradient Studio (existing)        | Gradient Memories (new)          |
| --------------- | --------------------------------- | -------------------------------- |
| Framing         | Studio — you tune a gradient      | Diary — you derive a memory      |
| Source          | Image only                        | Image **or short video**         |
| Output shape    | Geometric gradient                | Soft haze / painterly bloom      |
| Output media    | PNG                               | PNG (photo) + animated WebP (video) |
| Composition     | Abstract / decorative             | Optionally faithful to source    |
| Reusability     | Wallpaper                         | Wallpaper + palette + CSS + (later) themes |

**Reuse what's reusable from gradient-studio**: the palette-extraction approach
(`colorthief`-based), color helpers (`hexToRgb`, `samplePalette`, easing),
device export presets (4K desktop 3840×2160, phone 1290×2796). See
`src/lib/gradients.ts` in the original repo for prior art.

**Do NOT port** the geometric gradient engines or the existing UI layout —
this is a new product, not a refactor.

---

## 3. Locked product decisions

1. **LOCKED — Source**: a single photo *or* a single short video. One source
   = one memory.
2. **LOCKED — Local-only**: all processing in the browser. No uploads, no
   accounts, no server. Privacy is a positioning advantage.
3. **LOCKED — Output format**:
   - Photo memory → **PNG** (still) and optionally **animated WebP** (ambient
     breath loop — see §5).
   - Video memory → **animated WebP** (lossless mode preferred for smooth
     haze; falls back to high-quality lossy if size is prohibitive).
   - **GIF is explicitly rejected** as a default — its 256-color palette
     bands badly on smooth gradients. Offer GIF only as a secondary export
     if it falls out cheaply.
4. **LOCKED — Aesthetic**: free-floating haze by default, with "match source
   composition" as an opt-in toggle that reveals a `0 → 1` slider morphing
   from free-floating toward faithful layout.
5. **LOCKED — Engine architecture**: three stackable layers with weight
   sliders (see §4). Not a giant list of effects.
6. **LOCKED — Video duration cap**: **30 seconds**. Longer uploads must be
   trimmable via a scrubber before processing.
7. **LOCKED — Both motion sources for video**: keyframed (from the video's
   color story) + ambient breath (low-frequency noise drift). For photos,
   ambient breath is the only motion source if the user chooses to export
   an animated photo memory.
8. **LOCKED — New repository**: this is not a route inside gradient-studio.
   It's a standalone project.

---

## 4. The haze engine

Three stackable layers compose the final image. Each has a weight slider
(0 → 1); the user blends them. Defaults should produce a pleasing result with
zero tweaking.

### Layer A — Bloom
Heavy gaussian blur of a downsampled source, then upscaled. Acts as the
*ghost silhouette* of the original — colors land roughly where they were in
the source. This is the layer that does the heavy lifting when "match source
composition" is on.

### Layer B — Anchored gradient mesh
Extract palette (default 5–8 colors). Place each color as an anchor:
- **Free-floating mode** (default): anchors are scattered using a low-discrepancy
  distribution (e.g. Poisson-disk) — visually balanced but not tied to source
  layout.
- **Faithful mode** (composition slider > 0): anchors placed at the centroid
  of each color's occurrences in the source image. The slider lerps anchor
  positions between free-floating and faithful.

Anchors radiate as soft radial glows; overlapping glows blend in perceptual
color space (Lab or OKLab, **not** sRGB — sRGB averaging produces muddy
midtones). Mesh interpolation gives painterly soft regions.

### Layer C — Atmospheric noise
Perlin or simplex noise modulating hue and lightness across the canvas.
Breaks up banding, adds the "haze" quality. This is also where ambient
breath lives (see §5).

### Compositing
`final = blend(bloom * wA, mesh * wB, noise * wC) + grain`

Grain is a small additive layer (carry from gradient-studio's film grain
implementation). Optional vignette.

### Customization surface (the "knobs")
Keep this small. Suggested v1:
- Layer weights: `bloom`, `mesh`, `noise` (3 sliders)
- `composition`: 0 → 1 (only visible when "match source" toggled on)
- `paletteSize`: 3 / 5 / 8
- `softness`: global blur multiplier
- `grain`: 0 → 1
- `seed`: integer (resamples noise + anchor scatter — gives the user
  "re-roll" variants of the same memory)

---

## 5. Animation model (video memories + animated photos)

Two motion sources, both running simultaneously when applicable.

### Source 1 — Keyframed (video only)
- Decode the source video using **WebCodecs API** (preferred) or
  `<video>` + canvas fallback.
- Sample **12–24 frames evenly across the clip**. Each sampled frame yields
  a palette + (in faithful mode) a set of anchor centroids.
- Each sample becomes a keyframe in the output animation. Palette colors
  and anchor positions interpolate smoothly (OKLab for color, eased
  linear/Catmull-Rom for positions) between keyframes.
- Output animation duration = source duration, capped at 30s.
- Output loop is seamless: cross-fade the last ~5% of the animation back
  toward the first keyframe so it wraps cleanly.

### Source 2 — Ambient breath (always on)
- Low-frequency noise (e.g. 0.1 Hz) drifts:
  - Anchor positions by a small radius (±2–5% of canvas).
  - A subtle hue rotation (±2°) on each anchor color.
- Gives the haze a "living" quality even on stills.
- For an animated photo export, breath is the only motion source.

### Output specs (suggested defaults)
- Framerate: **24 fps**
- Animated WebP, lossless or near-lossless quality
- Resolution: respect chosen export preset (phone / desktop / custom)
- Estimated size at 30s × 24fps × 1080p lossless WebP: a few MB. If too
  large, fall back to high-quality lossy WebP (quality ≥ 90).

---

## 6. Export surface

From one source memory, the user can export:

**v1 (ship)**:
- High-resolution **PNG** (desktop 4K, phone, custom)
- Animated **WebP** (for video sources; optional for photo sources)
- **Palette JSON**: `[{ hex, weight, x, y }]` — colors with their normalized
  anchor positions
- **CSS gradient string**: a best-effort `linear-gradient(...)` or
  `radial-gradient(...)` approximation derived from the palette + anchors

**Deferred (later)**:
- VS Code / Zed theme JSON (semantic mapping: bg / fg / accent / error /
  warning → palette slots — requires opinion, not just data)
- Tailwind config snippet
- Adobe `.ase` / macOS `.clr` swatch
- Figma plugin payload
- Live wallpaper / MP4

---

## 7. UX flow

1. **Drop** — single drop zone accepts image (jpg, png, webp, heic if
   feasible) or video (mp4, mov, webm). On video upload, show a trim
   scrubber (max 30s).
2. **Auto-render** — instant default haze preview at preview resolution
   (e.g. 720p). No "process" button.
3. **Tweak** — control panel on the side: layer weights, palette size,
   softness, grain, seed. "Match source composition" toggle reveals
   composition slider when on.
4. **Export panel** — separate panel listing all export formats with file
   size estimates and a single "Export" button per format. Exports render
   at full target resolution (preview was downscaled for speed).
5. **No library, no accounts.** A memory exists only as its exported
   files. (Persistence to OPFS / localStorage is a possible follow-up but
   explicitly out of v1.)

---

## 8. v1 scope vs deferred

### v1 (ship this)
- Drop zone (image + video, with 30s trim for video)
- Three-layer engine (bloom + mesh + noise) with weight sliders
- Free-floating mode default, composition opt-in with 0→1 slider
- Ambient breath always on; keyframed animation for video
- Preview at downscaled resolution, export at full
- Exports: PNG, animated WebP, palette JSON, CSS gradient string
- Phone + 4K desktop presets, plus a custom resolution input

### Deferred (do not build in v1)
- Editor theme exports (VS Code, Zed, etc.)
- Tailwind / ASE / CLR exports
- Persistent library / memory gallery
- Authentication, sync, sharing
- Mobile-first UI (desktop-first is fine for v1)
- Multiple sources per memory (album / aggregated mode)
- Real-time WebGPU live wallpaper

---

## 9. Tech notes

### Suggested stack (carry forward where it makes sense)
- **React 19 + TypeScript + Vite + Tailwind v4** — proven in gradient-studio,
  no reason to change.
- **colorthief** for initial palette extraction. Consider augmenting with a
  k-means pass in OKLab for better perceptual palettes.
- **WebCodecs API** for video frame extraction (much faster than the
  `<video>` + canvas trick on modern browsers). Feature-detect; fall back if
  unavailable.
- **WebGL2 or WebGPU** for the renderer. Canvas 2D will be too slow for
  animated 4K output. Suggested middle ground: a thin wrapper like `ogl` or
  `regl`. WebGPU is faster and cleaner where supported but adoption is still
  partial — WebGL2 is the safer default for v1.
- **Animated WebP encoding** — this is the highest engineering risk. There
  is no native browser API for encoding animated WebP. Options:
  - `libwebp` compiled to WASM (the reference encoder; supports animation
    via `webpmux`). Largest blob but highest quality.
  - Off-the-shelf JS libraries — most only do single-frame WebP. Verify
    animation support before adopting.
  - Worst case fallback: encode to **animated PNG (APNG)** instead — there
    are mature JS encoders. Larger files but simpler. Or encode to WebM via
    `MediaRecorder` (different format, smaller, but it's video not an image).
  - **Action**: prototype the encoder pipeline first. If animated WebP via
    WASM proves painful, escalate to the owner before committing — APNG or
    WebM may be acceptable substitutes.

### Color math
- Do all blending and interpolation in **OKLab** (or at minimum Lab), not
  sRGB. The whole product hinges on smooth color transitions; sRGB
  averaging will make every output look brown.
- A small color-space helper module (`src/engine/color.ts`) should expose
  `rgbToOklab`, `oklabToRgb`, `mixOklab`.

### Performance budget
- Preview must update in **< 100 ms** on a moderate laptop after a knob
  change. This rules out full-resolution rendering during interaction —
  render preview at e.g. 720p, full-res only on export.
- Animated export of 30s at 24fps = 720 frames. Encode off the main thread
  in a Web Worker.

---

## 10. Suggested repo structure

```
gradient-memories/
├── README.md
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── public/
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── engine/
    │   ├── color.ts            # OKLab helpers
    │   ├── palette.ts          # extract palette from image / video frame
    │   ├── composition.ts      # anchor placement (free + faithful + lerp)
    │   ├── layers/
    │   │   ├── bloom.ts
    │   │   ├── mesh.ts
    │   │   └── noise.ts
    │   ├── renderer.ts         # WebGL composite + grain
    │   ├── animator.ts         # keyframe interpolation + ambient breath
    │   └── encoders/
    │       ├── png.ts
    │       ├── webp.ts         # animated WebP via WASM
    │       ├── paletteJson.ts
    │       └── css.ts
    ├── video/
    │   ├── decode.ts           # WebCodecs + fallback
    │   └── trim.tsx            # 30s trim scrubber
    └── components/
        ├── DropZone.tsx
        ├── PreviewCanvas.tsx
        ├── ControlPanel.tsx
        └── ExportPanel.tsx
```

Flat and explicit. No premature abstraction.

---

## 11. Known risks

1. **Animated WebP encoding in-browser** — see §9. Highest unknown.
   Prototype first.
2. **Muddy color blending in sRGB** — mitigated by OKLab. Do not skip this.
3. **Performance of layered blur + noise at 4K** — needs GPU. Don't try
   this in Canvas 2D.
4. **Video decode performance on long clips** — capped at 30s, but even
   that's ~720 frames decoded for sampling. Use WebCodecs and sample
   sparsely (12–24 frames, not all frames).
5. **HEIC support** — iPhone photos. Browsers don't decode HEIC natively
   on most platforms. Either reject HEIC with a clear message, or pull in
   a WASM HEIC decoder (extra weight). Defer the decision until a user hits
   it.
6. **Memory for animated export** — 720 frames at 4K is gigabytes of
   uncompressed RGBA. Stream frames through the encoder, don't buffer them
   all.

---

## 12. Suggested implementation milestones

Order matters — earlier milestones de-risk later ones.

1. **M1 — Encoder spike (1–2 days)**. Standalone test: produce a 5-second
   animated WebP from a programmatically generated gradient sequence. Decide
   WebP vs APNG vs WebM here. **Stop and ask** if the chosen path proves
   painful.
2. **M2 — Palette + free-floating mesh (still image)**. Drop a photo, get
   a static mesh haze export as PNG. No bloom, no noise yet, no composition.
3. **M3 — Add bloom + noise layers**. Three-layer compositing working,
   weights wired to sliders.
4. **M4 — Composition opt-in**. Faithful mode + slider lerp.
5. **M5 — Video pipeline**. WebCodecs decode, 30s trim UI, keyframe
   sampling, animated WebP export.
6. **M6 — Ambient breath**. Animation even for stills.
7. **M7 — Remaining exports**. Palette JSON, CSS string, device presets.
8. **M8 — Polish**. Empty states, error handling at the file-input boundary,
   keyboard shortcuts, README.

---

## 13. Open questions left for the implementer

These were not pinned during the brainstorm. Suggested defaults given;
escalate if the default proves wrong.

- **Default palette size**: suggested **5**. Range 3–8.
- **Anchor distribution algorithm in free-floating mode**: suggested
  **Poisson-disk**. Hexagonal grid is a fine alternative.
- **Preview resolution**: suggested **720p (1280×720)**.
- **Animated WebP framerate**: suggested **24 fps**. 30 if size permits.
- **Trim UI for video**: suggested **dual-handle scrubber** with a frame
  thumbnail strip behind it.
- **Branding / app name**: "Gradient Memories" is a working title — the
  owner has not committed to it. Confirm before putting it in the README,
  page `<title>`, or anywhere visible.
- **License**: gradient-studio is MIT. Suggest matching unless told
  otherwise.

---

## 14. What this document is NOT

- Not a spec. It's a brief — enough context to make decisions, not enough
  to remove judgment.
- Not exhaustive. Anything not mentioned is open.
- Not permission to expand scope. The v1 list in §8 is the v1 list.

When in doubt: build the smallest version that demonstrates the thesis in
§1, then ship it.
