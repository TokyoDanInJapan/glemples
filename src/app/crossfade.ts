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
  /** Seconds elapsed since the fade began (only advances once the load lands). */
  private fadeTime = 0;
  /** True while a slot-1 load is in flight. */
  private loading = false;
  /** True once slot 1 holds the fully decoded incoming image. */
  private nextReady = false;
  /** Display name of the incoming image, applied to the label at the swap. */
  private nextName = "";
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

    // Kick off the incoming image's load when the hold expires. The fade itself
    // waits until the load lands, so a slow decode can never pop in mid-fade.
    if (this.timer >= this.interval && !this.loading && !this.nextReady)
      void this.loadNext();

    if (!this.nextReady) return;

    this.fadeTime += dt;
    this.fade = Math.min(this.fadeTime / FADE_DURATION, 1.0);

    if (this.fade >= 1.0) {
      this.tex.swap(0, 1);
      this.slotUrl[0] = this.slotUrl[1];
      this.renderer.uploadTexture(0, this.tex.pixels[0]!);
      this.texLabel.textContent = this.nextName;
      this.fade = 0;
      this.fadeTime = 0;
      this.timer = 0;
      this.nextReady = false;
      this.onComplete();
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
    this.resetCycle();

    // Show the first file the user just dropped, not a random one from the pool.
    if (added[0]) await this.loadAndShow(added[0]);
  }

  /**
   * Registers one or more image URLs and shows the first immediately in slot 0.
   *
   * @remarks
   * Used to seed the bundled default textures at startup; every URL also joins
   * the pool so it participates in the ongoing crossfade rotation.
   *
   * @param urls - Image URLs to register; the first is displayed.
   */
  async showUrls(urls: string[]): Promise<void> {
    this.tex.addUrls(urls);

    this.resetCycle();

    if (urls[0]) await this.loadAndShow(urls[0]);
  }

  /**
   * Invalidates any in-flight load and restarts the hold from scratch, so a
   * superseded load can never clobber a slot or resume a stale fade.
   */
  private resetCycle(): void {
    this.loadEpoch++;
    this.timer = 0;
    this.fade = 0;
    this.fadeTime = 0;
    this.loading = false;
    this.nextReady = false;
  }

  /**
   * Loads the next random image into slot 1 and uploads it, then marks the fade
   * ready to run. Failures restart the hold so a bad image is retried later
   * instead of interrupting playback.
   */
  private async loadNext(): Promise<void> {
    const url = this.tex.getRandomUrl(this.slotUrl[0] ?? undefined);

    if (!url) return;

    this.loading = true;
    const epoch = this.loadEpoch;

    try {
      const { pixels, name } = await this.tex.decode(url, true);

      if (epoch !== this.loadEpoch) return; // superseded by a drop

      this.tex.pixels[1] = pixels;
      this.slotUrl[1] = url;
      this.renderer.uploadTexture(1, pixels);
      this.nextName = name;
      this.nextReady = true;
    } catch {
      // Unreadable image: wait out another hold before trying again.
      if (epoch === this.loadEpoch) this.timer = 0;
    } finally {
      if (epoch === this.loadEpoch) this.loading = false;
    }
  }

  /**
   * Loads a specific image into slot 0 and shows it immediately (GPU upload and
   * label update). Failures are swallowed so a bad image never interrupts playback.
   *
   * @param url - Image URL to display.
   */
  private async loadAndShow(url: string): Promise<void> {
    const epoch = this.loadEpoch;

    try {
      const { pixels, name } = await this.tex.decode(url, true);

      if (epoch !== this.loadEpoch) return; // superseded by a drop

      this.tex.pixels[0] = pixels;
      this.slotUrl[0] = url;
      this.renderer.uploadTexture(0, pixels);
      this.texLabel.textContent = name;
    } catch {
      // Silently skip unreadable images.
    }
  }
}
