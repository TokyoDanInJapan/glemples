// GLemples — real-time WebGL image warper
// Copyright (C) 2026 Daniel Hebberd
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Drives the timed crossfade between the two active image textures.
 *
 * @packageDocumentation
 */

import { FADE_DURATION } from "./config.js";
import type { TextureManager } from "./texture-manager.js";
import type { Renderer } from "../engine/renderer.js";

/**
 * Owns the texture-crossfade state machine: it holds a texture, then loads the
 * next one, fades between them over {@link FADE_DURATION} seconds, and promotes
 * the result — repeating on the configured interval.
 */
export class CrossfadeController {
  /** Current blend factor read by the render loop (0 = slot 0, 1 = slot 1). */
  fade = 0;
  /** Seconds to hold a texture before the next crossfade starts (UI-tunable). */
  interval: number;

  /** Seconds elapsed since the current hold began. */
  private timer = 0;
  /**
   * Bumped whenever a drop restarts playback. Async loads capture the epoch when
   * they start and discard their result if it no longer matches, so an in-flight
   * load from the tick loop can never clobber a freshly dropped image.
   */
  private loadEpoch = 0;
  /**
   * URL currently loaded into slots 0 and 1. Used to pick a *different* image
   * for the next crossfade so "next texture" never fades an image into itself.
   */
  private slotUrl: (string | null)[] = [null, null];
  private tex: TextureManager;
  private renderer: Renderer;
  private texLabel: HTMLElement;
  private onComplete: () => void;

  /**
   * @param tex - Texture manager owning the pixel slots.
   * @param renderer - Renderer to upload textures to.
   * @param texLabel - Element whose text shows the current texture's name.
   * @param interval - Seconds to hold each texture before fading.
   * @param onComplete - Called once each fade finishes (e.g. to re-randomise the warp).
   */
  constructor(
    tex: TextureManager,
    renderer: Renderer,
    texLabel: HTMLElement,
    interval: number,
    onComplete: () => void,
  ) {
    this.tex = tex;
    this.renderer = renderer;
    this.texLabel = texLabel;
    this.interval = interval;
    this.onComplete = onComplete;
  }

  /**
   * Advances the crossfade state machine. Call once per frame.
   *
   * @param dt - Seconds elapsed since the previous frame.
   */
  tick(dt: number): void {
    this.timer += dt;

    if (this.timer >= this.interval && this.fade === 0) this.loadAndUpload(1);

    if (this.timer >= this.interval) {
      this.fade = Math.min((this.timer - this.interval) / FADE_DURATION, 1.0);

      if (this.fade >= 1.0) {
        this.tex.swap(0, 1);
        this.slotUrl[0] = this.slotUrl[1];
        this.renderer.uploadTexture(0, this.tex.pixels[0]!);
        this.fade = 0;
        this.timer = 0;
        this.onComplete();
        this.preloadCpuSlot0();
      }
    }
  }

  /**
   * Forces the next crossfade to begin on the following {@link tick}.
   *
   * @remarks
   * No-op while a crossfade is already running, so a click mid-fade can't reset
   * the in-progress fade back to the start.
   */
  trigger(): void {
    if (this.fade === 0) this.timer = this.interval;
  }

  /**
   * Registers newly dropped files and immediately shows the first one.
   *
   * @param fileList - Files from a drop event.
   */
  async dropFiles(fileList: FileList | File[]): Promise<void> {
    const added = this.tex.addFiles(fileList);

    // Cancel any load the tick loop has in flight, then restart the hold before
    // awaiting so a mid-fade swap can't race with the dropped image.
    this.loadEpoch++;
    this.timer = 0;
    this.fade = 0;

    // Show the first file the user just dropped, not a random one from the pool.
    await this.loadAndUpload(0, added[0]);
  }

  /**
   * Registers a single image URL and shows it immediately in slot 0.
   *
   * @remarks
   * Used to seed the bundled default texture at startup; the URL also joins the
   * pool so it participates in the ongoing crossfade rotation.
   *
   * @param url - Image URL to register and display.
   */
  async showUrl(url: string): Promise<void> {
    this.tex.addUrls([url]);

    this.loadEpoch++;
    this.timer = 0;
    this.fade = 0;

    await this.loadAndUpload(0, url);
  }

  /**
   * Loads a random image into a slot and uploads it to the GPU. Failures are
   * swallowed so a bad image never interrupts playback.
   *
   * @param slot - Destination slot (0 or 1).
   * @param url - Specific image to load; defaults to a random registered one.
   */
  private async loadAndUpload(slot: 0 | 1, url?: string): Promise<void> {
    url ??= this.tex.getRandomUrl(this.slotUrl[0] ?? undefined) ?? undefined;

    if (!url) return;

    const epoch = this.loadEpoch;

    try {
      const { pixels, name } = await this.tex.decode(url, true);

      if (epoch !== this.loadEpoch) return; // superseded by a drop

      this.tex.pixels[slot] = pixels;
      this.slotUrl[slot] = url;
      this.renderer.uploadTexture(slot, pixels);

      if (slot === 0) this.texLabel.textContent = name;
    } catch {
      // Silently skip unreadable images.
    }
  }

  /**
   * Loads the next image into slot 0's CPU buffer (without a GPU upload) so it
   * is ready to display after the upcoming swap.
   */
  private async preloadCpuSlot0(): Promise<void> {
    const url = this.tex.getRandomUrl(this.slotUrl[0] ?? undefined);

    if (!url) return;

    const epoch = this.loadEpoch;

    try {
      const { pixels, name } = await this.tex.decode(url, true);

      if (epoch !== this.loadEpoch) return; // superseded by a drop

      this.tex.pixels[0] = pixels;
      this.texLabel.textContent = name;
    } catch {
      // Silently skip unreadable images.
    }
  }
}
