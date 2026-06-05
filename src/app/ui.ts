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
 * Wires DOM controls (sliders, buttons, keyboard, drag-and-drop) to the live
 * render state.
 *
 * @packageDocumentation
 */

import type { WarpParams } from "../engine/warp.js";
import type { CrossfadeController } from "./crossfade.js";

/**
 * Mutable state the UI reads from and writes to.
 *
 * @remarks
 * `motionBlur` and `paused` are boxed in `{ value }` objects so the UI can
 * mutate them in place while the render loop keeps the same reference.
 */
export interface UIBindings {
  /** Live warp parameters, mutated by the warp/zoom/speed sliders. */
  params: WarpParams;
  /** Boxed motion-blur amount, driven by the blur slider and arrow keys. */
  motionBlur: { value: number };
  /** Boxed pause flag, toggled by the pause button and `P` key. */
  paused: { value: boolean };
  /** Crossfade controller, driven by the interval slider and next-texture control. */
  crossfade: CrossfadeController;
  /** The pause button, whose label is updated on toggle. */
  pauseBtn: HTMLButtonElement;
}

/**
 * Attaches all input event listeners. Call once at startup.
 *
 * @param ui - The state and elements to bind (see {@link UIBindings}).
 */
export function bindUI(ui: UIBindings): void {
  const { params, motionBlur, paused, crossfade, pauseBtn } = ui;

  bindRange("blur", (v) => {
    motionBlur.value = 0.97 * Math.pow(v * 0.1, 0.27);
  });
  bindRange("warp", (v) => {
    params.warpFactor = v * 0.01 * 0.75;
  });
  bindRange("zoom", (v) => {
    params.masterZoom = v * 0.01;
  });
  bindRange("speed", (v) => {
    params.speedScale = v * 0.1;
  });
  bindRange("texint", (v) => {
    crossfade.interval = v;
  });

  document
    .getElementById("btnNextTex")!
    .addEventListener("click", () => crossfade.trigger());

  pauseBtn.addEventListener("click", () => togglePause(paused, pauseBtn));

  document
    .getElementById("btnFullscreen")!
    .addEventListener("click", toggleFullscreen);

  document.addEventListener("keydown", (e: KeyboardEvent) => {
    switch (e.key) {
      case " ":
        e.preventDefault();
        crossfade.trigger();
        break;
      case "p":
      case "P":
        togglePause(paused, pauseBtn);
        break;
      case "f":
      case "F":
        toggleFullscreen();
        break;
      case "ArrowUp":
        motionBlur.value = Math.min(0.97, motionBlur.value + 0.05);
        syncSlider("blur", motionBlurToSlider(motionBlur.value));
        break;
      case "ArrowDown":
        motionBlur.value = Math.max(0, motionBlur.value - 0.05);
        syncSlider("blur", motionBlurToSlider(motionBlur.value));
        break;
      case "+":
      case "=":
        params.masterZoom = Math.min(3, params.masterZoom * 1.1);
        syncSlider("zoom", params.masterZoom * 100);
        break;
      case "-":
        params.masterZoom = Math.max(0.01, params.masterZoom / 1.1);
        syncSlider("zoom", params.masterZoom * 100);
        break;
    }
  });

  document.addEventListener("dragover", (e: DragEvent) => {
    e.preventDefault();
    document.body.classList.add("dragging");
  });

  document.addEventListener("dragleave", (e: DragEvent) => {
    if (e.relatedTarget === null) document.body.classList.remove("dragging");
  });

  document.addEventListener("drop", (e: DragEvent) => {
    e.preventDefault();
    document.body.classList.remove("dragging");
    if (e.dataTransfer?.files.length) crossfade.dropFiles(e.dataTransfer.files);
  });
}

/**
 * Subscribes to an `<input type="range">`'s `input` event.
 *
 * @param id - Element id of the range input.
 * @param apply - Receives the parsed numeric value on each change.
 */
function bindRange(id: string, apply: (v: number) => void): void {
  document
    .getElementById(id)!
    .addEventListener("input", (e) =>
      apply(parseFloat((e.target as HTMLInputElement).value)),
    );
}

/**
 * Flips the pause flag and updates the button label.
 *
 * @param paused - Boxed pause flag to toggle.
 * @param btn - Button whose label reflects the new state.
 */
function togglePause(paused: { value: boolean }, btn: HTMLButtonElement): void {
  paused.value = !paused.value;
  btn.textContent = paused.value ? "Resume (P)" : "Pause (P)";
}

/** Enters fullscreen if not already in it, otherwise exits. */
function toggleFullscreen(): void {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
}

/**
 * Inverts the blur slider's response curve to recover its slider position.
 *
 * @param blur - Motion-blur amount.
 * @returns The equivalent slider value (0–10 scale × 10).
 */
function motionBlurToSlider(blur: number): number {
  return Math.round(Math.pow(blur / 0.97, 1 / 0.27) * 10);
}

/**
 * Writes a value back into a slider element (e.g. after a keyboard adjustment).
 *
 * @param id - Element id of the range input.
 * @param value - Value to set (rounded).
 */
function syncSlider(id: string, value: number): void {
  (document.getElementById(id) as HTMLInputElement).value = String(
    Math.round(value),
  );
}
