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

const renderer = new Renderer(canvas);

window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  renderer.resize(canvas.width, canvas.height);
});

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
renderer.resize(canvas.width, canvas.height);

const tex = new TextureManager();
const fallback = makeProceduralTexture();

tex.pixels[0] = fallback;
tex.pixels[1] = fallback;

renderer.uploadTexture(0, fallback);
renderer.uploadTexture(1, fallback);

const params: WarpParams = { ...DEFAULT_WARP_PARAMS };
let warpState: WarpState = randomizeState();
const gridBuf: Float32Array = new Float32Array(UV_CELLS_X * UV_CELLS_Y * 2);
const motionBlur: { value: number } = { value: INITIAL_MOTION_BLUR };
const paused: { value: boolean } = { value: false };

const crossfade = new CrossfadeController(
  tex,
  renderer,
  texEl,
  FADE_INTERVAL,
  () => {
    warpState = randomizeState();
  },
);

bindUI({ params, motionBlur, paused, crossfade, pauseBtn });

// Register the bundled textures and show the first once it decodes; the
// procedural texture above stays on screen as the instant placeholder until then.
crossfade.showUrls([tex01Url, tex02Url]);

let animTime = 0;
let lastTime = performance.now();
let frameCount = 0;
let fpsTime = 0;

function frame(now: number): void {
  requestAnimationFrame(frame);

  const dt = Math.min((now - lastTime) * 0.001, 0.1);
  lastTime = now;

  if (!paused.value) {
    const speedMult = 0.75 * Math.pow(8.0, 1.0 - params.speedScale * 0.1);

    animTime += dt * speedMult;

    crossfade.tick(dt);
  }

  computeWarpGrid(animTime, params, warpState, gridBuf);
  renderer.render(gridBuf, motionBlur.value, crossfade.fade);

  frameCount++;
  fpsTime += dt;

  if (fpsTime >= 1.0) {
    fpsEl.textContent = `${Math.round(frameCount / fpsTime)} fps`;
    frameCount = 0;
    fpsTime = 0;
  }
}

requestAnimationFrame(frame);
