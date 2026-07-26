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
 * Assembles the renderer, texture pipeline and UI into a running application.
 *
 * @packageDocumentation
 */

import { Renderer } from "../engine/renderer.js";
import { TextureManager, makeProceduralTexture } from "./texture-manager.js";
import { CrossfadeController } from "./crossfade.js";
import { WarpAnimator } from "./warp-animator.js";
import { createAppState } from "./state.js";
import { bindUI, type UIElements } from "./ui.js";
import {
  UV_CELLS_X,
  UV_CELLS_Y,
  TEXTURE_SIZE,
  FADE_INTERVAL,
} from "./config.js";

/** Every DOM element the application needs. */
export interface AppElements {
  /** Canvas to render into. */
  canvas: HTMLCanvasElement;
  /** Element showing the frames-per-second readout. */
  fps: HTMLElement;
  /** Element showing the current texture's name. */
  texName: HTMLElement;
  /** The interactive controls. */
  controls: UIElements;
}

/** A constructed, startable application. */
export interface App {
  /** Begins the `requestAnimationFrame` loop. Idempotent. */
  start(): void;
  /** Halts the loop and detaches window listeners. */
  stop(): void;
}

/** How long to average frame times over before updating the FPS readout. */
const FPS_SAMPLE_SECONDS = 1.0;

/** Largest frame delta to trust, in seconds; clamps stalls and tab restores. */
const MAX_FRAME_DELTA = 0.1;

/**
 * Builds the application: creates the renderer, seeds the textures, binds the
 * UI, and prepares the frame loop.
 *
 * @param els - The DOM elements to drive.
 * @param textureUrls - Bundled texture URLs to seed the rotation pool with.
 * @returns The assembled {@link App}; call {@link App.start} to run it.
 * @throws If WebGL or `OES_texture_float` is unavailable.
 */
export function createApp(els: AppElements, textureUrls: string[]): App {
  const { canvas } = els;

  const renderer = new Renderer(canvas, {
    gridWidth: UV_CELLS_X,
    gridHeight: UV_CELLS_Y,
    textureSize: TEXTURE_SIZE,
  });

  const state = createAppState();
  const animator = new WarpAnimator({ cols: UV_CELLS_X, rows: UV_CELLS_Y });
  const tex = new TextureManager();

  // An instant placeholder so the first frame has something to warp; the
  // bundled textures replace it as soon as they decode.
  const fallback = makeProceduralTexture();
  tex.pixels[0] = fallback;
  tex.pixels[1] = fallback;
  renderer.uploadTexture(0, fallback);
  renderer.uploadTexture(1, fallback);

  const crossfade = new CrossfadeController(
    tex,
    renderer,
    els.texName,
    FADE_INTERVAL,
    () => animator.completeFade(),
  );

  bindUI(state, crossfade, els.controls);
  void crossfade.showUrls(textureUrls);

  // GPUs routinely evict long-running tabs; keep the loop alive through a
  // context loss and rebuild everything when the browser restores it.
  let contextLost = false;
  let resizePending = false;
  let running = false;
  let rafId = 0;

  let animTime = 0;
  let lastTime = 0;
  let frameCount = 0;
  let fpsTime = 0;

  function sizeCanvas(): void {
    // Render at native resolution on HiDPI screens, capped at 2x so 4K
    // displays don't quadruple the fill-rate cost.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    renderer.resize(canvas.width, canvas.height);
  }

  // Reallocating two full-screen textures per resize event is wasteful when a
  // window drag fires dozens a second, so collapse a burst into one.
  function onResize(): void {
    if (resizePending) return;
    resizePending = true;
    requestAnimationFrame(() => {
      resizePending = false;
      if (!contextLost) sizeCanvas();
    });
  }

  function onContextLost(e: Event): void {
    e.preventDefault(); // signal that we can handle a restore
    contextLost = true;
  }

  function onContextRestored(): void {
    try {
      renderer.restore();
      sizeCanvas();
      if (tex.pixels[0]) renderer.uploadTexture(0, tex.pixels[0]);
      if (tex.pixels[1]) renderer.uploadTexture(1, tex.pixels[1]);
      contextLost = false;
    } catch (err) {
      // The restored context lacks something we need. Stay in the lost state
      // rather than throwing out of an event handler: the loop keeps ticking
      // and a later restore may succeed.
      console.error("GLemples: failed to restore the WebGL context", err);
    }
  }

  function frame(now: number): void {
    rafId = requestAnimationFrame(frame);

    const dt = Math.min((now - lastTime) * 0.001, MAX_FRAME_DELTA);
    lastTime = now;

    if (!state.paused) {
      const speedMult =
        0.75 * Math.pow(8.0, 1.0 - state.params.speedScale * 0.1);
      const dAnim = dt * speedMult;

      animTime += dAnim;
      animator.advance(dAnim);
      crossfade.tick(dt);
    }

    animator.update(animTime, state.params, crossfade.fade);

    if (!contextLost)
      renderer.render(animator.grid, state.motionBlur, crossfade.fade);

    frameCount++;
    fpsTime += dt;

    if (fpsTime >= FPS_SAMPLE_SECONDS) {
      els.fps.textContent = `${Math.round(frameCount / fpsTime)} fps`;
      frameCount = 0;
      fpsTime = 0;
    }
  }

  return {
    start(): void {
      if (running) return;
      running = true;

      window.addEventListener("resize", onResize);
      canvas.addEventListener("webglcontextlost", onContextLost);
      canvas.addEventListener("webglcontextrestored", onContextRestored);

      sizeCanvas();
      lastTime = performance.now();
      rafId = requestAnimationFrame(frame);
    },

    stop(): void {
      if (!running) return;
      running = false;

      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
    },
  };
}
