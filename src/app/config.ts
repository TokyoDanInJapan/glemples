// GLemples — real-time WebGL image warper
// Copyright (C) 2026 Daniel Hebberd
//
// SPDX-License-Identifier: GPL-3.0-or-later

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

/** Constraints a config value must satisfy to be accepted. */
interface NumberSpec {
  /** Inclusive lower bound. */
  min?: number;
  /** Inclusive upper bound. */
  max?: number;
  /** Require a whole number. */
  integer?: boolean;
  /** Require an exact power of two (for `REPEAT`-wrapped WebGL1 textures). */
  powerOfTwo?: boolean;
}

const doc: Record<string, unknown> =
  typeof raw === "object" && raw !== null
    ? (raw as Record<string, unknown>)
    : {};

/**
 * Reads one numeric key out of the parsed YAML, failing loudly if it is absent
 * or out of range.
 *
 * @remarks
 * The values here feed straight into trigonometry and GPU allocations, where a
 * missing key would otherwise surface as a silent `NaN` warp field or a
 * zero-sized texture. Failing at module load points at the offending key
 * instead.
 *
 * @param key - Key to read from `config.yaml`.
 * @param spec - Constraints the value must satisfy.
 * @returns The validated number.
 * @throws If the key is missing, non-numeric, or violates `spec`.
 */
function num(key: string, spec: NumberSpec = {}): number {
  const v = doc[key];

  if (typeof v !== "number" || !Number.isFinite(v))
    throw new Error(
      `config.yaml: "${key}" must be a finite number, got ${String(v)}`,
    );

  if (spec.integer && !Number.isInteger(v))
    throw new Error(`config.yaml: "${key}" must be a whole number, got ${v}`);

  if (spec.min !== undefined && v < spec.min)
    throw new Error(`config.yaml: "${key}" must be >= ${spec.min}, got ${v}`);

  if (spec.max !== undefined && v > spec.max)
    throw new Error(`config.yaml: "${key}" must be <= ${spec.max}, got ${v}`);

  if (spec.powerOfTwo && (v < 1 || (v & (v - 1)) !== 0))
    throw new Error(`config.yaml: "${key}" must be a power of two, got ${v}`);

  return v;
}

/**
 * Number of warp-grid sample columns computed each frame.
 *
 * @remarks
 * At least 2: the grid is interpolated across `cols - 1` spans.
 */
export const UV_CELLS_X = num("uv_cells_x", { integer: true, min: 2 });
/** Number of warp-grid sample rows computed each frame. At least 2. */
export const UV_CELLS_Y = num("uv_cells_y", { integer: true, min: 2 });
/** Edge length, in pixels, of each (square, power-of-two) image texture. */
export const TEXTURE_SIZE = num("texture_size", {
  integer: true,
  powerOfTwo: true,
});

/** Starting values for the live-tunable warp parameters (see {@link WarpParams}). */
export const DEFAULT_WARP_PARAMS = {
  warpFactor: num("warp_factor", { min: 0 }),
  modeFocusExponent: num("mode_focus_exponent", { min: 0 }),
  masterZoom: num("master_zoom", { min: 0 }),
  texScale: num("texture_scale", { min: 0, max: 20 }),
  speedScale: num("speed_scale", { min: 0, max: 20 }),
};

/** Smallest permitted master zoom (see {@link WarpParams.masterZoom}). */
export const ZOOM_MIN = num("zoom_min", { min: 0 });
/** Largest permitted master zoom. */
export const ZOOM_MAX = num("zoom_max", { min: ZOOM_MIN });
/** Multiplicative zoom step per `+`/`-` keypress or wheel notch. */
export const ZOOM_STEP = num("zoom_step", { min: 1 });

/** Seconds a texture is held before the next crossfade begins. */
export const FADE_INTERVAL = num("fade_interval", { min: 0 });
/** Duration, in seconds, of a texture crossfade. */
export const FADE_DURATION = num("fade_duration", { min: 0.001 });
/** Initial motion-blur amount (0 = none, ~0.97 = heavy). */
export const INITIAL_MOTION_BLUR = num("initial_motion_blur", {
  min: 0,
  max: 1,
});
