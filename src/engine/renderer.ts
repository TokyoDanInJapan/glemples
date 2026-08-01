// GLemples — real-time WebGL image warper
// Copyright (C) 2026 Daniel Hebberd
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Both passes draw the same full-screen triangle strip, so they share a vertex
// shader.
import fullscreenVertSrc from "./shaders/fullscreen.vert?raw";
import warpFragSrc from "./shaders/warp.frag?raw";
import blitFragSrc from "./shaders/blit.frag?raw";

import {
  createProgram,
  makeTexture,
  makeFloatTexture,
  makeFB,
  bindUnit,
} from "./webgl-utils.js";

/** Fixed dimensions the renderer allocates its GL resources against. */
export interface RendererOptions {
  /** Warp-grid columns. Must match the grid the caller computes. */
  gridWidth: number;
  /** Warp-grid rows. Must match the grid the caller computes. */
  gridHeight: number;
  /** Edge length of each square source texture. Power-of-two for `REPEAT` wrap. */
  textureSize: number;
}

/**
 * Two-pass WebGL renderer for the warp effect.
 *
 * @remarks
 * Each frame runs a **warp pass** and then a **blit pass**. The warp pass
 * samples the source textures through the warp grid, blends the result with the
 * previous frame for motion blur, and renders into a ping-pong framebuffer. The
 * blit pass copies that framebuffer to the canvas. The two framebuffers are then
 * swapped, so this frame becomes the next frame's motion-blur source.
 *
 * Grid and texture dimensions are supplied by the caller so this module stays
 * independent of application configuration.
 */
export class Renderer {
  private gl: WebGLRenderingContext;
  private canvas: HTMLCanvasElement;
  private opts: RendererOptions;

  private warpProg!: WebGLProgram;
  private warpU!: {
    grid: WebGLUniformLocation;
    tex0: WebGLUniformLocation;
    tex1: WebGLUniformLocation;
    prev: WebGLUniformLocation;
    blend: WebGLUniformLocation;
    texfade: WebGLUniformLocation;
    gridSize: WebGLUniformLocation;
  };

  private blitProg!: WebGLProgram;
  private blitU!: { tex: WebGLUniformLocation };

  private gridTex!: WebGLTexture;
  private imgTex!: [WebGLTexture, WebGLTexture];
  private fbTex!: [WebGLTexture, WebGLTexture];
  private fb!: [WebGLFramebuffer, WebGLFramebuffer];
  private front: 0 | 1 = 0;

  /**
   * Sets up both shader programs, the geometry, and all textures/framebuffers.
   *
   * @param canvas - The canvas to render into.
   * @param opts - Grid and texture dimensions to allocate against.
   * @throws If WebGL or the required `OES_texture_float` extension is unavailable.
   */
  constructor(canvas: HTMLCanvasElement, opts: RendererOptions) {
    const gl = canvas.getContext("webgl", {
      antialias: false,
      preserveDrawingBuffer: false,
    });

    if (!gl) throw new Error("WebGL not supported");

    this.gl = gl;
    this.canvas = canvas;
    this.opts = opts;
    this.init();
  }

  /**
   * Recreates every GL resource on the (restored) context. Call after a
   * `webglcontextrestored` event. The caller must then re-upload the source
   * textures and re-apply the canvas size.
   */
  restore(): void {
    this.init();
  }

  /** Builds all GL resources. Shared by construction and context restore. */
  private init(): void {
    const gl = this.gl;
    const canvas = this.canvas;

    if (!gl.getExtension("OES_texture_float"))
      throw new Error("OES_texture_float not supported");

    this.front = 0;

    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    this.warpProg = createProgram(gl, fullscreenVertSrc, warpFragSrc);
    gl.useProgram(this.warpProg);

    const warpAPos = gl.getAttribLocation(this.warpProg, "a_pos");

    gl.enableVertexAttribArray(warpAPos);
    gl.vertexAttribPointer(warpAPos, 2, gl.FLOAT, false, 0, 0);

    this.warpU = {
      grid: gl.getUniformLocation(this.warpProg, "u_grid")!,
      tex0: gl.getUniformLocation(this.warpProg, "u_tex0")!,
      tex1: gl.getUniformLocation(this.warpProg, "u_tex1")!,
      prev: gl.getUniformLocation(this.warpProg, "u_prev")!,
      blend: gl.getUniformLocation(this.warpProg, "u_blend")!,
      texfade: gl.getUniformLocation(this.warpProg, "u_texfade")!,
      gridSize: gl.getUniformLocation(this.warpProg, "u_gridSize")!,
    };

    this.blitProg = createProgram(gl, fullscreenVertSrc, blitFragSrc);
    gl.useProgram(this.blitProg);

    const blitAPos = gl.getAttribLocation(this.blitProg, "a_pos");

    gl.enableVertexAttribArray(blitAPos);
    gl.vertexAttribPointer(blitAPos, 2, gl.FLOAT, false, 0, 0);

    this.blitU = { tex: gl.getUniformLocation(this.blitProg, "u_tex")! };

    const { gridWidth, gridHeight, textureSize } = this.opts;

    this.gridTex = makeFloatTexture(gl, gridWidth, gridHeight);

    this.imgTex = [
      makeTexture(gl, textureSize, textureSize, null, gl.LINEAR, gl.REPEAT),
      makeTexture(gl, textureSize, textureSize, null, gl.LINEAR, gl.REPEAT),
    ];

    this.fbTex = [
      makeTexture(gl, canvas.width, canvas.height, null, gl.LINEAR),
      makeTexture(gl, canvas.width, canvas.height, null, gl.LINEAR),
    ];

    this.fb = [makeFB(gl, this.fbTex[0]), makeFB(gl, this.fbTex[1])];
  }

  /**
   * Reallocates the ping-pong framebuffer textures to a new canvas size.
   *
   * @param w - New width in pixels.
   * @param h - New height in pixels.
   */
  resize(w: number, h: number): void {
    const gl = this.gl;

    for (const tex of this.fbTex) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        w,
        h,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
    }
  }

  /**
   * Uploads RGBA pixels into one of the two source image textures.
   *
   * @param slot - Which image texture to replace (0 or 1).
   * @param pixels - RGBA data of size {@link RendererOptions.textureSize}².
   */
  uploadTexture(slot: 0 | 1, pixels: Uint8ClampedArray): void {
    const gl = this.gl;
    const size = this.opts.textureSize;

    gl.bindTexture(gl.TEXTURE_2D, this.imgTex[slot]);
    // Storage was allocated at the same size in init(), so this is a subimage
    // update rather than a reallocation.
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      size,
      size,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
  }

  /**
   * Renders one frame: warp pass into the back framebuffer, then blit to canvas.
   *
   * @param gridData - Packed warp grid `[u0, v0, …]` from {@link computeWarpGrid}.
   * @param motionBlur - Fraction of the previous frame to retain (0–~0.97).
   * @param texFade - Crossfade factor between the two source textures (0–1).
   */
  render(gridData: Float32Array, motionBlur: number, texFade: number): void {
    const gl = this.gl;
    const back = this.front === 0 ? 1 : 0;
    const { gridWidth, gridHeight } = this.opts;

    // Refresh the warp grid (a LUMINANCE_ALPHA float texture). texSubImage2D
    // rather than texImage2D: the storage never changes size, and reallocating
    // it sixty times a second is pure waste.
    gl.bindTexture(gl.TEXTURE_2D, this.gridTex);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      gridWidth,
      gridHeight,
      gl.LUMINANCE_ALPHA,
      gl.FLOAT,
      gridData,
    );

    // Warp pass → render into back framebuffer.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb[back]);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(this.warpProg);

    bindUnit(gl, 0, this.gridTex, this.warpU.grid);
    bindUnit(gl, 1, this.imgTex[0], this.warpU.tex0);
    bindUnit(gl, 2, this.imgTex[1], this.warpU.tex1);
    bindUnit(gl, 3, this.fbTex[this.front], this.warpU.prev);

    gl.uniform1f(this.warpU.blend, motionBlur);
    gl.uniform1f(this.warpU.texfade, texFade);
    gl.uniform2f(this.warpU.gridSize, gridWidth, gridHeight);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(this.blitProg);

    bindUnit(gl, 0, this.fbTex[back], this.blitU.tex);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    this.front = back;
  }
}
