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
