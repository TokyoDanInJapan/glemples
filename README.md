# GLemples

A real-time, WebGL image-warping visualiser — a browser port of the classic
[Drempels](https://www.geisswerks.com/about_drempels.html) / Geiss warp.

- [Preview](https://glemples.vercel.app/)

## Quick start

```bash
npm install
npm run dev
```

Open the printed local URL, then **drop image files onto the window** to warp
them. Until you do, a procedural plasma texture plays as a fallback.

## How it works

Each frame the CPU computes a coarse grid (`UV_CELLS_X × UV_CELLS_Y`) of texture
coordinates. It blends seven independent warp **modes** — swirl, tunnel, zoom,
rotation and more — weighted by slowly cycling sinusoids.

The app uploads that grid to the GPU. A fragment shader then samples the source
image through the grid with **bicubic (Catmull-Rom) interpolation**, which gives
a smooth, seam-free warp. A second pass blends each frame with the previous one
to produce motion-blur trails.

```
computeWarpGrid (CPU)  ──►  warp grid texture  ──►  warp pass (GPU)  ──►  blit to canvas
                                                          ▲
                                                  previous frame (motion blur)
```

## Controls

The control panel appears when you move the pointer over the window. Touch
devices never hover, so on those the **☰** button in the top right opens the
panel.

| Control          | Effect                                       |
| ---------------- | -------------------------------------------- |
| Motion blur      | Strength of the frame-to-frame trails        |
| Warp amount      | Displacement strength of the primary warp    |
| Zoom             | Overall zoom in / out                        |
| Speed            | Animation speed                              |
| Texture interval | Seconds between automatic texture crossfades |
| Scroll wheel     | Zoom in / out                                |
| Drag-and-drop    | Drop image files to load and warp them       |

### Keyboard shortcuts

| Key       | Action                          |
| --------- | ------------------------------- |
| `Space`   | Crossfade to the next texture   |
| `P`       | Pause / resume                  |
| `F`       | Toggle fullscreen               |
| `↑` / `↓` | Increase / decrease motion blur |
| `+` / `-` | Zoom in / out                   |

## Configuration

Default parameters live in [`src/config.yaml`](src/config.yaml) and are loaded at
build time. Edit values there — grid resolution, texture size, crossfade timing,
starting warp settings — and the dev server hot-reloads them.

The app range-checks every value as it loads. A typo therefore fails at startup
and names the offending key, instead of propagating through the warp field as
`NaN`.

## Project structure

```
src/
  main.ts              Entry point: resolves DOM elements, reports startup failure
  config.yaml          Tunable defaults
  engine/              Rendering engine — no dependency on app code or config
    renderer.ts        Two-pass WebGL renderer (warp + blit, ping-pong FBOs)
    warp.ts            CPU warp-grid computation (7 blended modes)
    webgl-utils.ts     Low-level WebGL helpers
    shaders/           GLSL shaders (both passes share fullscreen.vert)
  app/                 App-specific glue
    app.ts             Assembles the engine and UI, owns the frame loop
    config.ts          Validated, typed accessors over config.yaml
    state.ts           Live state shared by the UI and the frame loop
    warp-animator.ts   Warp grid plus the morph between random warp states
    texture-manager.ts Image loading and pixel-slot management
    crossfade.ts       Texture crossfade state machine
    ui.ts              DOM controls, keyboard, drag-and-drop
scripts/
  release.mjs          Packages dist/ into a versioned zip
```

The engine takes its grid and texture dimensions as parameters, so it can be
reused at any size and tested without loading `config.yaml`.

## Scripts

| Command                | Description                           |
| ---------------------- | ------------------------------------- |
| `npm run dev`          | Start the Vite dev server             |
| `npm run build`        | Type-check and build for production   |
| `npm run preview`      | Preview the production build          |
| `npm run typecheck`    | Type-check `src`, `tests` and configs |
| `npm run lint`         | Run ESLint                            |
| `npm run format`       | Format with Prettier                  |
| `npm run format:check` | Check formatting without writing      |
| `npm test`             | Run the unit tests (Vitest)           |
| `npm run test:watch`   | Run tests in watch mode               |
| `npm run coverage`     | Run tests with a coverage report      |
| `npm run release`      | Build and zip a versioned release     |

## Releasing

`npm run release` produces a production build and packages it into a versioned,
self-contained zip:

```
releases/<version>.zip
```

The version comes from `package.json`. The archive holds the built page at its
root (`index.html` plus assets), so you can unzip it and serve it — or open it
directly — as a standalone release.

## Requirements

A browser with **WebGL** and the **`OES_texture_float`** extension (all current
desktop and mobile browsers qualify).

## Credits

GLemples is a WebGL port of **Drempels** by **Ryan Geiss**. See
[CREDITS.md](CREDITS.md) for full attribution.

## Licence

Licensed under the **GNU General Public License v3.0 or later**
(GPL-3.0-or-later). See [LICENSE](LICENSE) for the full text.

Source files carry an [SPDX](https://spdx.dev/) short-form identifier
(`SPDX-License-Identifier: GPL-3.0-or-later`) rather than the full notice.
