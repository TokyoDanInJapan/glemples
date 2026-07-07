import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { bindUI } from "../../src/app/ui.js";
import type { UIBindings } from "../../src/app/ui.js";
import type { WarpParams } from "../../src/engine/warp.js";
import type { CrossfadeController } from "../../src/app/crossfade.js";

/**
 * Installs a minimal fake `document` that records the handlers `bindUI`
 * registers and hands back reusable fake elements for `getElementById`.
 */
function installFakeDocument() {
  const docHandlers: Record<string, EventListener> = {};
  const elements: Record<string, { value: string; textContent: string }> = {};

  const getElement = (id: string) => {
    elements[id] ??= { value: "0", textContent: "", addEventListener: vi.fn() };
    return elements[id];
  };

  const doc = {
    addEventListener: vi.fn((type: string, handler: EventListener) => {
      docHandlers[type] = handler;
    }),
    getElementById: vi.fn(getElement),
    fullscreenElement: null,
    documentElement: { requestFullscreen: vi.fn() },
    exitFullscreen: vi.fn(),
    body: { classList: { add: vi.fn(), remove: vi.fn() } },
  };

  vi.stubGlobal("document", doc);
  return { docHandlers, elements };
}

function makeBindings(): { ui: UIBindings; params: WarpParams } {
  const params = {
    masterZoom: 1,
    warpFactor: 0,
    speedScale: 1,
  } as WarpParams;
  const ui: UIBindings = {
    params,
    motionBlur: { value: 0 },
    paused: { value: false },
    crossfade: {
      interval: 1,
      trigger: vi.fn(),
    } as unknown as CrossfadeController,
    pauseBtn: {
      textContent: "",
      addEventListener: vi.fn(),
    } as unknown as HTMLButtonElement,
  };
  return { ui, params };
}

describe("bindUI wheel zoom", () => {
  let env: ReturnType<typeof installFakeDocument>;
  let params: WarpParams;

  beforeEach(() => {
    env = installFakeDocument();
    const b = makeBindings();
    params = b.params;
    bindUI(b.ui);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function wheel(deltaY: number) {
    const preventDefault = vi.fn();
    env.docHandlers.wheel({ deltaY, preventDefault } as unknown as Event);
    return preventDefault;
  }

  it("registers a non-passive wheel listener so it can preventDefault", () => {
    expect(document.addEventListener).toHaveBeenCalledWith(
      "wheel",
      expect.any(Function),
      { passive: false },
    );
  });

  it("scrolling up zooms in and prevents the page from scrolling", () => {
    const preventDefault = wheel(-100);
    expect(params.masterZoom).toBeCloseTo(1.1);
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("scrolling down zooms out", () => {
    wheel(100);
    expect(params.masterZoom).toBeCloseTo(1 / 1.1);
  });

  it("syncs the zoom slider to the new zoom (× 100)", () => {
    wheel(-100);
    expect(env.elements.zoom.value).toBe("110");
  });

  it("clamps zoom at the upper bound when scrolling up repeatedly", () => {
    for (let i = 0; i < 100; i++) wheel(-100);
    expect(params.masterZoom).toBe(3);
  });

  it("clamps zoom at the lower bound when scrolling down repeatedly", () => {
    for (let i = 0; i < 100; i++) wheel(100);
    expect(params.masterZoom).toBe(0.01);
  });

  it("the + and - keys reuse the same clamped zoom step", () => {
    env.docHandlers.keydown({ key: "+" } as KeyboardEvent);
    expect(params.masterZoom).toBeCloseTo(1.1);
    env.docHandlers.keydown({ key: "-" } as KeyboardEvent);
    expect(params.masterZoom).toBeCloseTo(1);
  });

  it("ignores wheel events originating inside the control panel", () => {
    const preventDefault = vi.fn();
    env.docHandlers.wheel({
      deltaY: -100,
      preventDefault,
      target: { closest: (sel: string) => (sel === "#ui" ? {} : null) },
    } as unknown as Event);
    expect(params.masterZoom).toBe(1);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});

describe("bindUI slider initialisation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("positions each slider from the live state at startup", () => {
    const env = installFakeDocument();
    const b = makeBindings();
    b.params.masterZoom = 1.5;
    b.params.warpFactor = 0.15;
    b.params.speedScale = 10;
    b.ui.crossfade.interval = 30;
    bindUI(b.ui);
    expect(env.elements.zoom.value).toBe("150");
    expect(env.elements.warp.value).toBe("20"); // 0.15 / (0.01 * 0.75)
    expect(env.elements.speed.value).toBe("100");
    expect(env.elements.texint.value).toBe("30");
  });
});

describe("bindUI Space key", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not trigger a crossfade when a button is focused", () => {
    const env = installFakeDocument();
    const b = makeBindings();
    bindUI(b.ui);
    env.docHandlers.keydown({
      key: " ",
      target: { tagName: "BUTTON" },
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent);
    expect(b.ui.crossfade.trigger).not.toHaveBeenCalled();

    env.docHandlers.keydown({
      key: " ",
      target: { tagName: "BODY" },
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent);
    expect(b.ui.crossfade.trigger).toHaveBeenCalledOnce();
  });
});
