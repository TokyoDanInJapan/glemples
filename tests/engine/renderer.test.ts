import { describe, it, expect, vi, beforeEach } from "vitest";
import { Renderer } from "../../src/engine/renderer.js";

const OPTS = { gridWidth: 8, gridHeight: 6, textureSize: 64 };

/**
 * A fake WebGL context that records calls. Enum values are distinct integers so
 * assertions can tell one binding target or format from another; the real
 * numeric values don't matter.
 */
function fakeGl() {
  let nextId = 0;
  const tag = (kind: string) => ({ kind, id: nextId++ });

  return {
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
    ARRAY_BUFFER: 25,
    STATIC_DRAW: 26,
    TRIANGLE_STRIP: 27,
    VERTEX_SHADER: 28,
    FRAGMENT_SHADER: 29,
    COMPILE_STATUS: 30,
    LINK_STATUS: 31,
    TEXTURE0: 100,

    drawingBufferWidth: 800,
    drawingBufferHeight: 600,

    getExtension: vi.fn((name: string) =>
      name === "OES_texture_float" ? {} : null,
    ),
    createProgram: vi.fn(() => tag("program")),
    createShader: vi.fn(() => tag("shader")),
    createTexture: vi.fn(() => tag("texture")),
    createFramebuffer: vi.fn(() => tag("fb")),
    createBuffer: vi.fn(() => tag("buffer")),
    getUniformLocation: vi.fn((_p: unknown, name: string) => ({ name })),
    getAttribLocation: vi.fn(() => 0),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    useProgram: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getProgramParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ""),
    getProgramInfoLog: vi.fn(() => ""),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texSubImage2D: vi.fn(),
    texParameteri: vi.fn(),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    activeTexture: vi.fn(),
    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    viewport: vi.fn(),
    drawArrays: vi.fn(),
  };
}

type FakeGl = ReturnType<typeof fakeGl>;

function makeCanvas(gl: unknown): HTMLCanvasElement {
  return {
    width: 800,
    height: 600,
    getContext: vi.fn(() => gl),
  } as unknown as HTMLCanvasElement;
}

let gl: FakeGl;
let renderer: Renderer;

beforeEach(() => {
  gl = fakeGl();
  renderer = new Renderer(makeCanvas(gl), OPTS);
});

describe("Renderer construction", () => {
  it("throws when WebGL is unavailable", () => {
    expect(() => new Renderer(makeCanvas(null), OPTS)).toThrow(
      /WebGL not supported/,
    );
  });

  it("throws when OES_texture_float is missing", () => {
    const bare = fakeGl();
    bare.getExtension = vi.fn(() => null);
    expect(() => new Renderer(makeCanvas(bare), OPTS)).toThrow(
      /OES_texture_float/,
    );
  });

  it("builds both shader programs", () => {
    expect(gl.createProgram).toHaveBeenCalledTimes(2);
    // Two stages per program, and the vertex shader is shared by source.
    expect(gl.createShader).toHaveBeenCalledTimes(4);
  });

  it("allocates the source textures at the configured size with REPEAT wrap", () => {
    const uploads = gl.texImage2D.mock.calls.filter(
      (c) => c[3] === OPTS.textureSize && c[4] === OPTS.textureSize,
    );
    expect(uploads).toHaveLength(2);
    expect(gl.texParameteri).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_S,
      gl.REPEAT,
    );
  });

  it("allocates the grid texture at the configured grid size", () => {
    const grid = gl.texImage2D.mock.calls.filter(
      (c) => c[2] === gl.LUMINANCE_ALPHA,
    );
    expect(grid).toHaveLength(1);
    expect(grid[0]![3]).toBe(OPTS.gridWidth);
    expect(grid[0]![4]).toBe(OPTS.gridHeight);
  });
});

describe("Renderer.uploadTexture", () => {
  it("updates existing storage rather than reallocating", () => {
    gl.texImage2D.mockClear();
    renderer.uploadTexture(0, new Uint8ClampedArray(4));

    expect(gl.texImage2D).not.toHaveBeenCalled();
    expect(gl.texSubImage2D).toHaveBeenCalledOnce();
  });

  it("targets the requested slot", () => {
    renderer.uploadTexture(0, new Uint8ClampedArray(4));
    const first = gl.bindTexture.mock.calls.at(-1)![1];

    renderer.uploadTexture(1, new Uint8ClampedArray(4));
    const second = gl.bindTexture.mock.calls.at(-1)![1];

    expect(first).not.toBe(second);
  });
});

describe("Renderer.render", () => {
  const grid = new Float32Array(OPTS.gridWidth * OPTS.gridHeight * 2);

  it("uploads the grid as a subimage every frame, never reallocating", () => {
    gl.texImage2D.mockClear();
    renderer.render(grid, 0.5, 0.25);
    renderer.render(grid, 0.5, 0.25);

    expect(gl.texImage2D).not.toHaveBeenCalled();
    const gridUploads = gl.texSubImage2D.mock.calls.filter(
      (c) => c[6] === gl.LUMINANCE_ALPHA,
    );
    expect(gridUploads).toHaveLength(2);
  });

  it("passes motion blur, texture fade and grid size to the warp shader", () => {
    renderer.render(grid, 0.75, 0.4);

    const floats = gl.uniform1f.mock.calls.map((c) => [
      (c[0] as { name: string }).name,
      c[1],
    ]);
    expect(floats).toContainEqual(["u_blend", 0.75]);
    expect(floats).toContainEqual(["u_texfade", 0.4]);
    expect(gl.uniform2f).toHaveBeenCalledWith(
      expect.objectContaining({ name: "u_gridSize" }),
      OPTS.gridWidth,
      OPTS.gridHeight,
    );
  });

  it("renders the warp pass to a framebuffer, then blits to the canvas", () => {
    renderer.render(grid, 0.5, 0);

    const targets = gl.bindFramebuffer.mock.calls.map((c) => c[1]);
    // Last two bindings of the frame: offscreen target, then the default one.
    expect(targets.at(-2)).not.toBeNull();
    expect(targets.at(-1)).toBeNull();
    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
  });

  it("ping-pongs the framebuffers so each frame reads the previous one", () => {
    renderer.render(grid, 0.5, 0);
    const firstTarget = gl.bindFramebuffer.mock.calls.at(-2)![1];

    gl.bindFramebuffer.mockClear();
    renderer.render(grid, 0.5, 0);
    const secondTarget = gl.bindFramebuffer.mock.calls.at(-2)![1];

    expect(secondTarget).not.toBe(firstTarget);

    gl.bindFramebuffer.mockClear();
    renderer.render(grid, 0.5, 0);
    expect(gl.bindFramebuffer.mock.calls.at(-2)![1]).toBe(firstTarget);
  });

  it("never samples the framebuffer it is drawing into", () => {
    // Reading and writing one attachment in the same pass is undefined; the
    // ping-pong exists precisely to avoid it. The blit pass may sample that
    // attachment afterwards, so only the warp pass is in scope here.
    // Ignore the binds made while building resources in init().
    gl.bindTexture.mockClear();
    gl.bindFramebuffer.mockClear();
    renderer.render(grid, 0.5, 0);

    const target = gl.bindFramebuffer.mock.calls.at(-2)![1];
    const attachment = gl.framebufferTexture2D.mock.calls.find(
      (_c, i) => gl.createFramebuffer.mock.results[i]?.value === target,
    )?.[3];
    expect(attachment).toBeDefined();

    // The warp pass ends when the target is unbound for the blit.
    const warpPassEnd = gl.bindFramebuffer.mock.invocationCallOrder.at(-1)!;
    const sampledDuringWarp = gl.bindTexture.mock.calls
      .filter(
        (_c, i) => gl.bindTexture.mock.invocationCallOrder[i]! < warpPassEnd,
      )
      .map((c) => c[1]);

    expect(sampledDuringWarp).not.toContain(attachment);
    expect(sampledDuringWarp.length).toBeGreaterThan(0);
  });
});

describe("Renderer.resize", () => {
  it("reallocates both ping-pong textures to the new size", () => {
    gl.texImage2D.mockClear();
    renderer.resize(1024, 768);

    const calls = gl.texImage2D.mock.calls;
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c[3]).toBe(1024);
      expect(c[4]).toBe(768);
    }
  });
});

describe("Renderer.restore", () => {
  it("rebuilds every GL resource after a context loss", () => {
    gl.createProgram.mockClear();
    gl.createTexture.mockClear();
    gl.createFramebuffer.mockClear();

    renderer.restore();

    expect(gl.createProgram).toHaveBeenCalledTimes(2);
    expect(gl.createTexture).toHaveBeenCalledTimes(5); // grid + 2 source + 2 fb
    expect(gl.createFramebuffer).toHaveBeenCalledTimes(2);
  });

  it("resets the ping-pong so the first restored frame is deterministic", () => {
    renderer.render(
      new Float32Array(OPTS.gridWidth * OPTS.gridHeight * 2),
      0,
      0,
    );
    renderer.restore();

    gl.bindFramebuffer.mockClear();
    renderer.render(
      new Float32Array(OPTS.gridWidth * OPTS.gridHeight * 2),
      0,
      0,
    );
    const afterRestore = gl.bindFramebuffer.mock.calls.at(-2)![1];

    // A freshly initialised renderer draws into the same slot on its first frame.
    const fresh = fakeGl();
    const r2 = new Renderer(makeCanvas(fresh), OPTS);
    fresh.bindFramebuffer.mockClear();
    r2.render(new Float32Array(OPTS.gridWidth * OPTS.gridHeight * 2), 0, 0);
    const freshTarget = fresh.bindFramebuffer.mock.calls.at(-2)![1] as {
      id: number;
    };

    // Same ordinal slot (ids differ between contexts), so compare creation order.
    const idx = gl.createFramebuffer.mock.results.findIndex(
      (r) => r.value === afterRestore,
    );
    const freshIdx = fresh.createFramebuffer.mock.results.findIndex(
      (r) => (r.value as { id: number }).id === freshTarget.id,
    );
    expect(idx % 2).toBe(freshIdx % 2);
  });
});
