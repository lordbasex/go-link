// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { backingSize, fitRect, frameInset, type Rect } from "./layout";
import type { PictureBands, PictureStyle } from "./settings";
import { AMBIENT_SHADER, DOWN_SHADER, EDGES_SHADER, PICTURE_SHADER, VERTEX_SHADER } from "./shaders";

// Draws the game's frames on a canvas with the GPU (WebGL 2, else
// WebGL 1). The source is the room's <video> (or a canvas in the demo);
// the renderer never owns it. Everything that can fail returns null or
// false, so the page falls back to the plain <video>.

export type GL = WebGLRenderingContext | WebGL2RenderingContext;
export type RendererKind = "webgl2" | "webgl";

/** Anything whose pixels can be uploaded: a <video>, a <canvas>, an <img>, a bitmap. */
export type PictureElement = HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | ImageBitmap;

/** A picture source with its display aspect. */
export interface PictureSource {
  element: PictureElement;
  /** Width / height as the game is meant to be seen (4:3 for arcades). */
  aspect: number;
  /**
   * The game's own size when the frames are its picture enlarged 2x
   * (stream_stats video.scale 2): each 2 x 2 block is averaged back to one
   * pixel before any style. Null or a size that does not match the
   * frames (2x of it) draws the frames as they are.
   */
  native?: { w: number; h: number } | null;
}

export interface DrawOptions {
  style: PictureStyle;
  bands: PictureBands;
  /** Where the chosen style starts, 0-1 of the width (the left side is the browser's look); null = no split. */
  split: number | null;
  /** Slower ambient changes (prefers-reduced-motion). */
  reducedMotion: boolean;
  /** A single still picture: the ambient light takes the frame at once. */
  still?: boolean;
}

/** The pixel size of a source (0 x 0 while a video has no frame yet). */
export function sourceSize(el: PictureElement): { w: number; h: number } {
  if (typeof HTMLVideoElement !== "undefined" && el instanceof HTMLVideoElement) return { w: el.videoWidth, h: el.videoHeight };
  if (typeof HTMLImageElement !== "undefined" && el instanceof HTMLImageElement) return { w: el.naturalWidth, h: el.naturalHeight };
  return { w: el.width, h: el.height };
}

/** The colors the shaders use, read from the design tokens. */
export interface PictureColors {
  black: [number, number, number];
  cabinet: [number, number, number];
  cabinet2: [number, number, number];
  bezel: [number, number, number];
  bezelHi: [number, number, number];
  trim: [number, number, number];
}

const STYLE_CODE: Record<PictureStyle, number> = { smooth: 0, sharp: 1, crt: 2, edges: 3 };
/** Largest enlargement of the smooth edges texture, per axis. */
const MAX_PRESCALE = 8;
const BANDS_CODE: Record<PictureBands, number> = { black: 0, ambient: 1, frame: 2 };
/** The ambient texture: tiny on purpose (the blur is free). */
const AMB_W = 32;
const AMB_H = 24;

/** Creates a WebGL 2 context, else a WebGL 1 one, else null. */
export function createContext(canvas: HTMLCanvasElement): { gl: GL; kind: RendererKind } | null {
  const attrs: WebGLContextAttributes = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: "default",
  };
  try {
    const gl2 = canvas.getContext("webgl2", attrs) as WebGL2RenderingContext | null;
    if (gl2) return { gl: gl2, kind: "webgl2" };
    const gl1 = (canvas.getContext("webgl", attrs) ??
      canvas.getContext("experimental-webgl", attrs)) as WebGLRenderingContext | null;
    if (gl1) return { gl: gl1, kind: "webgl" };
  } catch {
    // no GPU context in this browser
  }
  return null;
}

/** Compiles and links a program; throws with the driver's log on failure. */
export function buildProgram(gl: GL, vertex: string, fragment: string): WebGLProgram {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("cannot create a shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost())
      throw new Error(`shader: ${gl.getShaderInfoLog(shader) ?? "unknown error"}`);
    return shader;
  };
  const program = gl.createProgram();
  if (!program) throw new Error("cannot create a program");
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
  gl.bindAttribLocation(program, 0, "a_pos");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost())
    throw new Error(`program: ${gl.getProgramInfoLog(program) ?? "unknown error"}`);
  return program;
}

/** Every shader of the renderer, compiled once (a smoke test for a context). */
export function compileAll(gl: GL): { picture: WebGLProgram; ambient: WebGLProgram; edges: WebGLProgram; down: WebGLProgram } {
  return {
    picture: buildProgram(gl, VERTEX_SHADER, PICTURE_SHADER),
    ambient: buildProgram(gl, VERTEX_SHADER, AMBIENT_SHADER),
    edges: buildProgram(gl, VERTEX_SHADER, EDGES_SHADER),
    down: buildProgram(gl, VERTEX_SHADER, DOWN_SHADER),
  };
}

/** The size the styles work on: the game's own when the frames are it enlarged 2x. */
export function workingSize(frameW: number, frameH: number, native?: { w: number; h: number } | null): { w: number; h: number; down: boolean } {
  if (native && native.w > 0 && native.h > 0 && frameW === native.w * 2 && frameH === native.h * 2)
    return { w: native.w, h: native.h, down: true };
  return { w: frameW, h: frameH, down: false };
}

/** Parses "#rrggbb" or "rgb(r g b)" into 0-1 floats. */
export function parseColor(value: string, fallback: [number, number, number]): [number, number, number] {
  const v = value.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(v);
  if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
  return fallback;
}

/** The shader colors from the tokens (tokens.css), as seen by an element. */
export function readColors(el: Element): PictureColors {
  const css = getComputedStyle(el);
  const get = (name: string, fallback: [number, number, number]) => parseColor(css.getPropertyValue(name), fallback);
  return {
    black: get("--color-video", [0.02, 0.024, 0.04]),
    cabinet: get("--picture-cabinet", [0.05, 0.055, 0.07]),
    cabinet2: get("--picture-cabinet-2", [0.1, 0.11, 0.14]),
    bezel: get("--picture-bezel", [0.03, 0.03, 0.04]),
    bezelHi: get("--picture-bezel-hi", [0.3, 0.32, 0.38]),
    trim: get("--color-accent", [0.95, 0.64, 0.23]),
  };
}

interface Programs {
  picture: WebGLProgram;
  ambient: WebGLProgram;
  edges: WebGLProgram;
  down: WebGLProgram;
  pictureLoc: Record<string, WebGLUniformLocation | null>;
  downLoc: Record<string, WebGLUniformLocation | null>;
  /** The game's pixels of a 2x picture (DOWN_SHADER's output). */
  nat: WebGLTexture;
  natFbo: WebGLFramebuffer;
  natW: number;
  natH: number;
  ambientLoc: Record<string, WebGLUniformLocation | null>;
  edgesLoc: Record<string, WebGLUniformLocation | null>;
  pre: WebGLTexture;
  preFbo: WebGLFramebuffer;
  preW: number;
  preH: number;
  quad: WebGLBuffer;
  src: WebGLTexture;
  amb: WebGLTexture;
  ambFbo: WebGLFramebuffer;
}

const PICTURE_UNIFORMS = [
  "u_src", "u_amb", "u_pre", "u_preSize", "u_srcSize", "u_ambSize", "u_canvas", "u_rect", "u_rectRef", "u_style", "u_bands",
  "u_split", "u_dpr", "u_black", "u_cabinet", "u_cabinet2", "u_bezel", "u_bezelHi", "u_trim", "u_bezelWidth",
];

/**
 * The GPU renderer of one canvas. create() returns null when the browser
 * has no WebGL or the shaders do not compile. A lost context (the GPU was
 * reset, the tab was in the background too long) is restored by the
 * browser; the renderer rebuilds itself then and skips frames meanwhile.
 */
export class PictureRenderer {
  readonly kind: RendererKind;
  private gl: GL;
  private p: Programs | null;
  private lost = false;
  private srcW = 0;
  private srcH = 0;
  private colors: PictureColors;
  /** The picture's rectangle in CSS pixels of the canvas (for overlays). */
  rect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  private constructor(private canvas: HTMLCanvasElement, gl: GL, kind: RendererKind, colors: PictureColors) {
    this.gl = gl;
    this.kind = kind;
    this.colors = colors;
    this.p = this.setup();
    canvas.addEventListener("webglcontextlost", this.onLost);
    canvas.addEventListener("webglcontextrestored", this.onRestored);
  }

  static create(canvas: HTMLCanvasElement, colors: PictureColors): PictureRenderer | null {
    const ctx = createContext(canvas);
    if (!ctx) return null;
    try {
      return new PictureRenderer(canvas, ctx.gl, ctx.kind, colors);
    } catch (err) {
      console.warn("picture renderer unavailable:", err);
      return null;
    }
  }

  setColors(colors: PictureColors): void {
    this.colors = colors;
  }

  get contextLost(): boolean {
    return this.lost;
  }

  private onLost = (e: Event) => {
    // Asking for the context back: the browser restores it when it can.
    e.preventDefault();
    this.lost = true;
    this.p = null;
  };

  private onRestored = () => {
    this.lost = false;
    this.srcW = this.srcH = 0;
    try {
      this.p = this.setup();
    } catch (err) {
      console.warn("picture renderer could not restore:", err);
    }
  };

  private setup(): Programs {
    const gl = this.gl;
    const { picture, ambient, edges, down } = compileAll(gl);
    const locs = (program: WebGLProgram, names: string[]) =>
      Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)]));
    const quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    // One triangle that covers the whole viewport.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const texture = () => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    };
    const src = texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    const amb = texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, AMB_W, AMB_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const ambFbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, ambFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, amb, 0);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const pre = texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const preFbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, preFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pre, 0);
    const nat = texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const natFbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, natFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, nat, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return {
      picture,
      ambient,
      edges,
      down,
      downLoc: locs(down, ["u_src", "u_srcSize"]),
      nat,
      natFbo,
      natW: 1,
      natH: 1,
      pictureLoc: locs(picture, PICTURE_UNIFORMS),
      ambientLoc: locs(ambient, ["u_src", "u_size", "u_mix"]),
      edgesLoc: locs(edges, ["u_src", "u_srcSize", "u_outSize"]),
      pre,
      preFbo,
      preW: 1,
      preH: 1,
      quad,
      src,
      amb,
      ambFbo,
    };
  }

  /**
   * Draws one frame. The canvas's backing store follows its CSS size and
   * the device pixel ratio. Returns false when nothing could be drawn (no
   * frame yet, a lost context).
   */
  draw(source: PictureSource, opts: DrawOptions, dpr = window.devicePixelRatio || 1, fixed?: { w: number; h: number }): boolean {
    const p = this.p;
    const gl = this.gl;
    if (!p || this.lost || gl.isContextLost()) return false;
    const el = source.element;
    const frame = sourceSize(el);
    if (!frame.w || !frame.h) return false;
    const { w, h, down } = workingSize(frame.w, frame.h, source.native);
    if (typeof HTMLVideoElement !== "undefined" && el instanceof HTMLVideoElement && el.readyState < 2) return false;

    const cssW = fixed ? fixed.w : this.canvas.clientWidth;
    const cssH = fixed ? fixed.h : this.canvas.clientHeight;
    if (!cssW || !cssH) return false;
    const size = fixed ? { w: fixed.w, h: fixed.h, scale: dpr } : backingSize(cssW, cssH, dpr);
    if (this.canvas.width !== size.w || this.canvas.height !== size.h) {
      this.canvas.width = size.w;
      this.canvas.height = size.h;
    }
    const scale = size.scale;
    const ref = fitRect(size.w, size.h, source.aspect);
    const inset = opts.bands === "frame" ? frameInset(size.w, size.h, scale) : 0;
    const rect = inset ? fitRect(size.w, size.h, source.aspect, inset) : ref;
    this.rect = { x: rect.x / scale, y: rect.y / scale, w: rect.w / scale, h: rect.h / scale };

    // The new frame.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, p.src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el);
    } catch {
      return false;
    }
    this.srcW = w;
    this.srcH = h;

    gl.bindBuffer(gl.ARRAY_BUFFER, p.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // A 2x picture: back to the game's pixels first, and every pass
    // below reads that texture instead of the frame.
    if (down) {
      gl.activeTexture(gl.TEXTURE0);
      if (p.natW !== w || p.natH !== h) {
        gl.bindTexture(gl.TEXTURE_2D, p.nat);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        p.natW = w;
        p.natH = h;
      }
      gl.bindTexture(gl.TEXTURE_2D, p.src);
      gl.bindFramebuffer(gl.FRAMEBUFFER, p.natFbo);
      gl.viewport(0, 0, w, h);
      gl.useProgram(p.down);
      gl.uniform1i(p.downLoc.u_src!, 0);
      gl.uniform2f(p.downLoc.u_srcSize!, frame.w, frame.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, p.nat);
    }

    // The ambient texture, blended over its last state.
    if (opts.bands === "ambient") {
      gl.bindFramebuffer(gl.FRAMEBUFFER, p.ambFbo);
      gl.viewport(0, 0, AMB_W, AMB_H);
      gl.useProgram(p.ambient);
      gl.uniform1i(p.ambientLoc.u_src!, 0);
      gl.uniform2f(p.ambientLoc.u_size!, AMB_W, AMB_H);
      gl.uniform1f(p.ambientLoc.u_mix!, opts.still ? 1 : opts.reducedMotion ? 0.05 : 0.2);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // Smooth edges: the enlarged texture first (an integer per axis, at
    // least the final scale, so the last step only shrinks or keeps it).
    if (opts.style === "edges") {
      const nx = Math.min(MAX_PRESCALE, Math.max(1, Math.ceil(rect.w / w)));
      const ny = Math.min(MAX_PRESCALE, Math.max(1, Math.ceil(rect.h / h)));
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, p.pre);
      if (p.preW !== w * nx || p.preH !== h * ny) {
        p.preW = w * nx;
        p.preH = h * ny;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, p.preW, p.preH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, p.preFbo);
      gl.viewport(0, 0, p.preW, p.preH);
      gl.useProgram(p.edges);
      gl.uniform1i(p.edgesLoc.u_src!, 0);
      gl.uniform2f(p.edgesLoc.u_srcSize!, w, h);
      gl.uniform2f(p.edgesLoc.u_outSize!, p.preW, p.preH);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    gl.viewport(0, 0, size.w, size.h);
    gl.useProgram(p.picture);
    const u = p.pictureLoc;
    gl.uniform1i(u.u_src!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, p.amb);
    gl.uniform1i(u.u_amb!, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, p.pre);
    gl.uniform1i(u.u_pre!, 2);
    gl.uniform2f(u.u_preSize!, p.preW, p.preH);
    gl.uniform2f(u.u_srcSize!, this.srcW, this.srcH);
    gl.uniform2f(u.u_ambSize!, AMB_W, AMB_H);
    gl.uniform2f(u.u_canvas!, size.w, size.h);
    gl.uniform4f(u.u_rect!, rect.x, rect.y, rect.w, rect.h);
    gl.uniform4f(u.u_rectRef!, ref.x, ref.y, ref.w, ref.h);
    gl.uniform1f(u.u_style!, STYLE_CODE[opts.style]);
    gl.uniform1f(u.u_bands!, BANDS_CODE[opts.bands]);
    gl.uniform1f(u.u_split!, opts.split === null ? -1 : opts.split * size.w);
    gl.uniform1f(u.u_dpr!, scale);
    gl.uniform1f(u.u_bezelWidth!, inset);
    const c = this.colors;
    gl.uniform3fv(u.u_black!, c.black);
    gl.uniform3fv(u.u_cabinet!, c.cabinet);
    gl.uniform3fv(u.u_cabinet2!, c.cabinet2);
    gl.uniform3fv(u.u_bezel!, c.bezel);
    gl.uniform3fv(u.u_bezelHi!, c.bezelHi);
    gl.uniform3fv(u.u_trim!, c.trim);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
    return true;
  }

  /** Frees the GPU objects; release also gives the context back (offline renders). */
  dispose(release = false): void {
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    const p = this.p;
    const gl = this.gl;
    if (p && !gl.isContextLost()) {
      gl.deleteProgram(p.picture);
      gl.deleteProgram(p.ambient);
      gl.deleteProgram(p.edges);
      gl.deleteProgram(p.down);
      gl.deleteTexture(p.nat);
      gl.deleteFramebuffer(p.natFbo);
      gl.deleteTexture(p.pre);
      gl.deleteFramebuffer(p.preFbo);
      gl.deleteBuffer(p.quad);
      gl.deleteTexture(p.src);
      gl.deleteTexture(p.amb);
      gl.deleteFramebuffer(p.ambFbo);
    }
    this.p = null;
    if (release) gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

/**
 * Renders one still picture offline at an exact pixel size (the quality
 * lab, screenshots, tests). Returns a 2D canvas with the result, or null
 * when this browser has no WebGL.
 */
export function renderStill(
  source: PictureElement,
  opts: { style: PictureStyle; bands: PictureBands; aspect?: number; split?: number | null; native?: { w: number; h: number } | null },
  outW: number,
  outH: number,
  colors?: PictureColors,
): HTMLCanvasElement | null {
  const gpu = document.createElement("canvas");
  gpu.width = outW;
  gpu.height = outH;
  const renderer = PictureRenderer.create(gpu, colors ?? readColors(document.documentElement));
  if (!renderer) return null;
  const { w, h } = sourceSize(source);
  const drawn = renderer.draw(
    { element: source, aspect: opts.aspect ?? (w && h ? w / h : 4 / 3), native: opts.native },
    { style: opts.style, bands: opts.bands, split: opts.split ?? null, reducedMotion: false, still: true },
    // The size a 1080p screen shows at 1x; bigger outputs scale the details.
    Math.max(1, outH / 1080),
    { w: outW, h: outH },
  );
  // Copied at once, before the browser may clear the GPU canvas.
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  if (drawn) out.getContext("2d")?.drawImage(gpu, 0, 0);
  renderer.dispose(true);
  return drawn ? out : null;
}
