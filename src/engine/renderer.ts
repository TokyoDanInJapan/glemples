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

import warpVertSrc from "./shaders/warp.vert?raw";
import warpFragSrc from "./shaders/warp.frag?raw";
import blitVertSrc from "./shaders/blit.vert?raw";
import blitFragSrc from "./shaders/blit.frag?raw";

import { UV_CELLS_X, UV_CELLS_Y, TEXTURE_SIZE } from "../app/config.js";

import {
  createProgram,
  makeTexture,
  makeFloatTexture,
  makeFB,
  bindUnit,
} from "./webgl-utils.js";

/**
 * Two-pass WebGL renderer for the warp effect.
 *
 * @remarks
 * Each frame runs a **warp pass** that samples the source textures through the
 * warp grid and blends with the previous frame for motion blur (rendered into a
 * ping-pong framebuffer), followed by a **blit pass** that copies the result to
 * the canvas. The framebuffers are then swapped so this frame becomes next
 * frame's motion-blur source.
 */
export class Renderer {
  private gl: WebGLRenderingContext;
  private canvas: HTMLCanvasElement;

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
  private front = 0;

  /**
   * Sets up both shader programs, the geometry, and all textures/framebuffers.
   *
   * @param canvas - The canvas to render into.
   * @throws If WebGL or the required `OES_texture_float` extension is unavailable.
   */
  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", {
      antialias: false,
      preserveDrawingBuffer: false,
    });

    if (!gl) throw new Error("WebGL not supported");

    this.gl = gl;
    this.canvas = canvas;
    this.init();
  }

  /**
   * Recreates every GL resource on the (restored) context. Call after a
   * `webglcontextrestored` event; the caller must then re-upload the source
   * textures and re-apply the canvas size.
   */
  restore(): void {
    this.init();
  }

  /** Builds all GL resources; shared by construction and context restore. */
  private init(): void {
    const gl = this.gl;
    const canvas = this.canvas;

    if (!gl.getExtension("OES_texture_float"))
      throw new Error("OES_texture_float not supported");

    this.front = 0;

    const quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    this.warpProg = createProgram(gl, warpVertSrc, warpFragSrc);
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

    this.blitProg = createProgram(gl, blitVertSrc, blitFragSrc);
    gl.useProgram(this.blitProg);

    const blitAPos = gl.getAttribLocation(this.blitProg, "a_pos");

    gl.enableVertexAttribArray(blitAPos);
    gl.vertexAttribPointer(blitAPos, 2, gl.FLOAT, false, 0, 0);

    this.blitU = { tex: gl.getUniformLocation(this.blitProg, "u_tex")! };

    this.gridTex = makeFloatTexture(gl, UV_CELLS_X, UV_CELLS_Y);

    this.imgTex = [
      makeTexture(gl, TEXTURE_SIZE, TEXTURE_SIZE, null, gl.LINEAR, gl.REPEAT),
      makeTexture(gl, TEXTURE_SIZE, TEXTURE_SIZE, null, gl.LINEAR, gl.REPEAT),
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

    for (let i = 0; i < 2; i++) {
      gl.bindTexture(gl.TEXTURE_2D, this.fbTex[i]);
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
   * @param pixels - RGBA data of size {@link TEXTURE_SIZE}².
   */
  uploadTexture(slot: 0 | 1, pixels: Uint8ClampedArray): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex[slot]);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      TEXTURE_SIZE,
      TEXTURE_SIZE,
      0,
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
    const back = 1 - this.front;

    // Upload warp grid as LUMINANCE_ALPHA float texture.
    gl.bindTexture(gl.TEXTURE_2D, this.gridTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.LUMINANCE_ALPHA,
      UV_CELLS_X,
      UV_CELLS_Y,
      0,
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
    gl.uniform2f(this.warpU.gridSize, UV_CELLS_X, UV_CELLS_Y);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(this.blitProg);

    bindUnit(gl, 0, this.fbTex[back], this.blitU.tex);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    this.front = back;
  }
}
