// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { t } from "../i18n";
import type { GameId } from "../games";
import type { Btn, TouchInput } from "../games/input";

type Dir = "up" | "down" | "left" | "right";

/** What each game shows on the touch pad: only the controls it uses. */
const LAYOUTS: Record<GameId, { dpad?: boolean; face?: Btn[]; shoulders?: boolean; start?: boolean; steer?: boolean; pedals?: boolean }> = {
  link: { dpad: true, face: ["b1", "b2"], shoulders: true, start: true },
  snake: { dpad: true },
  memory: { face: ["b1", "b2", "b3", "b4"] },
  paddle: { steer: true, face: ["b1"] },
  racer: { steer: true, pedals: true },
  moves: { dpad: true, face: ["b1", "b2", "b3", "b4"] },
};

const FACE_LABEL: Record<string, string> = { b1: "1", b2: "2", b3: "3", b4: "4" };

/** Pointer capture keeps a finger on its control even when it slides off it. */
function capture(e: ReactPointerEvent<HTMLElement>): void {
  e.preventDefault();
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    // capture is a convenience; the control works without it
  }
}

/**
 * The mini-games' on-screen pad for phones and tablets: a D-pad, the face
 * buttons in their diamond (1 bottom, 2 right, 3 left, 4 top), L and R,
 * Start, a steering slider and gas and brake pads, each only where the
 * game uses it. Several fingers work at once. It writes into the same
 * input the keyboard and controllers fill, so the games don't know.
 */
export function GameTouchPad({ id, touch }: { id: GameId; touch: TouchInput }) {
  const l = LAYOUTS[id];
  const [, repaint] = useState(0);
  const draw = () => repaint((n) => n + 1);

  const press = (b: Btn) => (e: ReactPointerEvent<HTMLElement>) => {
    capture(e);
    touch.held.add(b);
    touch.tapped.add(b);
    navigator.vibrate?.(8);
    draw();
  };
  const release = (b: Btn) => () => {
    touch.held.delete(b);
    draw();
  };
  const btn = (b: Btn, label: string, cls: string) => (
    <button
      key={b}
      type="button"
      className={`gtp-btn ${cls}${touch.held.has(b) ? " is-on" : ""}`}
      aria-label={label}
      onPointerDown={press(b)}
      onPointerUp={release(b)}
      onPointerCancel={release(b)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );

  return (
    <div className={`gtp gtp-${id}`} role="group" aria-label={t.games.touch.label}>
      {l.pedals && <Pedal touch={touch} which="lt" label="L2" hint={t.games.touch.brake} onChange={draw} />}
      {l.dpad && <DPad touch={touch} onChange={draw} />}
      {l.steer && <Steer touch={touch} onChange={draw} />}
      {l.shoulders || l.start ? (
        // L and R over the face buttons, Start under them: one column beside the D-pad.
        <div className="gtp-column">
          {l.shoulders && (
            <div className="gtp-shoulders">
              {btn("l", "L", "is-shoulder")}
              {btn("r", "R", "is-shoulder")}
            </div>
          )}
          {l.face && <div className={`gtp-face is-${l.face.length}`}>{l.face.map((b) => btn(b, FACE_LABEL[b]!, `is-face is-${b}`))}</div>}
          {l.start && btn("start", "Start", "is-start")}
        </div>
      ) : (
        l.face && <div className={`gtp-face is-${l.face.length}`}>{l.face.map((b) => btn(b, FACE_LABEL[b]!, `is-face is-${b}`))}</div>
      )}
      {l.pedals && <Pedal touch={touch} which="rt" label="R2" hint={t.games.touch.gas} onChange={draw} />}
    </div>
  );
}

/** An 8-way D-pad: the finger's angle from the center picks the directions, sliding across works. */
function DPad({ touch, onChange }: { touch: TouchInput; onChange: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const set = (x: number, y: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = x - (r.left + r.width / 2);
    const dy = y - (r.top + r.height / 2);
    const next = new Set<Dir>();
    if (Math.hypot(dx, dy) > r.width * 0.12) {
      const a = (Math.atan2(dy, dx) * 180) / Math.PI; // 0 = right, 90 = down
      if (a > -67.5 && a < 67.5) next.add("right");
      if (a > 22.5 && a < 157.5) next.add("down");
      if (a > 112.5 || a < -112.5) next.add("left");
      if (a > -157.5 && a < -22.5) next.add("up");
    }
    for (const d of next) if (!touch.dirs.has(d)) touch.tappedDirs.add(d);
    const changed = next.size !== touch.dirs.size || [...next].some((d) => !touch.dirs.has(d));
    touch.dirs = next;
    if (changed) {
      if (next.size) navigator.vibrate?.(6);
      onChange();
    }
  };
  const end = () => {
    touch.dirs = new Set();
    onChange();
  };
  const on = (d: Dir) => (touch.dirs.has(d) ? " is-on" : "");
  return (
    <div
      ref={ref}
      className="gtp-dpad"
      role="img"
      aria-label={t.games.touch.dpad}
      onPointerDown={(e) => {
        capture(e);
        set(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => e.buttons && set(e.clientX, e.clientY)}
      onPointerUp={end}
      onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className={`gtp-arm is-up${on("up")}`} />
      <span className={`gtp-arm is-down${on("down")}`} />
      <span className={`gtp-arm is-left${on("left")}`} />
      <span className={`gtp-arm is-right${on("right")}`} />
      <span className="gtp-hub" />
    </div>
  );
}

/** A steering slider: the finger's distance from the middle is the stick, -1..1. */
function Steer({ touch, onChange }: { touch: TouchInput; onChange: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const set = (x: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const v = ((x - r.left) / r.width) * 2 - 1;
    touch.lx = Math.max(-1, Math.min(1, v * 1.15));
    onChange();
  };
  const end = () => {
    touch.lx = 0;
    onChange();
  };
  return (
    <div
      ref={ref}
      className="gtp-steer"
      role="slider"
      aria-label={t.games.touch.steer}
      aria-valuemin={-100}
      aria-valuemax={100}
      aria-valuenow={Math.round(touch.lx * 100)}
      onPointerDown={(e) => {
        capture(e);
        set(e.clientX);
      }}
      onPointerMove={(e) => e.buttons && set(e.clientX)}
      onPointerUp={end}
      onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="gtp-steer-track" />
      <span className="gtp-steer-knob" style={{ left: `${50 + touch.lx * 42}%` }} />
    </div>
  );
}

/** A gas or brake pad: higher on the pad is a deeper pull, like pressing a trigger harder. */
function Pedal({ touch, which, label, hint, onChange }: { touch: TouchInput; which: "lt" | "rt"; label: string; hint: string; onChange: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const set = (y: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    touch[which] = Math.max(0.25, Math.min(1, (r.bottom - y) / r.height + 0.15));
    onChange();
  };
  const end = () => {
    touch[which] = 0;
    onChange();
  };
  const v = touch[which];
  return (
    <div
      ref={ref}
      className={`gtp-pedal is-${which}${v ? " is-on" : ""}`}
      role="slider"
      aria-label={`${label} · ${hint}`}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      onPointerDown={(e) => {
        capture(e);
        set(e.clientY);
      }}
      onPointerMove={(e) => e.buttons && set(e.clientY)}
      onPointerUp={end}
      onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="gtp-pedal-fill" style={{ height: `${v * 100}%` }} />
      <strong>{label}</strong>
      <span className="small">{hint}</span>
    </div>
  );
}
