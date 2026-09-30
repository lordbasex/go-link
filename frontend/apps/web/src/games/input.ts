// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The mini-games' input: every connected gamepad (standard mapping) and the
// keyboard merged into one frame. The games only see this, never the DOM,
// so their logic is tested with plain objects.

/** Buttons by their go-link number: 1 bottom, 2 right, 3 left, 4 top, 5 L, 6 R. */
export type Btn = "b1" | "b2" | "b3" | "b4" | "l" | "r" | "start";
export const BUTTONS: readonly Btn[] = ["b1", "b2", "b3", "b4", "l", "r", "start"];

export interface FrameInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  held: Record<Btn, boolean>;
  /** Triggers, 0-1 (the keyboard gives 0 or 1). */
  lt: number;
  rt: number;
  /** The left stick, -1..1 (the keyboard's arrows give -1, 0 or 1). */
  lx: number;
  ly: number;
  /** The left stick as the controller reports it, with no dead zone (0 without a controller). */
  rawLx: number;
  rawLy: number;
  hasPad: boolean;
}

/** One game frame: the input, the buttons pressed since the last frame, the time. */
export interface Frame {
  input: FrameInput;
  pressed: ReadonlySet<Btn>;
  /** Directions that turned on since the last frame. */
  turned: ReadonlySet<"up" | "down" | "left" | "right">;
  now: number;
  /** Milliseconds since the last frame (capped). */
  dt: number;
}

export function emptyInput(): FrameInput {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    held: { b1: false, b2: false, b3: false, b4: false, l: false, r: false, start: false },
    lt: 0,
    rt: 0,
    lx: 0,
    ly: 0,
    rawLx: 0,
    rawLy: 0,
    hasPad: false,
  };
}

export interface PadLike {
  mapping: string;
  buttons: readonly { pressed: boolean; value: number }[];
  axes: readonly number[];
}

/** Stick values under this count as the center. */
export const STICK_DEAD = 0.2;
/** A stick past this counts as a direction for the D-pad games. */
const STICK_DIR = 0.5;

const PAD_BUTTONS: [number, Btn][] = [
  [0, "b1"],
  [1, "b2"],
  [2, "b3"],
  [3, "b4"],
  [4, "l"],
  [5, "r"],
  [9, "start"],
];

/** Adds one controller (standard mapping) to the frame. */
export function addPad(inp: FrameInput, gp: PadLike): void {
  const b = (i: number) => {
    const x = gp.buttons[i];
    return !!x && (x.pressed || x.value > 0.5);
  };
  const v = (i: number) => gp.buttons[i]?.value ?? 0;
  inp.hasPad = true;
  for (const [i, name] of PAD_BUTTONS) if (b(i)) inp.held[name] = true;
  inp.lt = Math.max(inp.lt, v(6));
  inp.rt = Math.max(inp.rt, v(7));
  const ax = gp.axes[0] ?? 0;
  const ay = gp.axes[1] ?? 0;
  if (Math.hypot(ax, ay) > Math.hypot(inp.rawLx, inp.rawLy)) {
    inp.rawLx = ax;
    inp.rawLy = ay;
  }
  const lx = Math.abs(ax) < STICK_DEAD ? 0 : ax;
  const ly = Math.abs(ay) < STICK_DEAD ? 0 : ay;
  if (Math.abs(lx) > Math.abs(inp.lx)) inp.lx = lx;
  if (Math.abs(ly) > Math.abs(inp.ly)) inp.ly = ly;
  if (b(12) || ay < -STICK_DIR) inp.up = true;
  if (b(13) || ay > STICK_DIR) inp.down = true;
  if (b(14) || ax < -STICK_DIR) inp.left = true;
  if (b(15) || ax > STICK_DIR) inp.right = true;
}

/** The keyboard: arrows, Z X A S for buttons 1-4, Q W for L and R, E R for the triggers, Space or Enter for start. */
export function addKeys(inp: FrameInput, keys: ReadonlySet<string>): void {
  const k = (c: string) => keys.has(c);
  if (k("ArrowUp")) inp.up = true;
  if (k("ArrowDown")) inp.down = true;
  if (k("ArrowLeft")) inp.left = true;
  if (k("ArrowRight")) inp.right = true;
  const map: [string, Btn][] = [
    ["KeyZ", "b1"],
    ["KeyX", "b2"],
    ["KeyA", "b3"],
    ["KeyS", "b4"],
    ["KeyQ", "l"],
    ["KeyW", "r"],
    ["Space", "start"],
    ["Enter", "start"],
  ];
  for (const [c, name] of map) if (k(c)) inp.held[name] = true;
  if (k("KeyE")) inp.lt = 1;
  if (k("KeyR")) inp.rt = 1;
  const kx = (k("ArrowRight") ? 1 : 0) - (k("ArrowLeft") ? 1 : 0);
  const ky = (k("ArrowDown") ? 1 : 0) - (k("ArrowUp") ? 1 : 0);
  if (kx && Math.abs(inp.lx) < 1) inp.lx = kx;
  if (ky && Math.abs(inp.ly) < 1) inp.ly = ky;
}

/** Builds the next frame from the input and the previous one. */
export function nextFrame(prev: FrameInput | null, input: FrameInput, now: number, lastNow: number | null): Frame {
  const pressed = new Set<Btn>();
  const turned = new Set<"up" | "down" | "left" | "right">();
  for (const b of BUTTONS) if (input.held[b] && !prev?.held[b]) pressed.add(b);
  for (const d of ["up", "down", "left", "right"] as const) if (input[d] && !prev?.[d]) turned.add(d);
  return { input, pressed, turned, now, dt: lastNow === null ? 16 : Math.min(50, Math.max(0, now - lastNow)) };
}

/**
 * The direction in numpad notation, facing right: 5 is the center, 2 down,
 * 6 right, 3 down-right, 8 up, and so on (the way fighting games write moves).
 */
export function numpad(inp: Pick<FrameInput, "up" | "down" | "left" | "right">): number {
  const x = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  const y = (inp.up ? 1 : 0) - (inp.down ? 1 : 0);
  return 5 + x + 3 * y;
}

/** A small seeded random generator, so the games can be replayed in tests. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
