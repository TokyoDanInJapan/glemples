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
 * Application configuration, loaded from the bundled `config.yaml`.
 *
 * @remarks
 * The YAML is imported at build time by `@modyfi/vite-plugin-yaml` and exposed
 * here as a set of typed, named constants so the rest of the codebase never
 * touches raw config keys.
 *
 * @packageDocumentation
 */

import raw from "../config.yaml";

/** Shape of the parsed `config.yaml` document (snake_case keys as authored). */
interface Config {
  uv_cells_x: number;
  uv_cells_y: number;
  texture_size: number;
  warp_factor: number;
  rotational_speed: number;
  mode_focus_exponent: number;
  master_zoom: number;
  texture_scale: number;
  speed_scale: number;
  fade_interval: number;
  fade_duration: number;
  initial_motion_blur: number;
}

// The YAML plugin types the import as `Record<string, unknown>`; cast through
// `unknown` to our concrete shape.
const cfg = raw as unknown as Config;

/** Number of warp-grid sample columns computed each frame. */
export const UV_CELLS_X = cfg.uv_cells_x;
/** Number of warp-grid sample rows computed each frame. */
export const UV_CELLS_Y = cfg.uv_cells_y;
/** Edge length, in pixels, of each (square, power-of-two) image texture. */
export const TEXTURE_SIZE = cfg.texture_size;

/** Starting values for the live-tunable warp parameters (see {@link WarpParams}). */
export const DEFAULT_WARP_PARAMS = {
  warpFactor: cfg.warp_factor,
  rotationalSpeed: cfg.rotational_speed,
  modeFocusExponent: cfg.mode_focus_exponent,
  masterZoom: cfg.master_zoom,
  texScale: cfg.texture_scale,
  speedScale: cfg.speed_scale,
};

/** Seconds a texture is held before the next crossfade begins. */
export const FADE_INTERVAL = cfg.fade_interval;
/** Duration, in seconds, of a texture crossfade. */
export const FADE_DURATION = cfg.fade_duration;
/** Initial motion-blur amount (0 = none, ~0.97 = heavy). */
export const INITIAL_MOTION_BLUR = cfg.initial_motion_blur;
