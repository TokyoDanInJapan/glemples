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
        this.renderer.uploadTexture(0, this.tex.pixels[0]!);
        this.fade = 0;
        this.timer = 0;
        this.onComplete();
        this.preloadCpuSlot0();
      }
    }
  }

  /** Forces the next crossfade to begin on the following {@link tick}. */
  trigger(): void {
    this.timer = this.interval;
  }

  /**
   * Registers newly dropped files and immediately shows the first one.
   *
   * @param fileList - Files from a drop event.
   */
  async dropFiles(fileList: FileList | File[]): Promise<void> {
    this.tex.addFiles(fileList);

    await this.loadAndUpload(0);

    this.timer = 0;
    this.fade = 0;
  }

  /**
   * Loads a random image into a slot and uploads it to the GPU. Failures are
   * swallowed so a bad image never interrupts playback.
   *
   * @param slot - Destination slot (0 or 1).
   */
  private async loadAndUpload(slot: 0 | 1): Promise<void> {
    const url = this.tex.getRandomUrl();

    if (!url) return;

    try {
      const name = await this.tex.loadIntoSlot(url, slot, true);

      this.renderer.uploadTexture(slot, this.tex.pixels[slot]!);

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
    const url = this.tex.getRandomUrl();

    if (!url) return;

    try {
      const name = await this.tex.loadIntoSlot(url, 0, true);
      this.texLabel.textContent = name;
    } catch {
      // Silently skip unreadable images.
    }
  }
}
