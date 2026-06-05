import { describe, it, expect, vi, beforeEach } from "vitest";
import { CrossfadeController } from "../../src/app/crossfade.js";
import { FADE_DURATION } from "../../src/app/config.js";
import type { TextureManager } from "../../src/app/texture-manager.js";
import type { Renderer } from "../../src/engine/renderer.js";

function makeFakes() {
  const buf = new Uint8ClampedArray(4);
  const tex = {
    pixels: [buf, buf, null, null],
    getRandomUrl: vi.fn(() => "img.png"),
    decode: vi.fn(async (url: string) => ({ pixels: buf, name: url })),
    addFiles: vi.fn(() => ["dropped.png"]),
    swap: vi.fn(),
  };
  const renderer = { uploadTexture: vi.fn() };
  const label = { textContent: "" } as HTMLElement;
  const onComplete = vi.fn();
  const controller = new CrossfadeController(
    tex as unknown as TextureManager,
    renderer as unknown as Renderer,
    label,
    1, // interval: 1 second
    onComplete,
  );
  return { controller, tex, renderer, label, onComplete };
}

describe("CrossfadeController", () => {
  let f: ReturnType<typeof makeFakes>;
  beforeEach(() => {
    f = makeFakes();
  });

  it("does not fade before the interval elapses", () => {
    f.controller.tick(0.5);
    expect(f.controller.fade).toBe(0);
    expect(f.tex.decode).not.toHaveBeenCalled();
  });

  it("begins loading the next texture once the interval is reached", () => {
    f.controller.tick(1.0);
    expect(f.tex.decode).toHaveBeenCalledWith("img.png", true);
  });

  it("ramps the fade between 0 and 1 mid-crossfade", () => {
    f.controller.tick(1.0); // reach interval
    f.controller.tick(FADE_DURATION / 2); // halfway through the fade
    expect(f.controller.fade).toBeGreaterThan(0);
    expect(f.controller.fade).toBeLessThan(1);
  });

  it("promotes the texture and fires onComplete when the fade finishes", () => {
    f.controller.tick(1.0);
    f.controller.tick(FADE_DURATION);
    expect(f.tex.swap).toHaveBeenCalledWith(0, 1);
    expect(f.renderer.uploadTexture).toHaveBeenCalledWith(0, expect.anything());
    expect(f.onComplete).toHaveBeenCalledOnce();
    expect(f.controller.fade).toBe(0); // reset for the next cycle
  });

  it("trigger() forces the next tick to start a crossfade", () => {
    f.controller.trigger();
    f.controller.tick(0.001);
    expect(f.tex.decode).toHaveBeenCalled();
  });

  it("dropFiles() registers files and loads the first dropped one into slot 0", async () => {
    const files = [new File([], "x.png")];
    await f.controller.dropFiles(files);
    expect(f.tex.addFiles).toHaveBeenCalledWith(files);
    // Loads the just-dropped file, not a random one from the pool.
    expect(f.tex.decode).toHaveBeenCalledWith("dropped.png", true);
    expect(f.tex.getRandomUrl).not.toHaveBeenCalled();
    expect(f.controller.fade).toBe(0);
  });
});
