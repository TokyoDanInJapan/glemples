import { describe, it, expect, vi } from "vitest";
import {
  createProgram,
  makeTexture,
  makeFloatTexture,
  makeFB,
  bindUnit,
} from "../../src/engine/webgl-utils.js";

// A minimal fake WebGL context: real numeric enums aren't needed, only that the
// helpers thread the right objects/arguments through the expected calls.
function fakeGl(overrides: Partial<Record<string, unknown>> = {}) {
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    TEXTURE_2D: 10,
    RGBA: 11,
    UNSIGNED_BYTE: 12,
    LUMINANCE_ALPHA: 13,
    FLOAT: 14,
    TEXTURE_MIN_FILTER: 15,
    TEXTURE_MAG_FILTER: 16,
    TEXTURE_WRAP_S: 17,
    TEXTURE_WRAP_T: 18,
    NEAREST: 19,
    LINEAR: 20,
    CLAMP_TO_EDGE: 21,
    REPEAT: 22,
    FRAMEBUFFER: 23,
    COLOR_ATTACHMENT0: 24,
    TEXTURE0: 100,
    createProgram: vi.fn(() => ({ tag: "program" })),
    createShader: vi.fn(() => ({ tag: "shader" })),
    createTexture: vi.fn(() => ({ tag: "texture" })),
    createFramebuffer: vi.fn(() => ({ tag: "fb" })),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getProgramParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ""),
    getProgramInfoLog: vi.fn(() => ""),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    activeTexture: vi.fn(),
    uniform1i: vi.fn(),
    ...overrides,
  };
  return gl as unknown as WebGLRenderingContext &
    Record<string, ReturnType<typeof vi.fn>>;
}

describe("createProgram", () => {
  it("compiles two shaders, links, and returns the program", () => {
    const gl = fakeGl();
    const prog = createProgram(gl, "vsrc", "fsrc");
    expect(gl.createShader).toHaveBeenCalledTimes(2);
    expect(gl.attachShader).toHaveBeenCalledTimes(2);
    expect(gl.linkProgram).toHaveBeenCalledOnce();
    expect(prog).toEqual({ tag: "program" });
  });

  it("throws if a shader fails to compile", () => {
    const gl = fakeGl({ getShaderParameter: vi.fn(() => false) });
    expect(() => createProgram(gl, "v", "f")).toThrow(/compile failed/i);
  });

  it("throws if the program fails to link", () => {
    const gl = fakeGl({ getProgramParameter: vi.fn(() => false) });
    expect(() => createProgram(gl, "v", "f")).toThrow(/link failed/i);
  });
});

describe("makeTexture", () => {
  it("uploads data and sets all four texture parameters", () => {
    const gl = fakeGl();
    const tex = makeTexture(gl, 4, 4, null, gl.LINEAR);
    expect(tex).toEqual({ tag: "texture" });
    expect(gl.texImage2D).toHaveBeenCalledOnce();
    expect(gl.texParameteri).toHaveBeenCalledTimes(4);
  });

  it("defaults wrap to CLAMP_TO_EDGE but accepts an override", () => {
    const gl = fakeGl();
    makeTexture(gl, 2, 2, null, gl.LINEAR, gl.REPEAT);
    expect(gl.texParameteri).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_S,
      gl.REPEAT,
    );
  });
});

describe("makeFloatTexture", () => {
  it("creates a NEAREST-filtered texture", () => {
    const gl = fakeGl();
    const tex = makeFloatTexture(gl, 8, 8);
    expect(tex).toEqual({ tag: "texture" });
    expect(gl.texParameteri).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.NEAREST,
    );
  });
});

describe("makeFB", () => {
  it("attaches the texture as the colour attachment", () => {
    const gl = fakeGl();
    const fb = makeFB(gl, { tag: "texture" } as unknown as WebGLTexture);
    expect(fb).toEqual({ tag: "fb" });
    expect(gl.framebufferTexture2D).toHaveBeenCalledWith(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      { tag: "texture" },
      0,
    );
  });
});

describe("bindUnit", () => {
  it("activates the unit and points the sampler at it", () => {
    const gl = fakeGl();
    const loc = {} as WebGLUniformLocation;
    bindUnit(gl, 3, { tag: "texture" } as unknown as WebGLTexture, loc);
    expect(gl.activeTexture).toHaveBeenCalledWith(gl.TEXTURE0 + 3);
    expect(gl.uniform1i).toHaveBeenCalledWith(loc, 3);
  });
});
