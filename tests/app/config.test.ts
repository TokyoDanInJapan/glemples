import { describe, it, expect } from "vitest";
import {
  UV_CELLS_X,
  UV_CELLS_Y,
  TEXTURE_SIZE,
  DEFAULT_WARP_PARAMS,
  FADE_INTERVAL,
  FADE_DURATION,
  INITIAL_MOTION_BLUR,
} from "../../src/app/config.js";

describe("config", () => {
  it("exposes positive integer grid dimensions", () => {
    for (const n of [UV_CELLS_X, UV_CELLS_Y]) {
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThan(0);
    }
  });

  it("uses a power-of-two texture size (required for REPEAT wrap)", () => {
    expect(TEXTURE_SIZE).toBeGreaterThan(0);
    expect(Math.log2(TEXTURE_SIZE) % 1).toBe(0);
  });

  it("provides all default warp parameters as finite numbers", () => {
    const keys = [
      "warpFactor",
      "rotationalSpeed",
      "modeFocusExponent",
      "masterZoom",
      "texScale",
      "speedScale",
    ] as const;
    for (const k of keys) {
      expect(typeof DEFAULT_WARP_PARAMS[k]).toBe("number");
      expect(Number.isFinite(DEFAULT_WARP_PARAMS[k])).toBe(true);
    }
  });

  it("has sensible crossfade timing and motion blur", () => {
    expect(FADE_INTERVAL).toBeGreaterThan(0);
    expect(FADE_DURATION).toBeGreaterThan(0);
    expect(INITIAL_MOTION_BLUR).toBeGreaterThanOrEqual(0);
    expect(INITIAL_MOTION_BLUR).toBeLessThanOrEqual(1);
  });
});
