# GLemples

A real-time, WebGL image-warping visualiser - a browser port of the classic [Drempels](https://www.geisswerks.com/about_drempels.html) / Geiss warp.

## Quick start

```bash
npm install
npm run dev
```

Open the printed local URL, then **drop image files onto the window** to warp them. Until you do, a procedural plasma texture plays as a fallback.

## How it works

Each frame the CPU computes a coarse grid (`UV_CELLS_X × UV_CELLS_Y`) of texture coordinates by blending seven independent warp **modes** - swirl, tunnel, zoom, rotation, and more - weighted by slowly cycling sinusoids.

That grid is uploaded to the GPU, where a fragment shader samples the source image through it using **bicubic (Catmull-Rom) interpolation** for a smooth, seam-free warp. A second pass blends each frame with the previous one to produce motion-blur trails.

```
computeWarpGrid (CPU)  ──►  warp grid texture  ──►  warp pass (GPU)  ──►  blit to canvas
                                                          ▲
                                                  previous frame (motion blur)
```

## Controls

| Control       | Effect                                       |
| ------------- | -------------------------------------------- |
| Motion blur   | Strength of the frame-to-frame trails        |
| Warp amount   | Displacement strength of the primary warp    |
| Zoom          | Overall zoom in/out                          |
| Speed         | Animation speed                              |
| Tex interval  | Seconds between automatic texture crossfades |
| Scroll wheel  | Zoom in / out                                |
| Drag-and-drop | Drop image files to load and warp them       |

### Keyboard shortcuts

| Key       | Action                          |
| --------- | ------------------------------- |
| `Space`   | Crossfade to the next texture   |
| `P`       | Pause / resume                  |
| `F`       | Toggle fullscreen               |
| `↑` / `↓` | Increase / decrease motion blur |
| `+` / `-` | Zoom in / out                   |

## Configuration

Default parameters live in [`src/config.yaml`](src/config.yaml) and are loaded at build time. Edit values there - grid resolution, texture size, crossfade timing,
initial warp settings - and the dev server hot-reloads them.

## Project structure

```
src/
  main.ts              Entry point: wires everything together, runs the frame loop
  config.yaml          Tunable defaults
  engine/              Reusable rendering engine
    renderer.ts        Two-pass WebGL renderer (warp + blit, ping-pong FBOs)
    warp.ts            CPU warp-grid computation (7 blended modes)
    webgl-utils.ts     Low-level WebGL helpers
    shaders/           GLSL vertex/fragment shaders
  app/                 App-specific glue
    config.ts          Typed accessors over config.yaml
    texture-manager.ts Image loading and pixel-slot management
    crossfade.ts       Texture crossfade state machine
    ui.ts              DOM controls, keyboard, drag-and-drop
```

## Scripts

| Command                | Description                         |
| ---------------------- | ----------------------------------- |
| `npm run dev`          | Start the Vite dev server           |
| `npm run build`        | Type-check and build for production |
| `npm run preview`      | Preview the production build        |
| `npm run lint`         | Run ESLint                          |
| `npm run format`       | Format with Prettier                |
| `npm run format:check` | Check formatting without writing    |
| `npm test`             | Run the unit tests (Vitest)         |
| `npm run test:watch`   | Run tests in watch mode             |
| `npm run coverage`     | Run tests with a coverage report    |
| `npm run release`      | Build and zip a versioned release   |

## Releasing

`npm run release` produces a production build and packages it into a versioned,
self-contained zip:

```
releases/glemples-<version>.zip
```

The version is read from `package.json`. The archive contains the built page at
its root (`index.html` plus assets), so it can be unzipped and served — or
opened directly — as a standalone release.

## Requirements

A browser with **WebGL** and the **`OES_texture_float`** extension (all current
desktop and mobile browsers qualify).

## Credits

GLemples is a WebGL port of **Drempels** by **Ryan Geiss**. See
[CREDITS.md](CREDITS.md) for full attribution.

## License

Licensed under the **GNU General Public License v3.0 or later** (GPL-3.0-or-later).
See [LICENSE](LICENSE) for the full text.
