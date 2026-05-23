# haze

Turn a photo into a reusable color memory.

`haze` is a local-only browser app that distills a photo into a soft, painterly
haze artifact — colors that *feel like* the source rather than reproduce it. The
output is reusable as a wallpaper PNG, a palette JSON, and a CSS gradient.

The implementation brief lives in [`docs/project-brief.md`](docs/project-brief.md).

## What's in this MVP

- React 19 + TypeScript + Vite + Tailwind v4 scaffold.
- OKLab color helpers (`src/engine/color.ts`) — perceptual blending.
- Seeded deterministic anchor placement with free-floating / faithful modes
  and a lerp slider (`src/engine/composition.ts`).
- K-means-lite palette extraction in OKLab (`src/engine/palette.ts`).
- Canvas 2D renderer compositing bloom + radial mesh + atmospheric value
  noise + grain (`src/engine/renderer.ts`).
- Exports: PNG (from canvas), palette JSON, CSS gradient (download or copy).
- Vitest engine tests for color, composition, encoders, and the haze helpers.

## What's deferred

- Video decode / 30s trim UI.
- WebCodecs frame sampling and animated WebP encoding (highest-risk spike).
- Ambient breath animation loop on stills.
- WebGL2 / WebGPU renderer (Canvas 2D is sufficient for the still-image v0).
- Editor theme exports, ASE / CLR, Figma plugin payload, persistent library.

## Commands

```bash
npm install        # install deps
npm run dev        # vite dev server
npm test -- --run  # run vitest once
npm test           # vitest watch mode
npm run build      # type-check + production bundle
npm run preview    # preview the production build
```

## Current limitations

- Renderer is Canvas 2D, single-resolution preview (1280×720). 4K export
  and animated formats arrive with the WebGL pass.
- Bloom uses CSS `filter: blur()` on the canvas, which falls back gracefully
  on browsers that don't support it but produces a softer result there.
- Palette extraction runs on a 64×64 downsample for speed; very small color
  regions in the source may not survive k-means.
- HEIC inputs are not supported. The drop zone accepts PNG / JPEG / WebP.

## License

MIT (carried forward from `gradient-studio`'s licensing intent — confirm with
the owner if a different license is preferred).
