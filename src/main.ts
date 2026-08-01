// GLemples — real-time WebGL image warper
// Copyright (C) 2026 Daniel Hebberd
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Application entry point.
 *
 * @remarks
 * Resolves the DOM elements the app needs, hands them to {@link createApp}, and
 * starts the frame loop. All wiring lives in `app/app.ts`. This file exists to
 * bridge the page to that wiring and to report a startup failure legibly.
 *
 * @packageDocumentation
 */

import { createApp, type AppElements } from "./app/app.js";

import tex01Url from "./assets/tex01.webp";
import tex02Url from "./assets/tex02.webp";

/** Replaces the page with a visible message when the app can't start. */
function showFatalError(err: unknown): never {
  const msg = document.createElement("div");
  msg.style.cssText =
    "position:fixed;inset:0;display:flex;align-items:center;" +
    "justify-content:center;font-family:monospace;color:#ccc;" +
    "text-align:center;padding:24px";
  msg.textContent =
    "GLemples needs WebGL to run, but it isn't available in this browser: " +
    (err instanceof Error ? err.message : String(err));
  document.body.appendChild(msg);
  throw err;
}

/**
 * Looks up a required element by id.
 *
 * @param id - Element id to find.
 * @returns The element, narrowed to the requested type.
 * @throws If no element with that id exists.
 */
function required<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element #${id}`);
  return el as T;
}

try {
  const els: AppElements = {
    canvas: required<HTMLCanvasElement>("c"),
    fps: required("fps"),
    texName: required("texname"),
    controls: {
      blur: required<HTMLInputElement>("blur"),
      warp: required<HTMLInputElement>("warp"),
      zoom: required<HTMLInputElement>("zoom"),
      speed: required<HTMLInputElement>("speed"),
      texint: required<HTMLInputElement>("texint"),
      nextTex: required<HTMLButtonElement>("btnNextTex"),
      pause: required<HTMLButtonElement>("btnPause"),
      fullscreen: required<HTMLButtonElement>("btnFullscreen"),
      toggle: required<HTMLButtonElement>("btnToggleUi"),
    },
  };

  createApp(els, [tex01Url, tex02Url]).start();
} catch (err) {
  showFatalError(err);
}
