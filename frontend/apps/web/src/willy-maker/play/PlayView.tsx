// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Play mode: the level runs with the ROM's rules while you build it. The
// game steps at a fixed 60 Hz (half speed in slow motion), draws at a
// whole-number scale, takes keyboard, controllers and on-screen buttons,
// and can be edited while it runs: a placed piece is in the game at once
// and goes to the editor through `onEdit`, as a command it can undo.

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button, dpadBits, type GamepadLike } from "@go-link/shared";
import { CELL, FRAME_MS, Game, Input, SCREEN_H, SCREEN_W, Tag, type GameSnapshot, type LevelObject, type LevelView } from "../engine";
import { useMessages } from "../i18n";
import { playEn, type PlayMessages } from "../i18n/play.en";
import { playEs } from "../i18n/play.es";
import { playPt } from "../i18n/play.pt";
import { loadTouchPref, PlayControls, type Seat, type TouchPref } from "./input";
import { DEFAULT_COLORS, drawGame, type Ghost, type OverlayColors, type Overlays } from "./renderer";
import { loadPlaySprites, type PlaySprites } from "./sprites";
import { IconBack, IconDots, IconPause, IconPencil, IconPlay } from "../ui/icons";
import { StatusBadge } from "../ui/molecules";
import { partSupport } from "../editor/support";
import "./play.css";

const PLAY = { en: playEn, es: playEs, pt: playPt };

/** A change made while playing, for the editor to apply to the project. */
export type PlayEdit = { kind: "cells"; cells: { col: number; row: number; tag: number }[] } | { kind: "object"; object: LevelObject };

export type Piece = "crate" | "platform" | "ladder" | "enemy" | "civilian" | "weapon";
const PIECES: Piece[] = ["crate", "platform", "ladder", "enemy", "civilian", "weapon"];

/** The editor part each piece places (planPiece), for its "Coming soon" badge (editor/support.ts). */
export const PIECE_PARTS: Record<Piece, string> = { crate: "crate:object", platform: "tag:oneway", ladder: "tag:ladder", enemy: "enemy:glitch9", civilian: "civilian:woman", weapon: "pickup:bazooka" };

export interface PlayViewProps {
  level: LevelView;
  /** Players in from the start, and the most the board takes. */
  players?: number;
  maxPlayers?: number;
  lives?: number;
  /** The double-tap window for running, in milliseconds (250 by default). */
  runTapMs?: number;
  /** A 2-button layout: both buttons together are the special. */
  combo?: boolean;
  /** The game's own HUD and game over texts (the Menus tab); the translated defaults otherwise. */
  texts?: Partial<PlayMessages["hud"]> & { overLine?: string };
  /** Each player's shirt (0 = Willy's own colors, 1-3 a recruit's). */
  variants?: number[];
  /** The on-screen pad: on touch screens ("auto"), always or never; this browser's choice by default. */
  touchPad?: TouchPref;
  /** Where the character sheets are served (the built-in ones by default). */
  spriteBase?: string;
  /** Pieces placed while playing. */
  onEdit?: (edit: PlayEdit) => void;
  /** Back to building; `at` is where player 1 was (world px, feet). */
  onBack?: (at?: { x: number; y: number }) => void;
}

function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

function clock(frames: number): string {
  const s = Math.floor(frames / 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The overlay colors from the site's tokens. */
function tokenColors(el: Element | null): OverlayColors {
  if (!el || typeof getComputedStyle !== "function") return DEFAULT_COLORS;
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    players: [1, 2, 3, 4].map((n, i) => v(`--color-p${n}`, DEFAULT_COLORS.players[i]!)),
    accent: v("--color-accent", DEFAULT_COLORS.accent),
    camera: v("--color-voice", DEFAULT_COLORS.camera),
    text: v("--color-text", DEFAULT_COLORS.text),
    font: v("--font-mono", DEFAULT_COLORS.font),
  };
}

function connectedPads(): (GamepadLike | null)[] {
  try {
    return typeof navigator !== "undefined" && navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
  } catch {
    return [];
  }
}

export function PlayView({ level, players = 1, maxPlayers = 4, lives, runTapMs, combo = false, texts, variants, touchPad, spriteBase, onEdit, onBack }: PlayViewProps) {
  const t = useMessages<PlayMessages>(PLAY);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const controls = useMemo(() => new PlayControls(), []);
  const edits = useRef<PlayEdit[]>([]);
  const make = useCallback(
    (startAt?: { x: number; y: number }) => {
      const runTapFrames = runTapMs === undefined ? undefined : Math.max(1, Math.round((runTapMs * 60) / 1000));
      const g = new Game(level, { players, maxPlayers, lives, startAt, runTapFrames });
      for (const e of edits.current) applyEdit(g, e);
      return g;
    },
    [level, players, maxPlayers, lives, runTapMs],
  );
  const game = useRef<Game>(null as unknown as Game);
  if (!game.current) game.current = make();

  const [sprites, setSprites] = useState<PlaySprites | null>(null);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [editing, setEditing] = useState(false);
  const [piece, setPiece] = useState<Piece>("crate");
  const [overlays, setOverlays] = useState<Overlays>({ collision: true, hitboxes: true, camera: true, fps: false });
  const [slow, setSlow] = useState(false);
  const [snap, setSnap] = useState<GameSnapshot>(() => game.current.snapshot());
  const [seats, setSeats] = useState<Seat[]>([]);
  const [held, setHeld] = useState(0);
  const [touch, setTouch] = useState(false);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [scale, setScale] = useState(2);
  const [more, setMore] = useState(false);

  // a new level from the editor (edits made here are in it now)
  useEffect(() => {
    edits.current = [];
    game.current = make();
    setSnap(game.current.snapshot());
  }, [make]);

  useEffect(() => {
    let live = true;
    const base = spriteBase ?? `${import.meta.env.BASE_URL ?? "/"}destroy`.replace(/\/\/+/g, "/");
    loadPlaySprites(base)
      .then((s) => live && setSprites(s))
      .catch(() => undefined)
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [spriteBase]);

  useEffect(() => {
    controls.attach(window);
    let pref = touchPad;
    if (!pref) {
      try {
        pref = loadTouchPref(window.localStorage);
      } catch {
        pref = "auto";
      }
    }
    setTouch(pref === "on" || (pref === "auto" && typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches));
    return () => controls.dispose();
  }, [controls, touchPad]);
  controls.combo = combo;

  // whole-number scale for the space the canvas has
  useEffect(() => {
    const el = rootRef.current?.querySelector(".wm-play-stage");
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      setScale(Math.max(1, Math.floor((el.clientWidth * dpr) / SCREEN_W)));
    });
    ro.observe(el);
    return () => ro.disconnect();
    // the console layout draws in a new stage
  }, [touch]);

  // the loop: fixed steps, drawn every animation frame
  const words = useMemo(() => ({ ...t.hud, ...texts }), [t.hud, texts]);
  const state = useRef({ paused, slow, overlays, ghost, scale, sprites, words, variants });
  state.current = { paused, slow, overlays, ghost, scale, sprites, words, variants };
  useEffect(() => {
    const canvas = canvasRef.current;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas?.getContext("2d") ?? null;
    } catch {
      ctx = null;
    }
    const colors = tokenColors(rootRef.current);
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let frames = 0;
    let fpsAt = last;
    let fps = 60;
    let ui = 0;
    const tick = (now: number) => {
      const st = state.current;
      const g = game.current;
      let dt = Math.min(100, now - last);
      last = now;
      if (st.slow) dt /= 2;
      if (!st.paused) acc += dt;
      let reading = controls.read(connectedPads(), g.players.length);
      while (acc >= FRAME_MS) {
        reading = controls.read(connectedPads(), g.players.length);
        g.step(reading.inputs);
        acc -= FRAME_MS;
        frames++;
      }
      if (now - fpsAt >= 1000) {
        fps = (frames * 1000) / (now - fpsAt);
        frames = 0;
        fpsAt = now;
      }
      if (canvas && ctx) {
        const w = SCREEN_W * st.scale;
        const h = SCREEN_H * st.scale;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        drawGame(ctx, g, st.sprites, { scale: st.scale, overlays: st.overlays, colors, ghost: st.ghost, fps, words: st.words, variants: st.variants });
      }
      if (++ui % 6 === 0) {
        setSnap(g.snapshot());
        setSeats((old) => (sameSeats(old, reading.seats) ? old : reading.seats));
        setHeld(reading.inputs.reduce((a, b) => a | b, 0));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // the console layout has its own canvas
  }, [controls, touch]);

  const restart = (fromHere: boolean) => {
    const p = game.current.players.find((q) => q.active);
    game.current = make(fromHere && p ? { x: p.x, y: p.y >> 4 } : undefined);
    setSnap(game.current.snapshot());
    setPaused(false);
  };

  const pauseAndEdit = () => {
    const p = game.current.players.find((q) => q.active);
    setPaused(true);
    onBack?.(p ? { x: p.x, y: p.y >> 4 } : undefined);
  };

  // where a pointer is, in world pixels
  const worldAt = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const g = game.current;
    return { x: g.camX + ((e.clientX - r.left) / r.width) * SCREEN_W, y: g.camY + ((e.clientY - r.top) / r.height) * SCREEN_H };
  };

  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!editing) return;
    const w = worldAt(e);
    const plan = planPiece(game.current, piece, w.x, w.y, "");
    setGhost(plan ? { ...plan.box, label: t.piece[piece] } : null);
  };

  const onPlace = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!editing) return;
    const w = worldAt(e);
    const plan = planPiece(game.current, piece, w.x, w.y, uniqueName(game.current, piece));
    if (!plan) return;
    applyEdit(game.current, plan.edit);
    edits.current.push(plan.edit);
    onEdit?.(plan.edit);
  };

  const sectionIndex = level.sections?.findIndex((s) => snap.camera.x + SCREEN_W / 2 >= s.x0 && snap.camera.x + SCREEN_W / 2 < s.x1) ?? -1;
  const section = sectionIndex >= 0 ? level.sections?.[sectionIndex] : undefined;
  const anyRunning = snap.players.some((p) => p.state === "running");

  const toggle = (k: keyof Overlays) => setOverlays((o) => ({ ...o, [k]: !o[k] }));

  const stage = (
    <div className="wm-play-stage">
      <canvas
        ref={canvasRef}
        className={`wm-play-canvas${editing ? " is-editing" : ""}`}
        width={SCREEN_W * 2}
        height={SCREEN_H * 2}
        role="img"
        aria-label={t.screen}
        onPointerMove={onMove}
        onPointerLeave={() => setGhost(null)}
        onPointerDown={onPlace}
      />
      {loading && <div className="wm-play-loading">{t.loading}</div>}
      {editing && ghost && <span className="wm-play-placing">{fill(t.placing, { piece: ghost.label })}</span>}
    </div>
  );

  const pieces = editing && (
    <div className="wm-play-card wm-play-pieces" role="group" aria-label={t.pieces}>
      <span className="wm-play-h">{t.pieces}</span>
      {PIECES.map((p) => (
        <button key={p} type="button" className={`wm-cap${piece === p ? " is-on" : ""}`} aria-pressed={piece === p} onClick={() => setPiece(p)}>
          {t.piece[p]}
          <StatusBadge support={partSupport(PIECE_PARTS[p])} tip={false} />
        </button>
      ))}
      <span className="wm-play-spacer" />
      <span className="wm-play-hint">{t.piecesHint}</span>
    </div>
  );

  const toggles = (
    <div className="wm-play-toggles" role="group" aria-label={t.overlays}>
      {(["collision", "hitboxes", "camera", "fps"] as const).map((k) => (
        <button key={k} type="button" className={`wm-cap${overlays[k] ? " is-on" : ""}`} aria-pressed={overlays[k]} onClick={() => toggle(k)}>
          {t.overlay[k]}
        </button>
      ))}
      <button type="button" className={`wm-cap${slow ? " is-on" : ""}`} aria-pressed={slow} onClick={() => setSlow((v) => !v)}>
        {t.overlay.slow}
      </button>
    </div>
  );

  // phones and tablets with the on-screen pad: a handheld console that fills
  // the screen (the picture on top and the pad below when upright, the pad's
  // halves at the sides when sideways), with the rest behind "…"
  if (touch) {
    return (
      <div className="wm-play is-console" ref={rootRef}>
        <div className="wm-console-bar">
          {onBack && (
            <button type="button" className="wm-play-icon" aria-label={t.back} data-tip={t.back} onClick={() => onBack()}>
              <IconBack />
            </button>
          )}
          <span className={`wm-play-chip${paused ? " is-paused" : ""}`}>{paused ? t.paused : fill(t.playing, { level: level.name })}</span>
          <span className="wm-play-spacer" />
          <button type="button" className="wm-play-icon" aria-label={paused ? t.resume : t.pause} data-tip={paused ? t.resume : t.pause} onClick={() => setPaused((v) => !v)}>
            {paused ? <IconPlay /> : <IconPause />}
          </button>
          <button type="button" className={`wm-play-icon${editing ? " is-on" : ""}`} aria-label={t.editWhilePlaying} data-tip={t.editWhilePlaying} aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
            <IconPencil />
          </button>
          <div className="wm-console-more">
            <button type="button" className={`wm-play-icon${more ? " is-on" : ""}`} aria-label={t.more} data-tip={t.more} aria-expanded={more} onClick={() => setMore((v) => !v)}>
              <IconDots />
            </button>
            {more && (
              <div className="wm-console-menu" role="group" aria-label={t.more}>
                <div className="wm-console-actions">
                  {onBack && (
                    <button type="button" className="wm-cap" onClick={pauseAndEdit}>
                      {t.pauseEdit}
                    </button>
                  )}
                  <button
                    type="button"
                    className="wm-cap"
                    onClick={() => {
                      restart(false);
                      setMore(false);
                    }}
                  >
                    {t.fromStart}
                  </button>
                  <button
                    type="button"
                    className="wm-cap"
                    onClick={() => {
                      restart(true);
                      setMore(false);
                    }}
                  >
                    {t.fromHere}
                  </button>
                </div>
                <span className="wm-play-h">{t.overlays}</span>
                {toggles}
              </div>
            )}
          </div>
        </div>
        <div className="wm-console-screen">{stage}</div>
        {pieces && <div className="wm-console-pieces">{pieces}</div>}
        <ConsolePad label={t.touchPad} start={t.startButton} onChange={(bits) => controls.setTouch(bits)} />
      </div>
    );
  }

  return (
    <div className="wm-play" ref={rootRef}>
      <div className="wm-play-bar">
        <span className={`wm-play-chip${paused ? " is-paused" : ""}`}>{paused ? t.paused : fill(t.playing, { level: level.name })}</span>
        <span className="wm-play-spacer" />
        <button type="button" className="wm-cap" onClick={() => setPaused((p) => !p)}>
          {paused ? t.resume : t.pause}
        </button>
        {onBack && (
          <button type="button" className="wm-cap" onClick={pauseAndEdit}>
            {t.pauseEdit}
          </button>
        )}
        <button type="button" className={`wm-cap${editing ? " is-on" : ""}`} aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
          {t.editWhilePlaying}
        </button>
        <button type="button" className="wm-cap" onClick={() => restart(false)}>
          {t.fromStart}
        </button>
        <button type="button" className="wm-cap" onClick={() => restart(true)}>
          {t.fromHere}
        </button>
        {onBack && (
          <button type="button" className="wm-cap wm-cap-danger" onClick={() => onBack()}>
            {t.back}
          </button>
        )}
      </div>

      <div className="wm-play-body">
        <div className="wm-play-main">
          {stage}
          {pieces}
          {toggles}
        </div>
        <aside className="wm-play-side">
          <section className="wm-play-card">
            <h3 className="wm-play-h">{t.controls}</h3>
            <ul className="wm-play-seats">
              {Array.from({ length: maxPlayers }, (_, i) => {
                const seat = seats.find((s) => s.player === i);
                const p = snap.players[i];
                return (
                  <li key={i} className="wm-play-seat">
                    <span className={`wm-play-dot p${i + 1}`}>{i + 1}</span>
                    <span className="wm-play-seat-name">{seat ? (seat.device === "pad" ? seat.name : t.keyboard) : p?.active ? t.noControl : t.join}</span>
                    <span className="wm-play-mono">{seat ? (seat.device === "pad" ? fill(t.pad, { n: i + 1 }) : touch ? t.touchKeys : t.keyboardKeys) : p?.active ? "" : "—"}</span>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="wm-play-card">
            <h3 className="wm-play-h">{t.pressing}</h3>
            <div className="wm-play-press">
              <span className={`wm-cap${held & Input.B1 ? " is-on" : ""}`}>B1 · {t.actions.b1}</span>
              <span className={`wm-cap${held & Input.B2 ? " is-on" : ""}`}>B2 · {t.actions.b2}</span>
              <span className={`wm-cap${held & Input.B3 ? " is-on" : ""}`}>{combo ? "B1+B2" : "B3"} · {t.actions.b3}</span>
              <span className={`wm-cap${anyRunning ? " is-on" : ""}`}>→ → · {t.actions.run}</span>
            </div>
          </section>
          <section className="wm-play-card">
            <h3 className="wm-play-h">{t.status}</h3>
            <p className="wm-play-mono wm-play-status" aria-live="off">
              {snap.players
                .filter((p) => p.active)
                .map((p) => fill(t.playerLine, { n: p.index + 1, x: p.x, y: p.y, state: t.state[p.state] }))
                .join("\n")}
              {"\n"}
              {fill(t.cameraLine, { x: snap.camera.x })}
              {section ? fill(t.sectionLine, { n: sectionIndex + 1, name: section.name }) : ""}
              {snap.camera.locked ? t.locked : ""}
              {"\n"}
              {fill(t.enemiesLine, { n: snap.enemiesLeft, r: snap.civilians.rescued, t: snap.civilians.total, time: clock(snap.frame) })}
            </p>
          </section>
          <p className="wm-play-card wm-play-note">{t.note}</p>
        </aside>
      </div>
    </div>
  );
}

function sameSeats(a: Seat[], b: Seat[]): boolean {
  return a.length === b.length && a.every((s, i) => s.player === b[i]!.player && s.device === b[i]!.device && s.name === b[i]!.name);
}

/** Applies a play edit to a running game. */
export function applyEdit(g: Game, e: PlayEdit): void {
  if (e.kind === "cells") for (const c of e.cells) g.setCell(c.col, c.row, c.tag);
  else g.addObject(e.object);
}

function uniqueName(g: Game, base: string): string {
  const taken = new Set<string>([...g.level.objects.map((o) => o.name), ...g.enemies.map((o) => o.name), ...g.civilians.map((o) => o.name), ...g.crates.map((o) => o.name), ...g.pickups.map((o) => o.name)]);
  for (let n = 1; ; n++) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`;
}

/**
 * What placing a piece at a world point does: the cells or the object,
 * and the box to preview. Characters and crates stand on the ground under
 * the point; a ladder reaches down to the ground.
 */
export function planPiece(g: Game, piece: Piece, x: number, y: number, name: string): { edit: PlayEdit; box: Omit<Ghost, "label"> } | null {
  const col = Math.floor(x / CELL);
  const row = Math.floor(y / CELL);
  if (col < 0 || row < 0 || col >= g.cols || row >= g.rows) return null;
  switch (piece) {
    case "platform": {
      const cells = [0, 1, 2, 3].filter((k) => col + k < g.cols).map((k) => ({ col: col + k, row, tag: Tag.Oneway }));
      return { edit: { kind: "cells", cells }, box: { x: col * CELL, y: row * CELL, w: cells.length * CELL, h: 4 } };
    }
    case "ladder": {
      const cells = [];
      for (let r = row; r < g.rows && g.cell(col, r) !== Tag.Solid && g.cell(col, r) !== Tag.Crate; r++) cells.push({ col, row: r, tag: Tag.Ladder });
      if (!cells.length) return null;
      return { edit: { kind: "cells", cells }, box: { x: col * CELL, y: row * CELL, w: CELL, h: cells.length * CELL } };
    }
    case "crate": {
      const c0 = Math.floor((x - CELL) / CELL);
      const fy = g.groundBelow(c0 * CELL + CELL, row * CELL);
      const object: LevelObject = { name, type: "crate", x: c0 * CELL, y: fy - 2 * CELL, size: 32, hp: 3 };
      return { edit: { kind: "object", object }, box: { x: object.x, y: object.y, w: 32, h: 32 } };
    }
    default: {
      const px = Math.round(x);
      const fy = g.groundBelow(px, row * CELL);
      const object: LevelObject =
        piece === "enemy"
          ? { name, type: "enemy", x: px, y: fy, kind: "glitch9", patrol: 6 * CELL }
          : piece === "civilian"
            ? { name, type: "civilian", x: px, y: fy, kind: "woman" }
            : { name, type: "pickup", x: px, y: fy, item: "bazooka" };
      const h = piece === "weapon" ? 12 : 44;
      return { edit: { kind: "object", object }, box: { x: px - 9, y: fy - h, w: 18, h } };
    }
  }
}

const ACTIONS: { bit: number; label: string }[] = [
  { bit: Button.B1, label: "B1" },
  { bit: Button.B2, label: "B2" },
  { bit: Button.B3, label: "B3" },
];
const DIRS = ["up", "left", "right", "down"] as const;
const DIR_BITS = { up: Button.Up, down: Button.Down, left: Button.Left, right: Button.Right };

/**
 * The on-screen pad for touch screens (it plays as the keyboard's seat): a
 * D-pad cross on the left (a thumb slides to the diagonals; its centre
 * presses nothing) with Start, and B1 B2 B3 on the right. Several fingers
 * work at once, and a finger slides from one button to the next.
 */
function ConsolePad({ label, start, onChange }: { label: string; start: string; onChange: (bits: number) => void }) {
  const dpadRef = useRef<HTMLDivElement>(null);
  const dpad = useRef(0);
  const fingers = useRef(new Map<number, number>());
  const [held, setHeld] = useState(0);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const publish = () => {
    let bits = dpad.current;
    fingers.current.forEach((b) => (bits |= b));
    setHeld((prev) => {
      if (bits & ~prev) navigator.vibrate?.(8);
      return bits;
    });
    changeRef.current(bits);
  };
  // let go of everything when the pad goes away
  useEffect(() => () => changeRef.current(0), []);

  const readDpad = (e: ReactPointerEvent) => {
    const r = dpadRef.current!.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    dpad.current = dpadBits(dx, dy, false);
    publish();
  };
  const pressAt = (e: ReactPointerEvent) => {
    const el = document.elementFromPoint?.(e.clientX, e.clientY)?.closest<HTMLElement>("[data-bit]");
    const bit = el ? Number(el.dataset.bit) : 0;
    if ((fingers.current.get(e.pointerId) ?? 0) === bit) return;
    if (bit) fingers.current.set(e.pointerId, bit);
    else fingers.current.delete(e.pointerId);
    publish();
  };
  const release = (e: ReactPointerEvent) => {
    if (fingers.current.delete(e.pointerId)) publish();
  };
  const buttonsProps = {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      pressAt(e);
    },
    onPointerMove: (e: ReactPointerEvent) => fingers.current.has(e.pointerId) && pressAt(e),
    onPointerUp: release,
    onPointerCancel: release,
    onLostPointerCapture: release,
  };
  const on = (bit: number) => (held & bit ? " is-on" : "");

  return (
    // pointer-only by nature: the keyboard and controllers are the accessible way to play
    <div className="wm-console-pad" aria-label={label} role="group" onContextMenu={(e) => e.preventDefault()}>
      <div className="wm-console-side is-left" {...buttonsProps}>
        <div
          ref={dpadRef}
          className="wm-console-dpad"
          aria-hidden="true"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            readDpad(e);
          }}
          onPointerMove={(e) => {
            e.stopPropagation();
            if (e.currentTarget.hasPointerCapture?.(e.pointerId)) readDpad(e);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            dpad.current = 0;
            publish();
          }}
          onPointerCancel={() => {
            dpad.current = 0;
            publish();
          }}
        >
          {DIRS.map((d) => (
            <span key={d} className={`wm-console-arm is-${d}${on(DIR_BITS[d])}`}>
              <i />
            </span>
          ))}
          <span className="wm-console-hub" />
        </div>
        <span className={`wm-console-pill${on(Button.Start1)}`} data-bit={Button.Start1} aria-hidden="true">
          {start}
        </span>
      </div>
      <div className="wm-console-side is-right" {...buttonsProps}>
        <div className="wm-console-buttons" aria-hidden="true">
          {ACTIONS.map((b) => (
            <span key={b.label} className={`wm-console-btn is-${b.label.toLowerCase()}${on(b.bit)}`} data-bit={b.bit}>
              {b.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
