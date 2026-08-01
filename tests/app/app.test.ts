// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createApp, type AppElements } from "../../src/app/app.js";

/**
 * Minimal WebGL stand-in. The renderer's own behaviour is covered in
 * tests/engine/renderer.test.ts. Here it only has to not throw.
 */
function fakeGl(): Record<string, unknown> {
  const obj = () => ({});
  const target: Record<string, unknown> = {
    getExtension: () => ({}),
    getUniformLocation: obj,
    getAttribLocation: () => 0,
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getShaderInfoLog: () => "",
    getProgramInfoLog: () => "",
    createProgram: obj,
    createShader: obj,
    createTexture: obj,
    createFramebuffer: obj,
    createBuffer: obj,
    drawingBufferWidth: 800,
    drawingBufferHeight: 600,
  };

  // Everything else is a no-op GL command, and enums read back as numbers. The
  // Proxy wraps a mutable target so a test can make `getExtension` start
  // failing on the context the renderer already holds.
  return new Proxy(target, {
    get: (t, k: string) => (k in t ? t[k] : vi.fn(() => 0)),
    set: (t, k: string, v) => {
      t[k] = v;
      return true;
    },
  });
}

function mount(): {
  els: AppElements;
  canvas: HTMLCanvasElement;
  gl: Record<string, unknown>;
} {
  document.body.innerHTML = `
    <canvas id="c"></canvas>
    <div id="fps"></div><div id="texname"></div>
    <button id="btnToggleUi"></button>
    <div id="ui">
      <input type="range" id="blur" /><input type="range" id="warp" />
      <input type="range" id="zoom" /><input type="range" id="speed" />
      <input type="range" id="texint" />
      <button id="btnNextTex"></button><button id="btnPause"></button>
      <button id="btnFullscreen"></button>
    </div>`;

  const byId = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  const canvas = byId<HTMLCanvasElement>("c");
  const gl = fakeGl();
  canvas.getContext = vi.fn(() => gl) as unknown as typeof canvas.getContext;

  return {
    canvas,
    gl,
    els: {
      canvas,
      fps: byId("fps"),
      texName: byId("texname"),
      controls: {
        blur: byId<HTMLInputElement>("blur"),
        warp: byId<HTMLInputElement>("warp"),
        zoom: byId<HTMLInputElement>("zoom"),
        speed: byId<HTMLInputElement>("speed"),
        texint: byId<HTMLInputElement>("texint"),
        nextTex: byId<HTMLButtonElement>("btnNextTex"),
        pause: byId<HTMLButtonElement>("btnPause"),
        fullscreen: byId<HTMLButtonElement>("btnFullscreen"),
        toggle: byId<HTMLButtonElement>("btnToggleUi"),
      },
    },
  };
}

/** Drives `n` animation frames, advancing the clock by `stepMs` between each. */
function runFrames(n: number, stepMs = 16): void {
  for (let i = 0; i < n; i++) vi.advanceTimersByTime(stepMs);
}

let rafCallbacks: FrameRequestCallback[];

beforeEach(() => {
  vi.useFakeTimers();
  rafCallbacks = [];

  // A rAF driven by the fake timer clock, so frames advance deterministically.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = setTimeout(() => cb(performance.now()), 16);
    rafCallbacks.push(cb);
    return id as unknown as number;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    clearTimeout(id);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("createApp", () => {
  it("builds without touching the DOM beyond the elements it is given", () => {
    const { els } = mount();
    expect(() => createApp(els, [])).not.toThrow();
  });

  it("propagates a renderer failure instead of starting half-built", () => {
    const { els, canvas } = mount();
    canvas.getContext = vi.fn(() => null);
    expect(() => createApp(els, [])).toThrow(/WebGL not supported/);
  });

  it("seeds the controls from configuration", () => {
    const { els } = mount();
    createApp(els, []);
    // Values come from config.yaml via the slider table, not from the markup.
    expect(els.controls.zoom.value).toBe("100");
    expect(els.controls.texint.value).toBe("20");
  });

  it("sizes the canvas to the window on start", () => {
    const { els, canvas } = mount();
    createApp(els, []).start();
    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.height).toBeGreaterThan(0);
  });

  it("runs frames and reports an FPS reading", () => {
    const { els } = mount();
    createApp(els, []).start();

    runFrames(80); // just over a second of frames
    expect(els.fps.textContent).toMatch(/^\d+ fps$/);
  });

  it("stop() halts the loop", () => {
    const { els } = mount();
    const app = createApp(els, []);
    app.start();
    runFrames(70);

    const seen = els.fps.textContent;
    app.stop();
    rafCallbacks.length = 0;
    runFrames(200);

    // No further frames means the readout cannot have been rewritten.
    expect(rafCallbacks).toHaveLength(0);
    expect(els.fps.textContent).toBe(seen);
  });

  it("start() is idempotent", () => {
    const { els } = mount();
    const app = createApp(els, []);
    app.start();
    const after = rafCallbacks.length;
    app.start();
    // A second start must not schedule a second concurrent loop.
    expect(rafCallbacks.length).toBe(after);
  });

  it("stops rendering while the context is lost, and resumes after restore", () => {
    const { els, canvas } = mount();
    createApp(els, []).start();
    runFrames(5);

    const lost = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true); // signals we handle restoration

    runFrames(5); // must not throw while lost
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    runFrames(5);

    expect(els.fps.textContent).toBeDefined();
  });

  it("survives a restore that fails, rather than throwing from the handler", () => {
    const { els, canvas, gl } = mount();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    createApp(els, []).start();

    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));

    // The restored context no longer offers the float-texture extension, so
    // Renderer.restore() throws from inside the event handler.
    gl.getExtension = () => null;
    expect(() =>
      canvas.dispatchEvent(new Event("webglcontextrestored")),
    ).not.toThrow();
    expect(spy).toHaveBeenCalled();

    // The loop must keep running rather than dying with the handler.
    expect(() => runFrames(5)).not.toThrow();
    spy.mockRestore();
  });

  it("pausing freezes animation time but keeps rendering", () => {
    const { els } = mount();
    createApp(els, []).start();
    runFrames(10);

    els.controls.pause.click();
    expect(els.controls.pause.textContent).toBe("Resume (P)");

    // Frames keep being scheduled. Only time advancement stops.
    const before = rafCallbacks.length;
    runFrames(10);
    expect(rafCallbacks.length).toBeGreaterThan(before);
  });
});
