# GLemples

A WebGL port of the Drempels / Geiss image warp. See [README.md](README.md) for
what it is and how to run it; this file records things that are easy to break.

## Commands

```bash
npm run dev         # dev server
npm run typecheck   # tsc over src, tests and the config files
npm run lint        # type-aware ESLint
npm test            # vitest
npm run build       # typecheck + vite build
```

`npm run typecheck` uses `tsconfig.test.json`, which widens the shipping
`tsconfig.json` (src only) to cover tests and `*.config.ts`. Point new tooling at
the test project, not the base one, or tests silently go unchecked. `tsc` never
emits — Vite owns the bundle.

## Constraints worth knowing

**The warp maths is a port, not a design.** `src/engine/warp.ts` reproduces
Drempels' original algorithm, including quirks that look like bugs — most
visibly `modeZoomRotate` using `t3uc` for both offsets. Changing the constants
changes the look. Verify against the original before "fixing" anything there.

**Rotation must be integrated, never derived.** `WarpAnimator` accumulates the
base rotation angle from the current state's `rotationalSpeed`. Deriving the
angle from the state instead makes the field snap every time a crossfade rolls a
new state.

**Warp states morph, they don't swap.** A new state is chosen when a texture
crossfade starts and blended in across the whole fade, then adopted at the end.
Replacing the state in a single frame is a visible jump.

**`engine/` must not import from `app/`.** The renderer and warp take their
dimensions as parameters. This is what lets the tests run the engine at sizes
other than whatever `config.yaml` says.

**Textures are `REPEAT`-wrapped in WebGL1**, so `texture_size` must stay a power
of two, and source images are scaled to fill rather than cropped — cropping
would break the seam on tiling images. `config.ts` enforces the power-of-two
rule at load.

**Slider ranges and value mappings live only in the `SLIDERS` table** in
`app/ui.ts`, which also sets `min`/`max`/`step` on the elements. `index.html`
deliberately carries none of them. `toValue` and `toSlider` must stay exact
inverses or the knob and the value drift apart.

## Dependency pins

`overrides` in `package.json` forces `js-yaml` ≥ 4.3.0 and `brace-expansion` ≥
5.0.8; both transitive deps ship advisory-affected versions otherwise. Dependabot
holds TypeScript below 6 until typescript-eslint supports it.

## Assets

`src/assets/*.webp` are 1024² lossy WebP, matching `texture_size`. They were
4.6 MB of PNG before; if you replace them, re-encode at the same size rather
than committing multi-megabyte originals that get downscaled at load anyway.
