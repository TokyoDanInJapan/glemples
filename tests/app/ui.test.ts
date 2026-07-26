// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { bindUI, type UIElements } from "../../src/app/ui.js";
import { createAppState, type AppState } from "../../src/app/state.js";
import type { CrossfadeController } from "../../src/app/crossfade.js";

/**
 * Builds the real DOM subtree `bindUI` expects, mirroring index.html, and
 * returns the element map alongside it.
 */
function mountDom(): UIElements {
  document.body.innerHTML = `
    <button id="btnToggleUi" aria-expanded="false">☰</button>
    <div id="ui">
      <input type="range" id="blur" />
      <input type="range" id="warp" />
      <input type="range" id="zoom" />
      <input type="range" id="speed" />
      <input type="range" id="texint" />
      <button id="btnNextTex"></button>
      <button id="btnPause"></button>
      <button id="btnFullscreen"></button>
    </div>
  `;
  document.body.className = "";

  const byId = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T;

  return {
    blur: byId<HTMLInputElement>("blur"),
    warp: byId<HTMLInputElement>("warp"),
    zoom: byId<HTMLInputElement>("zoom"),
    speed: byId<HTMLInputElement>("speed"),
    texint: byId<HTMLInputElement>("texint"),
    nextTex: byId<HTMLButtonElement>("btnNextTex"),
    pause: byId<HTMLButtonElement>("btnPause"),
    fullscreen: byId<HTMLButtonElement>("btnFullscreen"),
    toggle: byId<HTMLButtonElement>("btnToggleUi"),
  };
}

function makeCrossfade() {
  return {
    interval: 20,
    trigger: vi.fn(),
    dropFiles: vi.fn(),
  } as unknown as CrossfadeController & { trigger: ReturnType<typeof vi.fn> };
}

let els: UIElements;
let state: AppState;
let crossfade: ReturnType<typeof makeCrossfade>;

function setup(mutate: (s: AppState) => void = () => {}) {
  // A fresh document per test: bindUI attaches document-level listeners that
  // would otherwise stack across cases.
  document.body.innerHTML = "";
  els = mountDom();
  state = createAppState();
  crossfade = makeCrossfade();
  mutate(state);
  bindUI(state, crossfade, els);
}

/** Dispatches a cancelable wheel event and reports whether it was prevented. */
function wheel(deltaY: number, target: EventTarget = document.body): boolean {
  const e = new WheelEvent("wheel", {
    deltaY,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(e);
  return e.defaultPrevented;
}

function key(k: string, target: EventTarget = document.body): void {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }),
  );
}

describe("bindUI slider setup", () => {
  beforeEach(() => setup());

  it("applies each slider's range from the table, not the markup", () => {
    expect([els.blur.min, els.blur.max, els.blur.step]).toEqual([
      "0",
      "10",
      "1",
    ]);
    expect([els.zoom.min, els.zoom.max]).toEqual(["1", "300"]);
    expect([els.texint.min, els.texint.max, els.texint.step]).toEqual([
      "5",
      "120",
      "5",
    ]);
  });

  it("positions each slider from the live state at startup", () => {
    setup((s) => {
      s.params.masterZoom = 1.5;
      s.params.warpFactor = 0.15;
      s.params.speedScale = 10;
    });
    expect(els.zoom.value).toBe("150");
    expect(els.warp.value).toBe("20"); // 0.15 / 0.0075
    expect(els.speed.value).toBe("100");
    expect(els.texint.value).toBe("20");
  });

  it("writes state when a slider is dragged", () => {
    els.warp.value = "40";
    els.warp.dispatchEvent(new Event("input"));
    expect(state.params.warpFactor).toBeCloseTo(0.3);
  });

  it("round-trips every slider through its value mapping", () => {
    // toSlider must be the exact inverse of toValue, or the knob and the value
    // drift apart the first time either is used.
    for (const el of [els.blur, els.warp, els.zoom, els.speed, els.texint]) {
      const mid = String(
        Math.round((Number(el.min) + Number(el.max)) / 2 / Number(el.step)) *
          Number(el.step),
      );
      el.value = mid;
      el.dispatchEvent(new Event("input"));

      // Re-binding re-derives the position from the value it just wrote.
      const before = el.value;
      bindUI(state, crossfade, els);
      expect(el.value).toBe(before);
    }
  });
});

describe("bindUI zoom", () => {
  beforeEach(() => setup());

  it("scrolling up zooms in and prevents the page from scrolling", () => {
    expect(wheel(-100)).toBe(true);
    expect(state.params.masterZoom).toBeCloseTo(1.1);
  });

  it("scrolling down zooms out", () => {
    wheel(100);
    expect(state.params.masterZoom).toBeCloseTo(1 / 1.1);
  });

  it("syncs the zoom slider to the new zoom (× 100)", () => {
    wheel(-100);
    expect(els.zoom.value).toBe("110");
  });

  it("clamps zoom at the upper bound when scrolling up repeatedly", () => {
    for (let i = 0; i < 100; i++) wheel(-100);
    expect(state.params.masterZoom).toBe(3);
  });

  it("clamps zoom at the lower bound when scrolling down repeatedly", () => {
    for (let i = 0; i < 100; i++) wheel(100);
    expect(state.params.masterZoom).toBe(0.01);
  });

  it("the + and - keys reuse the same clamped zoom step", () => {
    key("+");
    expect(state.params.masterZoom).toBeCloseTo(1.1);
    key("-");
    expect(state.params.masterZoom).toBeCloseTo(1);
  });

  it("ignores wheel events originating inside the control panel", () => {
    const prevented = wheel(-100, els.zoom);
    expect(state.params.masterZoom).toBe(1);
    expect(prevented).toBe(false);
  });
});

describe("bindUI motion blur keys", () => {
  beforeEach(() => setup());

  it("steps the blur slider by whole notches and keeps the value in sync", () => {
    const start = Number(els.blur.value);
    key("ArrowUp");
    expect(Number(els.blur.value)).toBe(start + 1);

    // The knob must still describe the value: re-deriving the position from
    // state has to land on the same notch.
    const shown = els.blur.value;
    bindUI(state, crossfade, els);
    expect(els.blur.value).toBe(shown);
  });

  it("clamps at both ends of the slider", () => {
    for (let i = 0; i < 50; i++) key("ArrowUp");
    expect(els.blur.value).toBe("10");
    expect(state.motionBlur).toBeCloseTo(0.97);

    for (let i = 0; i < 50; i++) key("ArrowDown");
    expect(els.blur.value).toBe("0");
    expect(state.motionBlur).toBe(0);
  });
});

describe("bindUI buttons and keys", () => {
  beforeEach(() => setup());

  it("Space triggers a crossfade, except while a button is focused", () => {
    key(" ", els.pause);
    expect(crossfade.trigger).not.toHaveBeenCalled();

    key(" ");
    expect(crossfade.trigger).toHaveBeenCalledOnce();
  });

  it("pause toggles state and relabels the button, by click or by key", () => {
    els.pause.click();
    expect(state.paused).toBe(true);
    expect(els.pause.textContent).toBe("Resume (P)");

    key("p");
    expect(state.paused).toBe(false);
    expect(els.pause.textContent).toBe("Pause (P)");
  });

  it("the next-texture button triggers a crossfade", () => {
    els.nextTex.click();
    expect(crossfade.trigger).toHaveBeenCalledOnce();
  });

  it("the toggle button opens the panel on devices without hover", () => {
    expect(document.body.classList.contains("ui-open")).toBe(false);

    els.toggle.click();
    expect(document.body.classList.contains("ui-open")).toBe(true);
    expect(els.toggle.getAttribute("aria-expanded")).toBe("true");

    els.toggle.click();
    expect(document.body.classList.contains("ui-open")).toBe(false);
    expect(els.toggle.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("bindUI drag and drop", () => {
  beforeEach(() => setup());

  it("marks the body while dragging and clears it on leave", () => {
    document.dispatchEvent(
      new Event("dragover", { bubbles: true, cancelable: true }),
    );
    expect(document.body.classList.contains("dragging")).toBe(true);

    const leave = new Event("dragleave", { bubbles: true });
    Object.defineProperty(leave, "relatedTarget", { value: null });
    document.dispatchEvent(leave);
    expect(document.body.classList.contains("dragging")).toBe(false);
  });
});
