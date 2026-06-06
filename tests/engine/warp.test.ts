import { describe, it, expect } from "vitest";
import {
  randomizeState,
  computeWarpGrid,
  type WarpParams,
  type WarpState,
} from "../../src/engine/warp.js";
import { UV_CELLS_X, UV_CELLS_Y } from "../../src/app/config.js";

const PARAMS: WarpParams = {
  warpFactor: 0.22,
  rotationalSpeed: 0.05,
  modeFocusExponent: 2.9,
  masterZoom: 1.0,
  texScale: 10,
  speedScale: 10,
};

const GRID_LEN = UV_CELLS_X * UV_CELLS_Y * 2;

describe("randomizeState", () => {
  it("produces four oscillators and four phase seeds", () => {
    const s = randomizeState();
    expect(s.randStart).toHaveLength(4);
    expect(s.oscillators).toHaveLength(4);
  });

  it("keeps each random value within its documented magnitude range", () => {
    for (let n = 0; n < 50; n++) {
      const s = randomizeState();
      for (const seed of s.randStart) {
        expect(seed).toBeGreaterThanOrEqual(0);
        expect(seed).toBeLessThanOrEqual(Math.PI * 2);
      }
      for (const o of s.oscillators) {
        expect(Math.abs(o.w)).toBeGreaterThanOrEqual(0.02);
        expect(Math.abs(o.w)).toBeLessThanOrEqual(0.035);
        expect(Math.abs(o.uScale)).toBeGreaterThanOrEqual(0.23);
        expect(Math.abs(o.uScale)).toBeLessThanOrEqual(0.35);
        expect(Math.abs(o.vScale)).toBeGreaterThanOrEqual(0.23);
        expect(Math.abs(o.vScale)).toBeLessThanOrEqual(0.35);
        expect(Math.abs(o.phase)).toBeLessThanOrEqual(Math.PI * 2);
      }
      expect(Math.abs(s.rotationalSpeed)).toBeCloseTo(0.05);
    }
  });

  it("defaults modeSwitchSpeedMultiplier to 1 and respects an override", () => {
    expect(randomizeState().modeSwitchSpeedMultiplier).toBe(1);
    expect(randomizeState(2.5).modeSwitchSpeedMultiplier).toBe(2.5);
  });

  it("eventually yields both rotation signs", () => {
    const signs = new Set<number>();
    for (let n = 0; n < 100; n++)
      signs.add(Math.sign(randomizeState().rotationalSpeed));
    expect(signs).toEqual(new Set([1, -1]));
  });
});

describe("computeWarpGrid", () => {
  // A fixed state so the maths is fully deterministic.
  const fixedState: WarpState = {
    randStart: [0.1, 0.2, 0.3, 0.4],
    oscillators: [
      { w: 0.025, uScale: 0.3, vScale: 0.3, phase: 1 },
      { w: -0.03, uScale: -0.25, vScale: 0.28, phase: -2 },
      { w: 0.022, uScale: 0.26, vScale: -0.31, phase: 0.5 },
      { w: -0.028, uScale: 0.29, vScale: 0.24, phase: 3 },
    ],
    rotationalSpeed: 0.05,
    modeSwitchSpeedMultiplier: 1,
  };

  it("fills the entire grid buffer with finite numbers", () => {
    const out = new Float32Array(GRID_LEN);
    computeWarpGrid(1.5, PARAMS, fixedState, 0.3, out);
    expect(out).toHaveLength(GRID_LEN);
    for (const v of out) expect(Number.isFinite(v)).toBe(true);
  });

  it("is deterministic for identical inputs", () => {
    const a = new Float32Array(GRID_LEN);
    const b = new Float32Array(GRID_LEN);
    computeWarpGrid(2.0, PARAMS, fixedState, 0.4, a);
    computeWarpGrid(2.0, PARAMS, fixedState, 0.4, b);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("changes output as animation time advances", () => {
    const t0 = new Float32Array(GRID_LEN);
    const t1 = new Float32Array(GRID_LEN);
    computeWarpGrid(0.0, PARAMS, fixedState, 0.0, t0);
    computeWarpGrid(5.0, PARAMS, fixedState, 0.0, t1);
    expect(Array.from(t0)).not.toEqual(Array.from(t1));
  });

  it("rotates the field as the rotation angle advances", () => {
    const r0 = new Float32Array(GRID_LEN);
    const r1 = new Float32Array(GRID_LEN);
    computeWarpGrid(1.0, PARAMS, fixedState, 0.0, r0);
    computeWarpGrid(1.0, PARAMS, fixedState, 1.0, r1);
    expect(Array.from(r0)).not.toEqual(Array.from(r1));
  });

  it("responds to master zoom", () => {
    const a = new Float32Array(GRID_LEN);
    const b = new Float32Array(GRID_LEN);
    computeWarpGrid(1.0, { ...PARAMS, masterZoom: 1.0 }, fixedState, 0.0, a);
    computeWarpGrid(1.0, { ...PARAMS, masterZoom: 2.0 }, fixedState, 0.0, b);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it("produces a varying field across the grid (not a constant)", () => {
    const out = new Float32Array(GRID_LEN);
    computeWarpGrid(1.0, PARAMS, fixedState, 0.0, out);
    let min = Infinity;
    let max = -Infinity;
    for (const v of out) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    // A real warp field spans a range of coordinates rather than one value.
    expect(max - min).toBeGreaterThan(0.1);
  });
});
