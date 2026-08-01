// GLemples — real-time WebGL image warper
// Copyright (C) 2026 Daniel Hebberd
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Wires DOM controls (sliders, buttons, keyboard, drag-and-drop) to the live
 * render state.
 *
 * @packageDocumentation
 */

import type { CrossfadeController } from "./crossfade.js";
import type { AppState } from "./state.js";
import { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from "./config.js";

/** The DOM elements the UI drives. Supplied by the caller so this is testable. */
export interface UIElements {
  /** Motion-blur slider. */
  blur: HTMLInputElement;
  /** Warp-amount slider. */
  warp: HTMLInputElement;
  /** Zoom slider. */
  zoom: HTMLInputElement;
  /** Animation-speed slider. */
  speed: HTMLInputElement;
  /** Crossfade-interval slider. */
  texint: HTMLInputElement;
  /** Advances to the next texture. */
  nextTex: HTMLButtonElement;
  /** Toggles pause; its label reflects the current state. */
  pause: HTMLButtonElement;
  /** Toggles fullscreen. */
  fullscreen: HTMLButtonElement;
  /** Shows/hides the control panel on devices without hover. */
  toggle: HTMLButtonElement;
}

/** What a slider reads from and writes to. */
interface Model {
  state: AppState;
  crossfade: CrossfadeController;
}

/**
 * One slider's complete definition: its DOM range, the state it edits, and the
 * mapping between slider position and state value.
 *
 * @remarks
 * Keeping `toValue` and `toSlider` adjacent is the point of this table. They are
 * inverses of each other, and previously lived ~150 lines apart, so a change to
 * one silently desynchronised the other.
 */
interface SliderSpec {
  /** Element key in {@link UIElements}. */
  id: "blur" | "warp" | "zoom" | "speed" | "texint";
  /** Minimum slider position. */
  min: number;
  /** Maximum slider position. */
  max: number;
  /** Slider position granularity. */
  step: number;
  /** Reads the current state value. */
  get(m: Model): number;
  /** Writes a new state value. */
  set(m: Model, value: number): void;
  /** Maps a slider position to a state value. */
  toValue(pos: number): number;
  /** Maps a state value back to a slider position. Inverse of {@link toValue}. */
  toSlider(value: number): number;
}

const SLIDERS: readonly SliderSpec[] = [
  {
    id: "blur",
    min: 0,
    max: 10,
    step: 1,
    get: (m) => m.state.motionBlur,
    set: (m, v) => {
      m.state.motionBlur = v;
    },
    // Perceptual curve: blur is far more sensitive near the top of the range.
    toValue: (pos) => 0.97 * Math.pow(pos * 0.1, 0.27),
    toSlider: (v) => Math.pow(v / 0.97, 1 / 0.27) * 10,
  },
  {
    id: "warp",
    min: 0,
    max: 100,
    step: 1,
    get: (m) => m.state.params.warpFactor,
    set: (m, v) => {
      m.state.params.warpFactor = v;
    },
    toValue: (pos) => pos * 0.0075,
    toSlider: (v) => v / 0.0075,
  },
  {
    id: "zoom",
    min: 1,
    max: 300,
    step: 1,
    get: (m) => m.state.params.masterZoom,
    set: (m, v) => {
      m.state.params.masterZoom = v;
    },
    toValue: (pos) => pos * 0.01,
    toSlider: (v) => v * 100,
  },
  {
    id: "speed",
    min: 10,
    max: 300,
    step: 1,
    get: (m) => m.state.params.speedScale,
    set: (m, v) => {
      m.state.params.speedScale = v;
    },
    toValue: (pos) => pos * 0.1,
    toSlider: (v) => v / 0.1,
  },
  {
    id: "texint",
    min: 5,
    max: 120,
    step: 5,
    get: (m) => m.crossfade.interval,
    set: (m, v) => {
      m.crossfade.interval = v;
    },
    toValue: (pos) => pos,
    toSlider: (v) => v,
  },
];

/**
 * Attaches all input event listeners and seeds every control from live state.
 * Call once at startup.
 *
 * @param state - Live render state to read and mutate.
 * @param crossfade - Crossfade controller driven by the interval slider and the
 *   next-texture control.
 * @param els - The DOM elements to bind.
 */
export function bindUI(
  state: AppState,
  crossfade: CrossfadeController,
  els: UIElements,
): void {
  const m: Model = { state, crossfade };

  for (const spec of SLIDERS) {
    const el = els[spec.id];

    // The table is the single source of truth for range and mapping alike, so
    // the markup carries no duplicate min/max/step to drift out of sync.
    el.min = String(spec.min);
    el.max = String(spec.max);
    el.step = String(spec.step);
    writeSlider(el, spec, spec.toSlider(spec.get(m)));

    el.addEventListener("input", () => {
      spec.set(m, spec.toValue(parseFloat(el.value)));
    });
  }

  els.nextTex.addEventListener("click", () => crossfade.trigger());
  els.pause.addEventListener("click", () => togglePause(state, els.pause));
  els.fullscreen.addEventListener("click", toggleFullscreen);
  els.toggle.addEventListener("click", () => {
    // Hover reveals the panel on pointer devices. Touch has no hover, so this
    // is the only way in there.
    const open = document.body.classList.toggle("ui-open");
    els.toggle.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("keydown", (e: KeyboardEvent) => {
    switch (e.key) {
      case " ":
        // A focused button handles Space itself. Triggering here too would
        // fire both the button's action and a crossfade.
        if ((e.target as HTMLElement | null)?.tagName === "BUTTON") break;
        e.preventDefault();
        crossfade.trigger();
        break;
      case "p":
      case "P":
        togglePause(state, els.pause);
        break;
      case "f":
      case "F":
        toggleFullscreen();
        break;
      case "ArrowUp":
        nudgeSlider(m, els, "blur", +1);
        break;
      case "ArrowDown":
        nudgeSlider(m, els, "blur", -1);
        break;
      case "+":
      case "=":
        applyZoom(m, els, ZOOM_STEP);
        break;
      case "-":
        applyZoom(m, els, 1 / ZOOM_STEP);
        break;
    }
  });

  // Scroll up to zoom in, down to zoom out. `passive: false` lets us
  // `preventDefault` so the gesture zooms the warp instead of scrolling the page.
  document.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      // Leave scrolling over the control panel to the controls themselves.
      if ((e.target as Element | null)?.closest?.("#ui")) return;
      e.preventDefault();
      applyZoom(m, els, e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
    },
    { passive: false },
  );

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
    if (e.dataTransfer?.files.length)
      void crossfade.dropFiles(e.dataTransfer.files);
  });
}

/** Looks up a slider spec by id. Every id in {@link SliderSpec} is present. */
function specFor(id: SliderSpec["id"]): SliderSpec {
  const spec = SLIDERS.find((s) => s.id === id);
  if (!spec) throw new Error(`No slider spec for "${id}"`);
  return spec;
}

/**
 * Steps a slider by whole notches and applies the resulting value.
 *
 * @remarks
 * Stepping in *slider* space rather than value space is what keeps the knob and
 * the underlying value in agreement. Nudging the value directly and then
 * rounding it back onto the slider let the two drift apart until the next drag
 * snapped the value.
 *
 * @param m - State the slider edits.
 * @param els - Bound DOM elements.
 * @param id - Which slider to step.
 * @param delta - Number of notches to move, signed.
 */
function nudgeSlider(
  m: Model,
  els: UIElements,
  id: SliderSpec["id"],
  delta: number,
): void {
  const spec = specFor(id);
  const current = Math.round(spec.toSlider(spec.get(m)) / spec.step);
  const pos = clamp(
    (current + delta) * spec.step,
    Math.min(spec.min, spec.max),
    Math.max(spec.min, spec.max),
  );

  spec.set(m, spec.toValue(pos));
  writeSlider(els[id], spec, pos);
}

/**
 * Scales the master zoom by `factor` (clamped to `[ZOOM_MIN, ZOOM_MAX]`) and
 * syncs the zoom slider to match. Used by the `+`/`-` keys and the scroll wheel.
 *
 * @param m - State whose `masterZoom` is updated in place.
 * @param els - Bound DOM elements.
 * @param factor - Multiplier to apply (> 1 zooms in, < 1 zooms out).
 */
function applyZoom(m: Model, els: UIElements, factor: number): void {
  const spec = specFor("zoom");
  const next = clamp(m.state.params.masterZoom * factor, ZOOM_MIN, ZOOM_MAX);

  m.state.params.masterZoom = next;
  writeSlider(els.zoom, spec, spec.toSlider(next));
}

/**
 * Writes a slider position into its DOM element, snapped to the spec's range.
 *
 * @param el - The range input to update.
 * @param spec - Range definition to snap against.
 * @param pos - Desired slider position.
 */
function writeSlider(
  el: HTMLInputElement,
  spec: SliderSpec,
  pos: number,
): void {
  const lo = Math.min(spec.min, spec.max);
  const hi = Math.max(spec.min, spec.max);
  el.value = String(clamp(Math.round(pos), lo, hi));
}

/** Constrains `v` to `[lo, hi]`. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Flips the pause flag and updates the button label.
 *
 * @param state - State whose `paused` flag is toggled.
 * @param btn - Button whose label reflects the new state.
 */
function togglePause(state: AppState, btn: HTMLButtonElement): void {
  state.paused = !state.paused;
  btn.textContent = state.paused ? "Resume (P)" : "Pause (P)";
}

/** Enters fullscreen if not already in it, otherwise exits. */
function toggleFullscreen(): void {
  if (!document.fullscreenElement)
    void document.documentElement.requestFullscreen();
  else void document.exitFullscreen();
}
