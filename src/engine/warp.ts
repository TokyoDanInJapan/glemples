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
 * Computes the per-frame UV warp grid.
 *
 * @remarks
 * Each frame, seven independent "warp modes" (swirl, tunnel, zoom, etc.) are
 * evaluated per grid cell and blended by time-varying weights. The result is a
 * grid of texture coordinates the fragment shader samples through. This is a
 * port of the classic Drempels / Geiss warp.
 *
 * @packageDocumentation
 */

import { UV_CELLS_X, UV_CELLS_Y } from "../app/config.js";

/** Live, user-tunable parameters controlling the overall warp character. */
export interface WarpParams {
  /** Displacement strength of mode 0 (0.05 = none, 0.25 = good, 0.75 = chaos). */
  warpFactor: number;
  /** Base rotation rate, in turns per animation-time unit. */
  rotationalSpeed: number;
  /** Sharpening exponent on mode weights (1 = blendy, 4 = focused, 16 = singular). */
  modeFocusExponent: number;
  /** Overall zoom (1 = normal, >1 = in, <1 = out). */
  masterZoom: number;
  /** Texture-tiling scale on a 0–20 slider (10 = normal). */
  texScale: number;
  /** Animation speed on a 0–20 slider (10 = normal). */
  speedScale: number;
}

/** One sinusoidal displacement term of the mode-0 Drempels warp. */
interface WarpOscillator {
  /** Temporal frequency. */
  w: number;
  /** Spatial frequency along U. */
  uScale: number;
  /** Spatial frequency along V. */
  vScale: number;
  /** Phase offset. */
  phase: number;
}

/**
 * Per-animation random seed, re-rolled on each texture change so successive
 * clips look distinct. See {@link randomizeState}.
 */
export interface WarpState {
  /** Four random phase seeds reused across modes. */
  randStart: [number, number, number, number];
  /** The four oscillators driving mode 0. */
  oscillators: [WarpOscillator, WarpOscillator, WarpOscillator, WarpOscillator];
  /** Rotation rate with a randomised sign. */
  rotationalSpeed: number;
  /** Multiplier on how fast mode weights cycle. */
  modeSwitchSpeedMultiplier: number;
}

/** All per-frame derived values shared across warp modes (built once per frame). */
interface FrameContext {
  animTime: number;
  intframe2: number;
  warpFactor: number;
  scale: number;
  cosRot: number;
  sinRot: number;
  rs: [number, number, number, number];
  osc: [WarpOscillator, WarpOscillator, WarpOscillator, WarpOscillator];
  fscale1: number;
  fscale2: number;
  fscale3: number;
  fscale4: number;
  fscale5: number;
  t3uc: number;
  t3vc: number;
  cost3: number;
  sint3: number;
  t4uc: number;
  t4vc: number;
  cost4: number;
  sint4: number;
}

/**
 * Produces a fresh random {@link WarpState}.
 *
 * @param modeSwitchSpeedMultiplier - Scales how quickly mode weights cycle.
 * @returns A newly seeded warp state.
 */
export function randomizeState(modeSwitchSpeedMultiplier = 1.0): WarpState {
  const rand = () => Math.random();
  const sign = () => (rand() < 0.5 ? 1 : -1);

  const randStart: [number, number, number, number] = [
    Math.PI * 2 * rand(),
    Math.PI * 2 * rand(),
    Math.PI * 2 * rand(),
    Math.PI * 2 * rand(),
  ];

  const oscillators = ([0, 1, 2, 3] as const).map(() => {
    const wMag = 0.02 + 0.015 * rand();
    const uMag = 0.23 + 0.12 * rand();
    const vMag = 0.23 + 0.12 * rand();
    const pMag = Math.PI * 2 * rand();
    return {
      w: wMag * sign(),
      uScale: uMag * sign(),
      vScale: vMag * sign(),
      phase: pMag * sign(),
    };
  }) as [WarpOscillator, WarpOscillator, WarpOscillator, WarpOscillator];

  return {
    randStart,
    oscillators,
    rotationalSpeed: 0.05 * sign(),
    modeSwitchSpeedMultiplier,
  };
}

/**
 * Computes the seven normalised mode-blend weights for the current time.
 *
 * @remarks
 * Each weight is a sinusoid raised to a power; the set is L2-normalised, sharpened
 * by `focusExp`, biased towards mode 0, then re-normalised so one mode dominates.
 *
 * @param animTime - Current animation time.
 * @param state - Warp state providing the random phase seeds.
 * @param focusExp - Sharpening exponent (see {@link WarpParams.modeFocusExponent}).
 * @returns A length-7 array of weights summing (in L2) to 1.
 */
function computeModeWeights(
  animTime: number,
  state: WarpState,
  focusExp: number,
): Float32Array {
  const { randStart: rs, modeSwitchSpeedMultiplier: mss } = state;
  const t = new Float32Array(7);

  t[0] = Math.pow(0.5 + 0.5 * Math.sin(animTime * mss * 0.1216 + rs[0]), 1.0);
  t[1] = Math.pow(0.48 + 0.48 * Math.sin(animTime * mss * 0.0625 + rs[1]), 2.0);
  t[2] = Math.pow(
    0.45 + 0.45 * Math.sin(animTime * mss * 0.0253 + rs[2]),
    12.0,
  );
  t[3] = Math.pow(0.5 + 0.5 * Math.sin(animTime * mss * 0.0916 + rs[3]), 2.0);
  t[4] = Math.pow(0.5 + 0.5 * Math.sin(animTime * mss * 0.0625 + rs[0]), 2.0);
  t[5] = Math.pow(0.7 + 0.5 * Math.sin(animTime * mss * 0.0466 + rs[1]), 1.0);
  t[6] = Math.pow(0.5 + 0.5 * Math.sin(animTime * mss * 0.0587 + rs[2]), 2.0);

  // L2-normalise, sharpen towards dominant mode, bias mode 0, re-normalise.
  const l2 = (arr: Float32Array) =>
    Math.sqrt(arr.reduce((s, v) => s + v * v, 0));
  const scale = (arr: Float32Array, f: number) => {
    for (let i = 0; i < arr.length; i++) arr[i] *= f;
  };

  scale(t, 1 / l2(t));
  for (let i = 0; i < t.length; i++) t[i] = Math.pow(t[i], focusExp);
  t[0] += 0.2;
  scale(t, 1 / l2(t));

  return t;
}

/**
 * Mode 0 — the original v1.0 Drempels warp: four summed sine oscillators plus
 * scaling, rotation, and a slow drift.
 *
 * @param bua - Aspect-corrected base U for the cell.
 * @param bv - Base V for the cell.
 * @param ctx - Shared per-frame context.
 * @returns The mode's `[u, v]` displacement.
 */
function modeDrempels(
  bua: number,
  bv: number,
  ctx: FrameContext,
): [number, number] {
  const { warpFactor, intframe2, osc, scale, cosRot, sinRot } = ctx;
  let u = bua;
  let v = bv;
  u +=
    warpFactor *
    0.65 *
    Math.sin(
      intframe2 * osc[0].w +
        (bua * osc[0].uScale + bv * osc[0].vScale) * Math.PI * 2 +
        osc[0].phase,
    );
  v +=
    warpFactor *
    0.65 *
    Math.sin(
      intframe2 * osc[1].w +
        (bua * osc[1].uScale - bv * osc[1].vScale) * Math.PI * 2 +
        osc[1].phase,
    );
  u +=
    warpFactor *
    0.35 *
    Math.sin(
      intframe2 * osc[2].w +
        (bua * osc[2].uScale - bv * osc[2].vScale) * Math.PI * 2 +
        osc[2].phase,
    );
  v +=
    warpFactor *
    0.35 *
    Math.sin(
      intframe2 * osc[3].w +
        (bua * osc[3].uScale + bv * osc[3].vScale) * Math.PI * 2 +
        osc[3].phase,
    );
  u /= scale;
  v /= scale;
  const ut = u;
  u = ut * cosRot - v * sinRot;
  v = ut * sinRot + v * cosRot;
  u += 2.0 * Math.sin(intframe2 * 0.00613);
  v += 2.0 * Math.cos(intframe2 * 0.0138);
  return [u, v];
}

/**
 * Mode 1 — "stomach": gentle polar churn from low-frequency radius/angle waves.
 *
 * @param bua - Aspect-corrected base U.
 * @param bv - Base V.
 * @param ctx - Shared per-frame context.
 * @returns The mode's `[u, v]` displacement.
 */
function modeStomach(
  bua: number,
  bv: number,
  ctx: FrameContext,
): [number, number] {
  const { animTime, rs } = ctx;
  const rad = Math.sqrt(bua * bua + bv * bv);
  const ang = Math.atan2(bua, bv);
  const rad2 = rad * (1.0 + 0.3 * Math.sin(animTime * 0.53 + ang + rs[1]));
  const ang2 = ang + 0.9 * Math.sin(animTime * 0.45 + rad * 4.2 + rs[2]);
  return [Math.cos(ang2) * rad2 * 1.7, Math.sin(ang2) * rad2 * 1.7];
}

/**
 * Mode 2 — "crazy": the same polar churn as {@link modeStomach} but with much
 * higher spatial/temporal frequencies, giving a frenetic ripple.
 *
 * @param bua - Aspect-corrected base U.
 * @param bv - Base V.
 * @param ctx - Shared per-frame context.
 * @returns The mode's `[u, v]` displacement.
 */
function modeCrazy(
  bua: number,
  bv: number,
  ctx: FrameContext,
): [number, number] {
  const { animTime, rs } = ctx;
  const rad = Math.sqrt(bua * bua + bv * bv);
  const ang = Math.atan2(bua, bv);
  const rad2 =
    rad * (1.0 + 0.3 * Math.sin(animTime * 1.59 + ang * 20.4 + rs[2]));
  const ang2 = ang + 1.8 * Math.sin(animTime * 1.35 + rad * 22.1 + rs[3]);
  return [Math.cos(ang2) * rad2, Math.sin(ang2) * rad2];
}

/**
 * Mode 3 — "rotation": rigid rotation about a slowly wandering centre.
 *
 * @param bua - Aspect-corrected base U.
 * @param bv - Base V.
 * @param ctx - Shared per-frame context.
 * @returns The mode's `[u, v]` displacement.
 */
function modeRotation(
  bua: number,
  bv: number,
  ctx: FrameContext,
): [number, number] {
  const { t3uc, t3vc, cost3, sint3 } = ctx;
  const u = bua * 1.6 - t3uc;
  const v = bv * 1.6 - t3vc;
  return [u * cost3 - v * sint3 + t3uc, u * sint3 + v * cost3 + t3vc];
}

/**
 * Mode 4 — "zoom out + minor rotate": pulsing zoom about a wandering centre
 * combined with a small rotation.
 *
 * @param bua - Aspect-corrected base U.
 * @param bv - Base V.
 * @param ctx - Shared per-frame context.
 * @returns The mode's `[u, v]` displacement.
 */
function modeZoomRotate(
  bua: number,
  bv: number,
  ctx: FrameContext,
): [number, number] {
  const { fscale1, t4uc, t4vc, t3uc, t3vc, cost4, sint4 } = ctx;
  const u0 = bua - t4uc;
  const v0 = bv - t4vc;
  const u1 = u0 * fscale1 + t4uc - t3uc;
  const v1 = v0 * fscale1 + t4vc - t3uc; // t3uc for both offsets — matches original
  return [u1 * cost4 - v1 * sint4 + t3uc, u1 * sint4 + v1 * cost4 + t3vc];
}

/**
 * Mode 5 — "swirlies": fine, high-frequency sinusoidal jitter layered in two
 * passes for a shimmering, turbulent texture.
 *
 * @param bua - Aspect-corrected base U.
 * @param bv - Base V.
 * @param ctx - Shared per-frame context.
 * @returns The mode's `[u, v]` displacement.
 */
function modeSwirlies(
  bua: number,
  bv: number,
  ctx: FrameContext,
): [number, number] {
  const { animTime, rs, fscale2, fscale3, fscale4, fscale5 } = ctx;
  const u = bua * 1.4;
  const v = bv * 1.4;
  let u2 =
    u +
    0.03 *
      Math.sin(
        u * (fscale2 + 2) + v * (fscale3 + 2) + rs[3] + animTime * 1.13 + 3.0,
      );
  let v2 =
    v +
    0.03 *
      Math.cos(
        u * (fscale4 + 2) - v * (fscale5 + 2) + rs[1] + animTime * 1.03 - 7.0,
      );
  u2 +=
    0.024 *
    Math.sin(
      u * (fscale3 * -0.1) +
        v * (fscale5 * 0.9) +
        rs[2] +
        animTime * 0.53 -
        3.0,
    );
  v2 +=
    0.024 *
    Math.cos(
      u * (fscale2 * 0.9) +
        v * (fscale4 * -0.1) +
        rs[0] +
        animTime * 0.58 +
        2.0,
    );
  return [u2 * 1.25, v2 * 1.25];
}

/**
 * Mode 6 — "tunnel": maps to polar space so the texture appears to recede down
 * an infinite tunnel.
 *
 * @param bua - Aspect-corrected base U.
 * @param bv - Base V.
 * @param ctx - Shared per-frame context.
 * @returns The mode's `[u, v]` displacement.
 */
function modeTunnel(
  bua: number,
  bv: number,
  ctx: FrameContext,
): [number, number] {
  const { animTime, rs, t4uc, t4vc } = ctx;
  const u = bua * 1.4 - t4vc;
  const v = bv * 1.4 - t4uc;
  const rad = Math.sqrt(u * u + v * v);
  const ang = Math.atan2(u, v);
  return [
    rad + 3.0 * Math.sin(animTime * 0.133 + rs[0]) + t4vc,
    rad * 0.05 * Math.cos(ang + animTime * 0.079 + rs[3]) + t4uc,
  ];
}

/**
 * Precomputes the per-frame trigonometric/scale terms shared by all modes, so
 * the per-cell inner loop stays cheap.
 *
 * @param animTime - Current animation time.
 * @param params - Live warp parameters.
 * @param state - Current warp state (random seeds, oscillators).
 * @param rotation - Accumulated base-rotation angle, in radians. Supplied by the
 *   caller and integrated continuously so a re-rolled {@link WarpState} changes
 *   only the rotation *rate*, never the absolute angle (which would snap).
 * @returns The fully populated {@link FrameContext}.
 */
function buildFrameContext(
  animTime: number,
  params: WarpParams,
  state: WarpState,
  rotation: number,
): FrameContext {
  const { warpFactor } = params;
  const { randStart: rs, oscillators: osc } = state;

  const intframe2 = animTime * 22.5;
  const scale = 0.45 + 0.1 * Math.sin(intframe2 * 0.01);
  const rot = rotation;

  const fscale1 =
    1.0 +
    1.15 *
      (Math.pow(
        2.0,
        1.0 +
          0.5 * Math.sin(animTime * 0.892) +
          0.5 * Math.sin(animTime * 0.624),
      ) -
        1.0);
  const fscale2 =
    4.0 +
    Math.sin(rs[2] + animTime * 0.517) +
    Math.sin(rs[3] + animTime * 0.976);
  const fscale3 =
    4.0 +
    Math.sin(rs[0] + animTime * 0.654) +
    Math.sin(rs[0] + animTime * 1.044);
  const fscale4 =
    4.0 +
    Math.sin(rs[1] + animTime * 0.517) +
    Math.sin(rs[2] + animTime * 0.976);
  const fscale5 =
    4.0 +
    Math.sin(rs[3] + animTime * 0.654) +
    Math.sin(rs[1] + animTime * 1.044);

  const t3uc =
    0.3 * Math.sin(0.217 * (animTime + rs[0])) +
    0.2 * Math.sin(0.185 * (animTime + rs[1]));
  const t3vc =
    0.3 * Math.cos(0.249 * (animTime + rs[2])) +
    0.2 * Math.cos(0.153 * (animTime + rs[3]));
  const t3rot =
    3.3 * Math.cos(0.129 * (animTime + rs[1])) +
    2.2 * Math.cos(0.1039 * (animTime + rs[2]));
  const t4uc =
    0.2 * Math.sin(0.207 * (animTime + rs[1])) +
    0.2 * Math.sin(0.145 * (animTime + rs[3]));
  const t4vc =
    0.2 * Math.cos(0.219 * (animTime + rs[0])) +
    0.2 * Math.cos(0.163 * (animTime + rs[2]));
  const t4rot =
    0.61 * Math.cos(0.123 * (animTime + rs[3])) +
    0.43 * Math.cos(0.1009 * (animTime + rs[0]));

  return {
    animTime,
    intframe2,
    warpFactor,
    scale,
    cosRot: Math.cos(rot),
    sinRot: Math.sin(rot),
    rs,
    osc,
    fscale1,
    fscale2,
    fscale3,
    fscale4,
    fscale5,
    t3uc,
    t3vc,
    cost3: Math.cos(t3rot),
    sint3: Math.sin(t3rot),
    t4uc,
    t4vc,
    cost4: Math.cos(t4rot),
    sint4: Math.sin(t4rot),
  };
}

/**
 * Fills the warp grid for one frame by blending all seven modes per cell.
 *
 * @remarks
 * Writes `UV_CELLS_X * UV_CELLS_Y * 2` floats into `gridOut`, packed as
 * `[u0, v0, u1, v1, …]` in row-major order, in `[0, 1]` texture-coordinate space.
 *
 * @param animTime - Current animation time.
 * @param params - Live warp parameters.
 * @param state - Current warp state.
 * @param rotation - Accumulated base-rotation angle, in radians (see
 *   {@link buildFrameContext}). The caller integrates `rotationalSpeed` over time
 *   and passes the running total here so rotation stays continuous across re-rolls.
 * @param gridOut - Pre-allocated output buffer, mutated in place.
 */
export function computeWarpGrid(
  animTime: number,
  params: WarpParams,
  state: WarpState,
  rotation: number,
  gridOut: Float32Array,
): void {
  const ctx = buildFrameContext(animTime, params, state, rotation);
  const t = computeModeWeights(animTime, state, params.modeFocusExponent);
  const zoom =
    (1.0 / (params.masterZoom * 1.8)) *
    Math.pow(4.0, 1.0 - params.texScale * 0.1);

  for (let j = 0; j < UV_CELLS_Y; j++) {
    for (let i = 0; i < UV_CELLS_X; i++) {
      const baseU = i / (UV_CELLS_X - 1) - 0.5;
      const baseV = -(j / (UV_CELLS_Y - 1) - 0.5);
      const bua = baseU * 1.333;

      const [u0, v0] = modeDrempels(bua, baseV, ctx);
      const [u1, v1] = modeStomach(bua, baseV, ctx);
      const [u2, v2] = modeCrazy(bua, baseV, ctx);
      const [u3, v3] = modeRotation(bua, baseV, ctx);
      const [u4, v4] = modeZoomRotate(bua, baseV, ctx);
      const [u5, v5] = modeSwirlies(bua, baseV, ctx);
      const [u6, v6] = modeTunnel(bua, baseV, ctx);

      const cu =
        (u0 * t[0] +
          u1 * t[1] +
          u2 * t[2] +
          u3 * t[3] +
          u4 * t[4] +
          u5 * t[5] +
          u6 * t[6]) *
          zoom +
        0.5;
      const cv =
        (v0 * t[0] +
          v1 * t[1] +
          v2 * t[2] +
          v3 * t[3] +
          v4 * t[4] +
          v5 * t[5] +
          v6 * t[6]) *
          zoom +
        0.5;

      const idx = (j * UV_CELLS_X + i) * 2;
      gridOut[idx] = cu;
      gridOut[idx + 1] = cv;
    }
  }
}
