import { describe, it, expect } from "vitest";
import { WarpAnimator } from "../../src/app/warp-animator.js";
import {
  computeWarpGrid,
  type WarpParams,
  type WarpState,
} from "../../src/engine/warp.js";

const SIZE = { cols: 12, rows: 9 };

const PARAMS: WarpParams = {
  warpFactor: 0.22,
  modeFocusExponent: 2.9,
  masterZoom: 1.0,
  texScale: 10,
  speedScale: 10,
};

function fixedState(rotationalSpeed = 0.05): WarpState {
  return {
    randStart: [0.1, 0.2, 0.3, 0.4],
    oscillators: [
      { w: 0.025, uScale: 0.3, vScale: 0.3, phase: 1 },
      { w: -0.03, uScale: -0.25, vScale: 0.28, phase: -2 },
      { w: 0.022, uScale: 0.26, vScale: -0.31, phase: 0.5 },
      { w: -0.028, uScale: 0.29, vScale: 0.24, phase: 3 },
    ],
    rotationalSpeed,
    modeSwitchSpeedMultiplier: 1,
  };
}

describe("WarpAnimator", () => {
  it("sizes its grid to the requested cell count", () => {
    const a = new WarpAnimator(SIZE, fixedState());
    expect(a.grid).toHaveLength(SIZE.cols * SIZE.rows * 2);
  });

  it("matches computeWarpGrid exactly when no fade is running", () => {
    const a = new WarpAnimator(SIZE, fixedState());
    a.update(1.5, PARAMS, 0);

    const expected = new Float32Array(SIZE.cols * SIZE.rows * 2);
    computeWarpGrid(1.5, PARAMS, fixedState(), 0, SIZE, expected);

    expect(Array.from(a.grid)).toEqual(Array.from(expected));
  });

  it("does not pick an incoming state until a fade begins", () => {
    const a = new WarpAnimator(SIZE, fixedState());
    a.update(1.0, PARAMS, 0);
    expect(a.pendingState).toBeNull();

    a.update(1.0, PARAMS, 0.01);
    expect(a.pendingState).not.toBeNull();
  });

  it("keeps the same incoming state for the whole fade", () => {
    const a = new WarpAnimator(SIZE, fixedState());
    a.update(1.0, PARAMS, 0.2);
    const chosen = a.pendingState;

    a.update(1.1, PARAMS, 0.6);
    expect(a.pendingState).toBe(chosen);
  });

  it("promotes the incoming state only when the fade completes", () => {
    const initial = fixedState();
    const a = new WarpAnimator(SIZE, initial);

    a.update(1.0, PARAMS, 0.5);
    const incoming = a.pendingState;
    expect(a.currentState).toBe(initial);

    a.completeFade();
    expect(a.currentState).toBe(incoming);
    expect(a.pendingState).toBeNull();
  });

  it("completeFade is a no-op when nothing is pending", () => {
    const initial = fixedState();
    const a = new WarpAnimator(SIZE, initial);

    a.completeFade();
    expect(a.currentState).toBe(initial);
  });

  it("blends towards the incoming field as the fade advances", () => {
    // At fade 0 the field is purely the outgoing state; by fade 1 it must have
    // fully reached the incoming one, so promoting at that point is invisible.
    const a = new WarpAnimator(SIZE, fixedState());

    a.update(1.0, PARAMS, 0.5);
    const incoming = a.pendingState!;
    const half = Float32Array.from(a.grid);

    a.update(1.0, PARAMS, 1.0);
    const full = Float32Array.from(a.grid);

    const target = new Float32Array(SIZE.cols * SIZE.rows * 2);
    computeWarpGrid(1.0, PARAMS, incoming, 0, SIZE, target);

    for (let i = 0; i < full.length; i++)
      expect(full[i]).toBeCloseTo(target[i]!, 5);

    expect(Array.from(half)).not.toEqual(Array.from(full));
  });

  it("integrates rotation from the rate rather than recomputing the angle", () => {
    // Re-rolling the state must change only the rate. If the angle were derived
    // from the state instead, it would jump at every crossfade.
    const a = new WarpAnimator(SIZE, fixedState());
    a.advance(1.0);
    a.update(0, PARAMS, 0);
    const rotated = Float32Array.from(a.grid);

    const b = new WarpAnimator(SIZE, fixedState());
    b.update(0, PARAMS, 0);

    expect(Array.from(rotated)).not.toEqual(Array.from(b.grid));

    // Same accumulated angle reached in two steps gives the same field.
    const c = new WarpAnimator(SIZE, fixedState());
    c.advance(0.5);
    c.advance(0.5);
    c.update(0, PARAMS, 0);
    expect(Array.from(c.grid)).toEqual(Array.from(rotated));
  });

  it("advances rotation at the rate of the outgoing state during a morph", () => {
    const slow = new WarpAnimator(SIZE, fixedState(0.01));
    const fast = new WarpAnimator(SIZE, fixedState(0.5));

    slow.advance(1.0);
    fast.advance(1.0);
    slow.update(0, PARAMS, 0);
    fast.update(0, PARAMS, 0);

    expect(Array.from(slow.grid)).not.toEqual(Array.from(fast.grid));
  });

  it("produces finite output throughout a fade", () => {
    const a = new WarpAnimator(SIZE, fixedState());
    for (const fade of [0, 0.25, 0.5, 0.75, 1]) {
      a.update(2.0, PARAMS, fade);
      for (const v of a.grid) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
