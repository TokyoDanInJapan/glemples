import { describe, it, expect, vi, beforeEach } from "vitest";
import { CrossfadeController } from "../../src/app/crossfade.js";
import { FADE_DURATION } from "../../src/app/config.js";
import type { TextureManager } from "../../src/app/texture-manager.js";
import type { Renderer } from "../../src/engine/renderer.js";

/** Flushes pending microtasks so in-flight decode() promises settle. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function makeFakes() {
  const buf = new Uint8ClampedArray(4);
  const tex = {
    pixels: [buf, buf] as (Uint8ClampedArray | null)[],
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

  it("does not advance the fade until the incoming texture has loaded", async () => {
    let resolveDecode!: (v: {
      pixels: Uint8ClampedArray;
      name: string;
    }) => void;
    f.tex.decode.mockImplementationOnce(
      () => new Promise((r) => (resolveDecode = r)),
    );

    f.controller.tick(1.0); // reach interval, load starts
    f.controller.tick(2.0); // plenty of time passes while the decode hangs
    expect(f.controller.fade).toBe(0);

    resolveDecode({ pixels: new Uint8ClampedArray(4), name: "slow.png" });
    await flush();

    f.controller.tick(FADE_DURATION / 2);
    expect(f.controller.fade).toBeGreaterThan(0);
    expect(f.controller.fade).toBeLessThan(1);
  });

  it("uploads the incoming texture to slot 1 before the fade starts", async () => {
    f.controller.tick(1.0);
    await flush();
    expect(f.renderer.uploadTexture).toHaveBeenCalledWith(1, expect.anything());
  });

  it("ramps the fade between 0 and 1 mid-crossfade", async () => {
    f.controller.tick(1.0); // reach interval
    await flush(); // let the decode land
    f.controller.tick(FADE_DURATION / 2); // halfway through the fade
    expect(f.controller.fade).toBeGreaterThan(0);
    expect(f.controller.fade).toBeLessThan(1);
  });

  it("promotes the texture and fires onComplete when the fade finishes", async () => {
    f.controller.tick(1.0);
    await flush();
    f.controller.tick(FADE_DURATION);
    expect(f.tex.swap).toHaveBeenCalledWith(0, 1);
    expect(f.renderer.uploadTexture).toHaveBeenCalledWith(0, expect.anything());
    expect(f.onComplete).toHaveBeenCalledOnce();
    expect(f.controller.fade).toBe(0); // reset for the next cycle
  });

  it("updates the label to the incoming texture only at the swap", async () => {
    f.controller.tick(1.0);
    await flush();
    // Fade is running but not finished: label still shows the current texture.
    f.controller.tick(FADE_DURATION / 2);
    expect(f.label.textContent).toBe("");
    f.controller.tick(FADE_DURATION / 2);
    expect(f.label.textContent).toBe("img.png");
  });

  it("waits out another hold after a failed load instead of fading", async () => {
    f.tex.decode.mockRejectedValueOnce(new Error("bad image"));
    f.controller.tick(1.0);
    await flush();
    f.controller.tick(FADE_DURATION);
    expect(f.controller.fade).toBe(0);
    expect(f.tex.swap).not.toHaveBeenCalled();
    // After another full hold the load is retried.
    f.controller.tick(1.0);
    expect(f.tex.decode).toHaveBeenCalledTimes(2);
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
    expect(f.label.textContent).toBe("dropped.png");
  });

  it("a drop mid-load discards the in-flight texture", async () => {
    let resolveDecode!: (v: {
      pixels: Uint8ClampedArray;
      name: string;
    }) => void;
    f.tex.decode.mockImplementationOnce(
      () => new Promise((r) => (resolveDecode = r)),
    );

    f.controller.tick(1.0); // slot-1 load starts (hangs)
    await f.controller.dropFiles([new File([], "x.png")]);

    resolveDecode({ pixels: new Uint8ClampedArray(4), name: "stale.png" });
    await flush();

    // The stale load must not arm a fade or touch slot 1.
    f.controller.tick(0.5);
    expect(f.controller.fade).toBe(0);
    expect(f.renderer.uploadTexture).not.toHaveBeenCalledWith(
      1,
      expect.anything(),
    );
  });
});
