// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useRef, type RefObject } from "react";
import { PictureRenderer, readColors, type RendererKind } from "./renderer";
import { prefersReducedMotion, type PictureBands, type PictureStyle } from "./settings";

type VideoWithFrames = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export interface PictureCanvasProps {
  /** The <video> (or a canvas) whose frames are drawn. */
  source: RefObject<HTMLVideoElement | HTMLCanvasElement | null>;
  /** The game's display aspect (width / height). */
  aspect: number;
  style: PictureStyle;
  bands: PictureBands;
  /** Split view: where the chosen style starts (0-1); null = the whole picture. */
  split?: number | null;
  /** The game's own size when the device sends it enlarged 2x (see PictureSource.native). */
  native?: { w: number; h: number } | null;
  /** Called with the renderer in use, or null when this browser cannot draw (fallback to the <video>). */
  onRenderer?: (kind: RendererKind | null) => void;
  className?: string;
}

/**
 * The game drawn by the GPU on a canvas, over the <video> that still
 * plays the sound and keeps its state. It draws once per new video frame
 * (requestVideoFrameCallback where it exists, else every screen frame),
 * again when its size or the settings change, and nothing while the page
 * is hidden.
 */
export function PictureCanvas({ source, aspect, style, bands, split = null, native = null, onRenderer, className = "" }: PictureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PictureRenderer | null>(null);
  const opts = useRef({ style, bands, split, aspect, native, reducedMotion: prefersReducedMotion() });
  opts.current = { ...opts.current, style, bands, split, aspect, native };
  const report = useRef(onRenderer);
  report.current = onRenderer;
  const redraw = useRef<() => void>(() => undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    const el = source.current;
    if (!canvas || !el) return;
    const renderer = PictureRenderer.create(canvas, readColors(canvas));
    rendererRef.current = renderer;
    report.current?.(renderer ? renderer.kind : null);
    if (!renderer) return;

    let stopped = false;
    let handle = 0;
    let usesFrames = false;
    const draw = () => {
      const o = opts.current;
      renderer.draw({ element: el, aspect: o.aspect, native: o.native }, o);
    };
    redraw.current = draw;
    const video = el instanceof HTMLVideoElement ? (el as VideoWithFrames) : null;
    const schedule = () => {
      if (stopped || document.hidden) return;
      if (video?.requestVideoFrameCallback) {
        usesFrames = true;
        handle = video.requestVideoFrameCallback(onFrame);
      } else {
        usesFrames = false;
        handle = requestAnimationFrame(onFrame);
      }
    };
    const onFrame = () => {
      if (stopped) return;
      draw();
      schedule();
    };
    const cancel = () => {
      if (usesFrames) video?.cancelVideoFrameCallback?.(handle);
      else cancelAnimationFrame(handle);
    };
    const visibility = () => {
      cancel();
      if (!document.hidden) {
        draw();
        schedule();
      }
    };
    const resize = new ResizeObserver(() => draw());
    resize.observe(canvas);
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const motionChange = () => (opts.current = { ...opts.current, reducedMotion: motion?.matches === true });
    motion?.addEventListener?.("change", motionChange);
    // A restored GPU context has an empty canvas until the next frame.
    const restored = () => draw();
    canvas.addEventListener("webglcontextrestored", restored);
    document.addEventListener("visibilitychange", visibility);
    schedule();
    return () => {
      stopped = true;
      cancel();
      resize.disconnect();
      motion?.removeEventListener?.("change", motionChange);
      canvas.removeEventListener("webglcontextrestored", restored);
      document.removeEventListener("visibilitychange", visibility);
      renderer.dispose();
      rendererRef.current = null;
      redraw.current = () => undefined;
    };
  }, [source]);

  // A new setting shows at once, even on a paused game.
  useEffect(() => redraw.current(), [style, bands, split, aspect, native?.w, native?.h]);

  return <canvas ref={canvasRef} className={`picture-canvas ${className}`} aria-hidden="true" />;
}
