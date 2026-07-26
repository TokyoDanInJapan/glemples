import { describe, it, expect, vi, afterEach } from "vitest";
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

/**
 * Reloads `config.ts` with a stubbed YAML document.
 *
 * @param doc - The parsed YAML to hand the module.
 * @returns A promise for the freshly evaluated module.
 */
async function loadWith(doc: unknown) {
  vi.resetModules();
  vi.doMock("../../src/config.yaml", () => ({ default: doc }));
  return import("../../src/app/config.js");
}

/** A document that satisfies every constraint, to be broken one key at a time. */
const VALID = {
  uv_cells_x: 36,
  uv_cells_y: 28,
  texture_size: 1024,
  warp_factor: 0.22,
  mode_focus_exponent: 2.9,
  master_zoom: 1.0,
  texture_scale: 10,
  speed_scale: 10,
  zoom_min: 0.01,
  zoom_max: 3,
  zoom_step: 1.1,
  fade_interval: 20,
  fade_duration: 5,
  initial_motion_blur: 0.88,
};

describe("config validation", () => {
  afterEach(() => {
    vi.doUnmock("../../src/config.yaml");
    vi.resetModules();
  });

  it("accepts the shipped shape", async () => {
    const m = await loadWith(VALID);
    expect(m.UV_CELLS_X).toBe(36);
    expect(m.TEXTURE_SIZE).toBe(1024);
  });

  it("names the offending key when one is missing", async () => {
    const missing: Record<string, unknown> = { ...VALID };
    delete missing.texture_size;
    await expect(loadWith(missing)).rejects.toThrow(/"texture_size"/);
  });

  it("rejects a non-numeric value rather than yielding NaN", async () => {
    await expect(loadWith({ ...VALID, warp_factor: "lots" })).rejects.toThrow(
      /"warp_factor" must be a finite number/,
    );
  });

  it("rejects a texture size that is not a power of two", async () => {
    // REPEAT wrap on a non-power-of-two texture is invalid in WebGL1.
    await expect(loadWith({ ...VALID, texture_size: 1000 })).rejects.toThrow(
      /power of two/,
    );
  });

  it("rejects a grid too small to interpolate across", async () => {
    // cols - 1 is a divisor in computeWarpGrid; 1 column divides by zero.
    await expect(loadWith({ ...VALID, uv_cells_x: 1 })).rejects.toThrow(
      /"uv_cells_x" must be >= 2/,
    );
  });

  it("rejects a fractional cell count", async () => {
    await expect(loadWith({ ...VALID, uv_cells_y: 28.5 })).rejects.toThrow(
      /whole number/,
    );
  });

  it("rejects a motion blur outside 0–1", async () => {
    await expect(
      loadWith({ ...VALID, initial_motion_blur: 1.5 }),
    ).rejects.toThrow(/"initial_motion_blur" must be <= 1/);
  });

  it("rejects a zoom range that is inverted", async () => {
    await expect(
      loadWith({ ...VALID, zoom_min: 2, zoom_max: 1 }),
    ).rejects.toThrow(/"zoom_max" must be >= 2/);
  });

  it("rejects a zero-length fade that would divide by zero", async () => {
    await expect(loadWith({ ...VALID, fade_duration: 0 })).rejects.toThrow(
      /"fade_duration"/,
    );
  });

  it("rejects a document that is not a mapping at all", async () => {
    await expect(loadWith(null)).rejects.toThrow(/"uv_cells_x"/);
  });
});
