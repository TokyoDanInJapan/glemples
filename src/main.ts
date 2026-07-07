// GLemples — real-time WebGL image warper
// Copyright (C) 2026 Daniel Hebberd
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Application entry point.
 *
 * @remarks
 * Wires the engine ({@link Renderer}, {@link computeWarpGrid}) to the app glue
 * ({@link TextureManager}, {@link CrossfadeController}, {@link bindUI}), then runs
 * the `requestAnimationFrame` loop that advances time, recomputes the warp grid,
 * and renders each frame.
 *
 * @packageDocumentation
 */

import { Renderer } from "./engine/renderer.js";

import {
  TextureManager,
  makeProceduralTexture,
} from "./app/texture-manager.js";

import {
  computeWarpGrid,
  randomizeState,
  WarpParams,
  WarpState,
} from "./engine/warp.js";

import { CrossfadeController } from "./app/crossfade.js";
import { bindUI } from "./app/ui.js";

import tex01Url from "./assets/tex01.png";
import tex02Url from "./assets/tex02.png";

import {
  UV_CELLS_X,
  UV_CELLS_Y,
  DEFAULT_WARP_PARAMS,
  FADE_INTERVAL,
  INITIAL_MOTION_BLUR,
} from "./app/config.js";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const fpsEl = document.getElementById("fps")!;
const texEl = document.getElementById("texname")!;
const pauseBtn = document.getElementById("btnPause") as HTMLButtonElement;

/** Replaces the page with a visible message when WebGL can't start. */
function showFatalError(err: unknown): never {
  const msg = document.createElement("div");
  msg.style.cssText =
    "position:fixed;inset:0;display:flex;align-items:center;" +
    "justify-content:center;font-family:monospace;color:#ccc;" +
    "text-align:center;padding:24px";
  msg.textContent =
    "GLemples needs WebGL to run, but it isn't available in this browser: " +
    (err instanceof Error ? err.message : String(err));
  document.body.appendChild(msg);
  throw err;
}

let renderer: Renderer;
try {
  renderer = new Renderer(canvas);
} catch (err) {
  showFatalError(err);
}

function sizeCanvas(): void {
  // Render at native resolution on HiDPI screens, capped at 2x so 4K
  // displays don't quadruple the fill-rate cost.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  renderer.resize(canvas.width, canvas.height);
}

window.addEventListener("resize", sizeCanvas);
sizeCanvas();

// GPUs routinely evict long-running tabs; keep the loop alive through a
// context loss and rebuild everything when the browser restores it.
let contextLost = false;

canvas.addEventListener("webglcontextlost", (e) => {
  e.preventDefault(); // signal that we can handle a restore
  contextLost = true;
});

canvas.addEventListener("webglcontextrestored", () => {
  renderer.restore();
  sizeCanvas();
  if (tex.pixels[0]) renderer.uploadTexture(0, tex.pixels[0]);
  if (tex.pixels[1]) renderer.uploadTexture(1, tex.pixels[1]);
  contextLost = false;
});

const tex = new TextureManager();
const fallback = makeProceduralTexture();

tex.pixels[0] = fallback;
tex.pixels[1] = fallback;

renderer.uploadTexture(0, fallback);
renderer.uploadTexture(1, fallback);

const params: WarpParams = { ...DEFAULT_WARP_PARAMS };
let warpState: WarpState = randomizeState();
// The state the warp is morphing *towards* during a crossfade, or null when no
// crossfade is in progress. Chosen when the fade starts and promoted to
// `warpState` when it finishes, so the warp field is never replaced in a single
// frame (which read as a sudden jump).
let warpStateNext: WarpState | null = null;
const gridBuf: Float32Array = new Float32Array(UV_CELLS_X * UV_CELLS_Y * 2);
// Scratch grid for the incoming warp state, blended into `gridBuf` by the fade.
const gridBufNext: Float32Array = new Float32Array(UV_CELLS_X * UV_CELLS_Y * 2);
const motionBlur: { value: number } = { value: INITIAL_MOTION_BLUR };
const paused: { value: boolean } = { value: false };

const crossfade = new CrossfadeController(
  tex,
  renderer,
  texEl,
  FADE_INTERVAL,
  () => {
    // Fade complete: the morph has fully reached the incoming state, so adopt it.
    if (warpStateNext) {
      warpState = warpStateNext;
      warpStateNext = null;
    }
  },
);

bindUI({ params, motionBlur, paused, crossfade, pauseBtn });

// Register the bundled textures and show the first once it decodes; the
// procedural texture above stays on screen as the instant placeholder until then.
crossfade.showUrls([tex01Url, tex02Url]);

let animTime = 0;
// Accumulated base-rotation angle. Integrated each frame from the current
// state's rotationalSpeed so re-randomising warpState changes only the rate,
// never the absolute angle — otherwise the field would snap (a visible judder)
// every time a crossfade completes.
let warpRotation = 0;
let lastTime = performance.now();
let frameCount = 0;
let fpsTime = 0;

function frame(now: number): void {
  requestAnimationFrame(frame);

  const dt = Math.min((now - lastTime) * 0.001, 0.1);
  lastTime = now;

  if (!paused.value) {
    const speedMult = 0.75 * Math.pow(8.0, 1.0 - params.speedScale * 0.1);
    const dAnim = dt * speedMult;

    animTime += dAnim;
    // Advance the angle with the current rate *before* tick() may re-roll the
    // state, so this frame uses the rate the previous frame ended on.
    warpRotation += dAnim * warpState.rotationalSpeed * Math.PI * 2;

    crossfade.tick(dt);
  }

  // A crossfade is starting (or running): pick the warp state to morph towards
  // so the field eases from old to new over the fade instead of snapping at the
  // end. The texture crossfade masks the morph.
  if (crossfade.fade > 0 && !warpStateNext) warpStateNext = randomizeState();

  computeWarpGrid(animTime, params, warpState, warpRotation, gridBuf);

  if (warpStateNext) {
    computeWarpGrid(animTime, params, warpStateNext, warpRotation, gridBufNext);
    const f = crossfade.fade;
    for (let i = 0; i < gridBuf.length; i++)
      gridBuf[i] += (gridBufNext[i] - gridBuf[i]) * f;
  }

  if (!contextLost) renderer.render(gridBuf, motionBlur.value, crossfade.fade);

  frameCount++;
  fpsTime += dt;

  if (fpsTime >= 1.0) {
    fpsEl.textContent = `${Math.round(frameCount / fpsTime)} fps`;
    frameCount = 0;
    fpsTime = 0;
  }
}

requestAnimationFrame(frame);
