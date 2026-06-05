import { describe, it, expect } from "vitest";
import {
  TextureManager,
  makeProceduralTexture,
} from "../../src/app/texture-manager.js";
import { TEXTURE_SIZE } from "../../src/app/config.js";

const PIXELS = TEXTURE_SIZE * TEXTURE_SIZE * 4;

describe("makeProceduralTexture", () => {
  it("returns a fully opaque RGBA buffer of the right size", () => {
    const buf = makeProceduralTexture();
    expect(buf).toHaveLength(PIXELS);
    // Every 4th byte is alpha and must be fully opaque.
    for (let i = 3; i < buf.length; i += 4) expect(buf[i]).toBe(255);
  });
});

describe("TextureManager registry", () => {
  it("starts empty and reports no random URL", () => {
    const tm = new TextureManager();
    expect(tm.fileCount).toBe(0);
    expect(tm.getRandomUrl()).toBeNull();
  });

  it("tracks added URLs and only returns registered ones", () => {
    const tm = new TextureManager();
    tm.addUrls(["a.png", "b.jpg", "c.webp"]);
    expect(tm.fileCount).toBe(3);
    for (let n = 0; n < 20; n++)
      expect(["a.png", "b.jpg", "c.webp"]).toContain(tm.getRandomUrl());
  });
});

describe("TextureManager.swap", () => {
  it("exchanges two pixel slots by reference", () => {
    const tm = new TextureManager();
    const a = new Uint8ClampedArray([1, 2, 3, 4]);
    const b = new Uint8ClampedArray([5, 6, 7, 8]);
    tm.pixels[0] = a;
    tm.pixels[1] = b;
    tm.swap(0, 1);
    expect(tm.pixels[0]).toBe(b);
    expect(tm.pixels[1]).toBe(a);
  });
});

describe("TextureManager.blend", () => {
  it("does nothing when a source slot is empty", () => {
    const tm = new TextureManager();
    tm.pixels[0] = new Uint8ClampedArray(PIXELS);
    // src2 (slot 1) is null → blend should bail out without allocating dest.
    tm.blend(0, 1, 2, 0.5);
    expect(tm.pixels[2]).toBeNull();
  });

  it("returns the first source at t=0 and the second at t=1", () => {
    const tm = new TextureManager();
    const a = new Uint8ClampedArray(PIXELS);
    const b = new Uint8ClampedArray(PIXELS);
    a[0] = 200;
    b[0] = 80;
    tm.pixels[0] = a;
    tm.pixels[1] = b;

    tm.blend(0, 1, 2, 0);
    // d = (a*255) >> 8  ≈ a, within one quantisation step.
    expect(tm.pixels[2]![0]).toBeGreaterThanOrEqual(199);
    expect(tm.pixels[2]![0]).toBeLessThanOrEqual(200);

    tm.blend(0, 1, 2, 1);
    expect(tm.pixels[2]![0]).toBeGreaterThanOrEqual(79);
    expect(tm.pixels[2]![0]).toBeLessThanOrEqual(80);
  });
});
