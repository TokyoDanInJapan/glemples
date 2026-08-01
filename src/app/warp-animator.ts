// GLemples — real-time WebGL image warper
// Copyright (C) 2026 Daniel Hebberd
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Owns the warp grid and the morph between successive random warp states.
 *
 * @packageDocumentation
 */

import {
  computeWarpGrid,
  randomiseState,
  type WarpGridSize,
  type WarpParams,
  type WarpState,
} from "../engine/warp.js";

/**
 * Maintains the warp grid across frames, easing from one random {@link WarpState}
 * to the next while a texture crossfade runs.
 *
 * @remarks
 * Two details here are load-bearing and easy to regress:
 *
 * - Rotation is *integrated* rather than derived from the current state's
 *   `rotationalSpeed`, so re-rolling the state changes only the rate. Deriving
 *   the angle instead makes the field snap every time a state changes.
 * - The incoming state is blended in over the whole fade rather than swapped in
 *   at the end, so the field never changes in a single frame. The texture
 *   crossfade masks the morph.
 */
export class WarpAnimator {
  /** The grid for the current frame, in `[u, v]` pairs. */
  readonly grid: Float32Array;

  /** Scratch grid for the incoming state, blended into {@link grid}. */
  private readonly gridNext: Float32Array;

  private readonly size: WarpGridSize;
  private state: WarpState;
  /** The state being morphed towards, or `null` when no fade is in progress. */
  private next: WarpState | null = null;
  /** Accumulated base-rotation angle in radians. */
  private rotation = 0;

  /**
   * @param size - Grid dimensions in cells.
   * @param initial - Starting warp state. A fresh random one by default.
   */
  constructor(size: WarpGridSize, initial: WarpState = randomiseState()) {
    this.size = size;
    this.state = initial;
    this.grid = new Float32Array(size.cols * size.rows * 2);
    this.gridNext = new Float32Array(size.cols * size.rows * 2);
  }

  /** The state currently driving the field. Exposed for tests. */
  get currentState(): WarpState {
    return this.state;
  }

  /** The state being morphed towards, if a morph is in progress. */
  get pendingState(): WarpState | null {
    return this.next;
  }

  /**
   * Advances the integrated rotation angle.
   *
   * @remarks
   * Call before {@link update} so the frame uses the rate the previous frame
   * ended on, matching the original's phase.
   *
   * @param dAnim - Animation-time delta for this frame, in seconds.
   */
  advance(dAnim: number): void {
    this.rotation += dAnim * this.state.rotationalSpeed * Math.PI * 2;
  }

  /**
   * Recomputes {@link grid} for this frame.
   *
   * @param animTime - Current animation time.
   * @param params - Live warp parameters.
   * @param fade - Texture-crossfade progress (0–1). Any value above zero starts
   *   (or continues) a morph towards a freshly rolled state.
   */
  update(animTime: number, params: WarpParams, fade: number): void {
    // A crossfade is starting or running: pick the state to morph towards so
    // the field eases across the fade instead of snapping at the end.
    if (fade > 0 && !this.next) this.next = randomiseState();

    computeWarpGrid(
      animTime,
      params,
      this.state,
      this.rotation,
      this.size,
      this.grid,
    );

    if (!this.next) return;

    computeWarpGrid(
      animTime,
      params,
      this.next,
      this.rotation,
      this.size,
      this.gridNext,
    );

    const { grid, gridNext } = this;
    for (let i = 0; i < grid.length; i++)
      grid[i] = grid[i]! + (gridNext[i]! - grid[i]!) * fade;
  }

  /**
   * Adopts the incoming state. Call when the texture crossfade finishes — the
   * morph has reached the incoming state by then, so this is a no-op visually.
   */
  completeFade(): void {
    if (this.next) {
      this.state = this.next;
      this.next = null;
    }
  }
}
