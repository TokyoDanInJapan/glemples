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
    // Every 4th byte is alpha and must be fully opaque. Scan in plain JS —
    // a per-byte expect() is ~1M assertions and times out on slow CI runners.
    let transparentBytes = 0;
    for (let i = 3; i < buf.length; i += 4)
      if (buf[i] !== 255) transparentBytes++;
    expect(transparentBytes).toBe(0);
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

  it("never returns the excluded URL when alternatives exist", () => {
    const tm = new TextureManager();
    tm.addUrls(["a.png", "b.jpg", "c.webp"]);
    for (let n = 0; n < 50; n++)
      expect(tm.getRandomUrl("a.png")).not.toBe("a.png");
  });

  it("ignores the exclusion when it is the only registered image", () => {
    const tm = new TextureManager();
    tm.addUrls(["a.png"]);
    expect(tm.getRandomUrl("a.png")).toBe("a.png");
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
