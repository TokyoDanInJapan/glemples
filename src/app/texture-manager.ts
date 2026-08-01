// GLemples — real-time WebGL image warper
// Copyright (C) 2026 Daniel Hebberd
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Loads source images and maintains the CPU-side RGBA pixel buffers ('slots')
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
   * Decoded RGBA pixel buffers for the current crossfade pair
   * (`null` until first load).
   */
  readonly pixels: [Uint8ClampedArray | null, Uint8ClampedArray | null] = [
    null,
    null,
  ];

  /**
   * Registers dropped/selected files, keeping only supported image types.
   *
   * @param fileList - Files from a drop event or file input.
   * @returns The object URLs of the files that were newly added, in order.
   */
  addFiles(fileList: FileList | File[]): string[] {
    const arr = Array.from(fileList);
    const added: string[] = [];

    for (const f of arr) {
      if (f.type.startsWith("image/")) {
        // The object URL is retained for the lifetime of the page: the file
        // stays in the rotation pool and may be re-decoded on any later fade.
        const url = URL.createObjectURL(f);
        this.files.push(url);
        added.push(url);
      }
    }

    return added;
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
   * @param exclude - A URL to avoid returning, for example the image already on
   *   screen, so consecutive picks differ. Ignored if it is the only registered
   *   image.
   * @returns A URL, or `null` if no images are registered.
   */
  getRandomUrl(exclude?: string): string | null {
    if (this.files.length === 0) return null;

    let pool = this.files;

    if (exclude !== undefined && this.files.length > 1) {
      const filtered = this.files.filter((u) => u !== exclude);
      if (filtered.length > 0) pool = filtered;
    }

    return pool[Math.floor(Math.random() * pool.length)]!;
  }

  /**
   * Loads an image and decodes it to RGBA pixels, *without* storing it in a slot.
   *
   * @remarks
   * Decoding is kept separate from slot assignment so callers can discard a
   * stale result before it clobbers a slot, for example one superseded by a
   * fresh drop.
   *
   * @param url - Image URL to load.
   * @returns The decoded pixels and the image's display name (final path segment).
   * @throws If the image fails to load.
   */
  async decode(
    url: string,
  ): Promise<{ pixels: Uint8ClampedArray; name: string }> {
    const img = await loadImage(url);
    const pixels = resampleToTextureSize(img);

    const parts = url.split("/");

    return { pixels, name: parts[parts.length - 1] ?? url };
  }

  /** Swaps the two pixel slots, promoting the faded-in image to slot 0. */
  swap(): void {
    const tmp = this.pixels[0];
    this.pixels[0] = this.pixels[1];
    this.pixels[1] = tmp;
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
 * Scales an image to fill a {@link TEXTURE_SIZE}-square canvas and returns its
 * RGBA pixels.
 *
 * @remarks
 * Scaling to fill (rather than centre-cropping) keeps a seamless source image
 * seamless, which matters because the warp samples these textures with `REPEAT`
 * wrap.
 *
 * @param img - Source image.
 * @returns RGBA pixel data of length `TEXTURE_SIZE * TEXTURE_SIZE * 4`.
 * @throws If a 2D canvas context is unavailable.
 */
function resampleToTextureSize(img: HTMLImageElement): Uint8ClampedArray {
  const offscreen = document.createElement("canvas");
  offscreen.width = TEXTURE_SIZE;
  offscreen.height = TEXTURE_SIZE;

  const ctx = offscreen.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  ctx.drawImage(img, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

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
