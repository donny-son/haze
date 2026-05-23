# haze

Turn a photo or video into a reusable color memory.

`haze` is a local-only browser app concept for generating soft, abstract haze artifacts from a single photo or short video. The output is meant to feel like a memory rather than reproduce the source image: wallpaper-ready PNGs, animated WebP memories, palettes, and CSS gradients.

## Project brief

The implementation brief is tracked in [`docs/project-brief.md`](docs/project-brief.md). It includes locked product decisions, engine architecture, animation/export notes, risks, and suggested milestones.

## Locked principles

- Single source in, one memory out.
- Browser-local processing only: no uploads, accounts, or server.
- Soft haze / painterly bloom aesthetic by default.
- Three-layer engine: bloom, anchored gradient mesh, atmospheric noise.
- Photo exports as PNG, video exports as animated WebP where feasible.

## Status

New repository initialized from the project brief. Implementation has not started yet.
