// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, D, EASE_IN, EASE_ON, EASE_OUT, F } from "./theme";

/** 0 → 1 over d frames from start, with the entrance curve. */
export function inAt(frame: number, start: number, d: number = D.standard) {
  return interpolate(frame, [start, start + d], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_IN });
}

/** 1 → 0 over d frames ending at end, with the exit curve. */
export function outAt(frame: number, end: number, d: number = D.quick) {
  return interpolate(frame, [end - d, end], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_OUT });
}

/**
 * The background's life: the dark ground, two warm glows that drift on a
 * slow sine loop, and a dot grid that slides the other way (counter-motion).
 */
export function Backdrop({ hue = C.accent }: { hue?: string }) {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const gx = 30 + Math.sin(t / 3) * 8;
  const gy = 35 + Math.cos(t / 4) * 6;
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 600px at ${gx}% ${gy}%, ${hue}26, transparent 70%), radial-gradient(800px 700px at ${100 - gx}% ${100 - gy}%, ${C.voice}14, transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(${C.border} 1.4px, transparent 1.6px)`,
          backgroundSize: "34px 34px",
          backgroundPosition: `${-t * 6}px ${-t * 3}px`,
          opacity: 0.55,
          maskImage: "radial-gradient(circle at 50% 50%, black 30%, transparent 85%)",
        }}
      />
    </AbsoluteFill>
  );
}

/** go-link's mark: the orange rounded square with the gamepad. */
export function Mark({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill={C.accent} />
      <g transform="translate(4 4)" fill="none" stroke={C.onAccent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="11" rx="4" />
        <path d="M7 11v3M5.5 12.5h3" />
        <circle cx="16" cy="11.5" r="1" />
        <circle cx="18" cy="13.5" r="1" />
      </g>
    </svg>
  );
}

export function Wordmark({ size = 72 }: { size?: number }) {
  return (
    <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: size, color: C.text, letterSpacing: "-0.01em" }}>
      go<span style={{ color: C.accent }}>-</span>link
    </span>
  );
}

/**
 * A title whose words rise into place one after another (a standard
 * stagger, under 400 ms in all), each with a small spring overshoot. Words
 * wrapped in *stars* are the accent color.
 */
export function KineticTitle({ text, start = 0, size = 84, align = "left", style }: { text: string; start?: number; size?: number; align?: "left" | "center"; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // *a few words* are the accent color: the stars may span several words.
  let on = false;
  const words = text.split(" ").map((raw) => {
    const opens = raw.startsWith("*");
    const closes = raw.endsWith("*") && (raw.length > 1 || opens);
    if (opens) on = true;
    const word = { text: raw.replace(/^\*/, "").replace(/\*$/, ""), accent: on };
    if (closes) on = false;
    return word;
  });
  const stagger = Math.max(1, Math.min(3, Math.floor(12 / words.length)));
  return (
    <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: size, lineHeight: 1.04, color: C.text, textAlign: align, letterSpacing: "-0.015em", textWrap: "balance", ...style }}>
      {words.map((w, i) => {
        const s = spring({ frame: frame - start - i * stagger, fps, config: { damping: 15, stiffness: 170, mass: 0.7 } });
        return (
          <span key={i} style={{ display: "inline-block", whiteSpace: "pre", transform: `translateY(${(1 - s) * 0.55}em)`, opacity: Math.min(1, s * 1.6), color: w.accent ? C.accent : undefined }}>
            {w.text + (i < words.length - 1 ? " " : "")}
          </span>
        );
      })}
    </div>
  );
}

/** A small line under a title, fading up after it. */
export function Sub({ children, start = 0, style }: { children: ReactNode; start?: number; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const v = inAt(frame, start, D.standard);
  return (
    <div style={{ fontFamily: F.text, fontWeight: 500, fontSize: 34, color: C.muted, opacity: v, transform: `translateY(${(1 - v) * 18}px)`, ...style }}>
      {children}
    </div>
  );
}

/** A capsule label, like the site's chips. */
export function Chip({ children, color = C.accent, start = 0 }: { children: ReactNode; color?: string; start?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - start, fps, config: { damping: 12, stiffness: 200, mass: 0.6 } });
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 20px",
        borderRadius: 999,
        border: `1.5px solid ${color}66`,
        background: `${color}1f`,
        color,
        fontFamily: F.mono,
        fontWeight: 500,
        fontSize: 24,
        transform: `scale(${0.6 + 0.4 * s})`,
        opacity: Math.min(1, s * 1.5),
      }}
    >
      {children}
    </span>
  );
}

/**
 * A recorded take in a browser window. It enters from below with the
 * signature curve, then pushes in slowly (the camera never stands still);
 * focus zooms toward a point of the picture (0-1) over the shot.
 */
/** A piece of a take: from its second from, at rate, for len frames. */
export interface Clip {
  take: string;
  from: number;
  rate?: number;
  len: number;
  url?: string;
}

export function Screen({
  take,
  from = 0,
  rate = 1,
  clips,
  url = "play.go-link.org",
  width = 1240,
  start = 0,
  duration,
  focus,
  style,
}: {
  take?: string;
  from?: number;
  rate?: number;
  /** Several pieces in a row, cut inside the same window (take, from and rate are ignored). */
  clips?: Clip[];
  url?: string;
  width?: number;
  start?: number;
  duration: number;
  focus?: { x: number; y: number; zoom: number; at: number };
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const enter = inAt(frame, start, D.reveal);
  const exit = outAt(frame, start + duration, D.quick);
  const push = interpolate(frame, [start, start + duration], [1, 1.035], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_ON });
  const z = focus ? interpolate(frame, [start + focus.at, start + focus.at + D.reveal * 1.5], [1, focus.zoom], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_ON }) : 1;
  const height = Math.round((width * 9) / 16);
  return (
    <div
      style={{
        width,
        borderRadius: 18,
        overflow: "hidden",
        background: C.surface,
        border: `1.5px solid ${C.borderStrong}`,
        boxShadow: `0 ${40 * enter}px ${90 * enter}px rgba(0,0,0,${0.55 * enter}), 0 0 0 1px rgba(255,255,255,0.03)`,
        transform: `translateY(${(1 - enter) * 120}px) scale(${(0.94 + 0.06 * enter) * push})`,
        opacity: Math.min(enter * 1.4, exit),
        ...style,
      }}
    >
      <div style={{ height: 44, display: "flex", alignItems: "center", gap: 10, padding: "0 18px", background: C.surface2, borderBottom: `1px solid ${C.border}` }}>
        {[C.p3, C.accent, C.ok].map((c) => (
          <i key={c} style={{ width: 13, height: 13, borderRadius: 99, background: c, opacity: 0.85 }} />
        ))}
        <span style={{ marginLeft: 16, padding: "6px 18px", borderRadius: 999, background: C.bg, color: C.faint, fontFamily: F.mono, fontSize: 17 }}>{clipAt(clips, frame - start)?.url ?? url}</span>
      </div>
      <div style={{ width, height, overflow: "hidden", position: "relative" }}>
        <div style={{ position: "relative", width: "100%", height: "100%", transform: `scale(${z})`, transformOrigin: focus ? `${focus.x * 100}% ${focus.y * 100}%` : "50% 50%" }}>
          {(clips ?? [{ take: take!, from, rate, len: duration }]).map((c, i, all) => {
            const offset = all.slice(0, i).reduce((n, x) => n + x.len, 0);
            return (
              <Sequence key={i} from={start + offset} durationInFrames={i === all.length - 1 ? undefined : c.len} layout="none">
                <OffthreadVideo src={staticFile(`takes/${c.take}.webm`)} startFrom={Math.round(c.from * 30)} playbackRate={c.rate ?? 1} muted style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              </Sequence>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** The clip playing at frame f of a Screen. */
function clipAt(clips: Clip[] | undefined, f: number): Clip | undefined {
  if (!clips) return undefined;
  let at = 0;
  for (const c of clips) {
    if (f < at + c.len) return c;
    at += c.len;
  }
  return clips[clips.length - 1];
}

/** A take in a phone frame (the phone's own recording, portrait). */
export function Phone({ take, from = 0, rate = 1, start = 0, duration, height = 860 }: { take: string; from?: number; rate?: number; start?: number; duration: number; height?: number }) {
  const frame = useCurrentFrame();
  const enter = inAt(frame, start, D.reveal);
  const exit = outAt(frame, start + duration, D.quick);
  const tilt = interpolate(frame, [start, start + duration], [-4, 2], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_ON });
  const width = Math.round(height * (430 / 932));
  return (
    <div
      style={{
        width: width + 28,
        height: height + 28,
        padding: 14,
        borderRadius: 58,
        background: "#05060a",
        border: `2px solid ${C.borderStrong}`,
        boxShadow: `0 50px 110px rgba(0,0,0,${0.6 * enter})`,
        transform: `translateY(${(1 - enter) * 160}px) rotate(${tilt}deg)`,
        opacity: Math.min(enter * 1.4, exit),
      }}
    >
      <div style={{ width, height, borderRadius: 44, overflow: "hidden" }}>
        <OffthreadVideo src={staticFile(`takes/${take}.webm`)} startFrom={Math.round(from * 30)} playbackRate={rate} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    </div>
  );
}
