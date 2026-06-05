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
 * Loads source images and maintains the CPU-side RGBA pixel buffers ("slots")
 * that get uploaded to the GPU.
 *
 * @remarks
 * Every image is normalised to {@link TEXTURE_SIZE}×{@link TEXTURE_SIZE} RGBA so
 * the slots are interchangeable. Slots 0 and 1 back the active crossfade pair.
 *
 * @packageDocumentation
 */

import { TEXTURE_SIZE } from "./config.js";

/** Manages the registry of source images and their decoded pixel slots. */
export class TextureManager {
  /** Object URLs / data URLs of images available to load. */
  private files: string[] = [];

  /**
   * Decoded RGBA pixel buffers, one per slot (`null` until first load).
   * Slots 0 and 1 hold the current crossfade pair.
   */
  readonly pixels: (Uint8ClampedArray | null)[] = [null, null, null, null];

  /**
   * Registers dropped/selected files, keeping only supported image types.
   *
   * @param fileList - Files from a drop event or file input.
   */
  addFiles(fileList: FileList | File[]): void {
    const arr = Array.from(fileList);

    for (const f of arr) {
      if (/\.(jpe?g|png|bmp|tga|gif|webp)$/i.test(f.name)) {
        this.files.push(URL.createObjectURL(f));
      }
    }
  }

  /**
   * Registers image URLs directly.
   *
   * @param urls - Image URLs to add to the registry.
   */
  addUrls(urls: string[]): void {
    this.files.push(...urls);
  }

  /** Number of images currently registered. */
  get fileCount(): number {
    return this.files.length;
  }

  /**
   * Picks a random registered image URL.
   *
   * @returns A URL, or `null` if no images are registered.
   */
  getRandomUrl(): string | null {
    if (this.files.length === 0) return null;
    return this.files[Math.floor(Math.random() * this.files.length)];
  }

  /**
   * Loads an image and decodes it into the given pixel slot.
   *
   * @param url - Image URL to load.
   * @param slot - Destination slot index.
   * @param resize - If `true`, scale to fill; otherwise centre-crop when large enough.
   * @returns The image's display name (final path segment).
   * @throws If the image fails to load.
   */
  async loadIntoSlot(
    url: string,
    slot: number,
    resize: boolean,
  ): Promise<string> {
    const img = await loadImage(url);
    const buf = resampleTo256(img, resize);

    this.pixels[slot] = buf;

    const parts = url.split("/");

    return parts[parts.length - 1] ?? url;
  }

  /**
   * Linearly blends two slots into a third, on the CPU.
   *
   * @param src1 - First source slot.
   * @param src2 - Second source slot.
   * @param dest - Destination slot (allocated if empty).
   * @param t - Blend factor: 0 yields `src1`, 1 yields `src2`.
   */
  blend(src1: number, src2: number, dest: number, t: number): void {
    const a = this.pixels[src1];
    const b = this.pixels[src2];

    if (!a || !b) return;

    if (!this.pixels[dest]) {
      this.pixels[dest] = new Uint8ClampedArray(
        TEXTURE_SIZE * TEXTURE_SIZE * 4,
      );
    }

    const d = this.pixels[dest]!;
    const m1 = ((1.0 - t) * 255) | 0;
    const m2 = (t * 255) | 0;
    const n = TEXTURE_SIZE * TEXTURE_SIZE * 4;

    for (let i = 0; i < n; i++) {
      d[i] = (a[i] * m1 + b[i] * m2) >> 8;
    }
  }

  /**
   * Swaps two pixel slots (used to promote the faded-in image to slot 0).
   *
   * @param s1 - First slot index.
   * @param s2 - Second slot index.
   */
  swap(s1: number, s2: number): void {
    const tmp = this.pixels[s1];
    this.pixels[s1] = this.pixels[s2];
    this.pixels[s2] = tmp;
  }
}

/**
 * Loads an image element from a URL.
 *
 * @param url - Image URL.
 * @returns A promise resolving to the loaded {@link HTMLImageElement}.
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Renders an image to a {@link TEXTURE_SIZE}-square canvas and returns its RGBA pixels.
 *
 * @param img - Source image.
 * @param resize - If `true` (or the image is smaller than the target), scale to
 *   fill; otherwise centre-crop.
 * @returns RGBA pixel data of length `TEXTURE_SIZE * TEXTURE_SIZE * 4`.
 */
function resampleTo256(
  img: HTMLImageElement,
  resize: boolean,
): Uint8ClampedArray {
  const offscreen = document.createElement("canvas");
  offscreen.width = TEXTURE_SIZE;
  offscreen.height = TEXTURE_SIZE;
  const ctx = offscreen.getContext("2d")!;

  if (
    resize ||
    img.naturalWidth < TEXTURE_SIZE ||
    img.naturalHeight < TEXTURE_SIZE
  ) {
    ctx.drawImage(img, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  } else {
    const sx = (img.naturalWidth - TEXTURE_SIZE) / 2;
    const sy = (img.naturalHeight - TEXTURE_SIZE) / 2;

    ctx.drawImage(
      img,
      sx,
      sy,
      TEXTURE_SIZE,
      TEXTURE_SIZE,
      0,
      0,
      TEXTURE_SIZE,
      TEXTURE_SIZE,
    );
  }

  return ctx.getImageData(0, 0, TEXTURE_SIZE, TEXTURE_SIZE).data;
}

/**
 * Generates a colourful plasma texture, used as a fallback before any image loads.
 *
 * @returns RGBA pixel data of length `TEXTURE_SIZE * TEXTURE_SIZE * 4`.
 */
export function makeProceduralTexture(): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(TEXTURE_SIZE * TEXTURE_SIZE * 4);

  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const fx = x / TEXTURE_SIZE;
      const fy = y / TEXTURE_SIZE;
      const r = 0.5 + 0.5 * Math.sin(fx * Math.PI * 4 + fy * Math.PI * 2);
      const g = 0.5 + 0.5 * Math.sin(fx * Math.PI * 2 - fy * Math.PI * 4 + 1.0);
      const b = 0.5 + 0.5 * Math.sin((fx + fy) * Math.PI * 6 + 2.0);
      const i = (y * TEXTURE_SIZE + x) * 4;

      buf[i] = (r * 255) | 0;
      buf[i + 1] = (g * 255) | 0;
      buf[i + 2] = (b * 255) | 0;
      buf[i + 3] = 255;
    }
  }

  return buf;
}
