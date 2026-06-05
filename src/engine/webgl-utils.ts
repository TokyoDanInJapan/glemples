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
 * Low-level WebGL helpers shared by the renderer.
 *
 * @packageDocumentation
 */

/**
 * Compiles and links a shader program from vertex and fragment sources.
 *
 * @param gl - The WebGL rendering context.
 * @param vert - GLSL vertex shader source.
 * @param frag - GLSL fragment shader source.
 * @returns The linked {@link WebGLProgram}.
 * @throws If linking fails (the program info log is included in the message).
 */
export function createProgram(
  gl: WebGLRenderingContext,
  vert: string,
  frag: string,
): WebGLProgram {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    throw new Error("Shader link failed: " + gl.getProgramInfoLog(prog));
  return prog;
}

/**
 * Compiles a single shader stage.
 *
 * @param gl - The WebGL rendering context.
 * @param type - Either `gl.VERTEX_SHADER` or `gl.FRAGMENT_SHADER`.
 * @param src - GLSL source for the stage.
 * @returns The compiled {@link WebGLShader}.
 * @throws If compilation fails (the info log and source are included).
 */
function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  src: string,
): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(
      "Shader compile failed:\n" + gl.getShaderInfoLog(s) + "\n---\n" + src,
    );
  return s;
}

/**
 * Creates an RGBA/unsigned-byte 2D texture and uploads optional initial pixels.
 *
 * @param gl - The WebGL rendering context.
 * @param w - Texture width in pixels.
 * @param h - Texture height in pixels.
 * @param data - Initial RGBA pixel data, or `null` to allocate uninitialised storage.
 * @param filter - Min/mag filter, e.g. `gl.LINEAR` or `gl.NEAREST`.
 * @param wrap - Wrap mode for both axes; defaults to `gl.CLAMP_TO_EDGE`.
 * @returns The created {@link WebGLTexture}.
 */
export function makeTexture(
  gl: WebGLRenderingContext,
  w: number,
  h: number,
  data: Uint8ClampedArray | null,
  filter: number,
  // Annotated as number (not the inferred literal) so REPEAT can also be passed.
  wrap: number = gl.CLAMP_TO_EDGE,
): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    w,
    h,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    data,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return t;
}

/**
 * Creates a `LUMINANCE_ALPHA` float texture used to hold the warp grid.
 *
 * @remarks
 * Filtering is `NEAREST` — the fragment shader performs its own bicubic
 * interpolation across grid cells, so hardware filtering must be disabled.
 *
 * @param gl - The WebGL rendering context.
 * @param w - Texture width (grid columns).
 * @param h - Texture height (grid rows).
 * @returns The created {@link WebGLTexture}.
 */
export function makeFloatTexture(
  gl: WebGLRenderingContext,
  w: number,
  h: number,
): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.LUMINANCE_ALPHA,
    w,
    h,
    0,
    gl.LUMINANCE_ALPHA,
    gl.FLOAT,
    null,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

/**
 * Creates a framebuffer with the given texture bound as its colour attachment.
 *
 * @param gl - The WebGL rendering context.
 * @param tex - Texture to attach at `COLOR_ATTACHMENT0`.
 * @returns The created {@link WebGLFramebuffer}.
 */
export function makeFB(
  gl: WebGLRenderingContext,
  tex: WebGLTexture,
): WebGLFramebuffer {
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    tex,
    0,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fb;
}

/**
 * Binds a texture to a numbered texture unit and points a sampler uniform at it.
 *
 * @param gl - The WebGL rendering context.
 * @param unit - Texture unit index (0 maps to `gl.TEXTURE0`, etc.).
 * @param tex - Texture to bind.
 * @param loc - Sampler uniform location to set to `unit`.
 */
export function bindUnit(
  gl: WebGLRenderingContext,
  unit: number,
  tex: WebGLTexture,
  loc: WebGLUniformLocation,
): void {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(loc, unit);
}
