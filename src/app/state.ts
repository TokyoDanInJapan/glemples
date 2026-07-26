// GLemples — real-time WebGL image warper
// Copyright (C) 2026 Daniel Hebberd
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The mutable state shared between the UI and the render loop.
 *
 * @packageDocumentation
 */

import type { WarpParams } from "../engine/warp.js";
import { DEFAULT_WARP_PARAMS, INITIAL_MOTION_BLUR } from "./config.js";

/**
 * Live render state.
 *
 * @remarks
 * A single mutable object rather than a set of boxed scalars: the UI writes
 * fields here and the frame loop reads them, both holding the same reference.
 */
export interface AppState {
  /** Live warp parameters, mutated by the warp/zoom/speed controls. */
  params: WarpParams;
  /** Fraction of the previous frame retained as motion-blur trails (0–0.97). */
  motionBlur: number;
  /** When true the frame loop still renders but stops advancing time. */
  paused: boolean;
}

/** Builds the initial {@link AppState} from the bundled configuration. */
export function createAppState(): AppState {
  return {
    params: { ...DEFAULT_WARP_PARAMS },
    motionBlur: INITIAL_MOTION_BLUR,
    paused: false,
  };
}
