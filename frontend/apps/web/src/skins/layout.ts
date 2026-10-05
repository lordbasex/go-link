// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// The apps' skin placement math (GoLinkCore Skin.swift and core Skin.kt),
// line for line in TypeScript, so the skin
// editor shows a skin exactly as a phone will, plus the checks the apps'
// tests make. No DOM here. Format: docs/skins/README.md.

import screens from "../../../../../docs/skins/screens.json";

export const PILL_W = 58;
export const PILL_H = 34;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Insets {
  t: number;
  l: number;
  b: number;
  r: number;
}
export interface Screen {
  w: number;
  h: number;
  ins: Insets;
}
export type Orient = "portrait" | "landscape";
/** A phone (or a group of phones with the same screen) in docs/skins/screens.json. */
export type DeviceId = string;

/**
 * Phones to design on and to check against, in points / dp with their safe
 * areas: docs/skins/screens.json, the list the apps' paste check keeps too.
 */
export const DEVICES: Record<DeviceId, { name: string; platform: "ios" | "android" } & Record<Orient, Screen>> = Object.fromEntries(
  (screens.screens as ({ id: string; name: string; platform: "ios" | "android" } & Record<Orient, Screen>)[]).map(({ id, ...d }) => [id, d]),
);
export const DEVICE_IDS = Object.keys(DEVICES) as DeviceId[];

/** A device by id; an unknown id (an old saved choice) is the iPhone 17. */
export function deviceOf(id: DeviceId): { name: string; platform: "ios" | "android" } & Record<Orient, Screen> {
  return DEVICES[id] ?? DEVICES.iphone17!;
}

export const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
export const right = (r: Rect) => r.x + r.w;
export const bottom = (r: Rect) => r.y + r.h;
export const midX = (r: Rect) => r.x + r.w / 2;
export const midY = (r: Rect) => r.y + r.h / 2;
export const inset = (r: Rect, dx: number, dy: number) => R(r.x + dx, r.y + dy, r.w - 2 * dx, r.h - 2 * dy);
export const union = (a: Rect, b: Rect) => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return R(x, y, Math.max(right(a), right(b)) - x, Math.max(bottom(a), bottom(b)) - y);
};
export const intersects = (a: Rect, b: Rect) => a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a);
export const contains = (a: Rect, b: Rect, eps = 1e-6) =>
  b.x >= a.x - eps && b.y >= a.y - eps && right(b) <= right(a) + eps && bottom(b) <= bottom(a) + eps;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Arc offsets in units of the button spacing, in the order of the buttons (1 first). */
export function arc(n: number): [number, number][] {
  switch (n) {
    case 1: return [[0, 0]];
    case 2: return [[-0.55, 0.45], [0.55, -0.45]];
    case 3: return [[-1.05, 0.1], [0, -0.17], [1.05, 0.1]];
    case 4: return [[-0.95, 0], [0, 0.95], [0, -0.95], [0.95, 0]];
    default: return ([[-1.05, -0.35], [0, -0.62], [1.05, -0.35], [-1.05, 0.72], [0, 0.45], [1.05, 0.72]] as [number, number][]).slice(0, n);
  }
}

function arcSpan(n: number): [number, number] {
  const pts = arc(n);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [(Math.max(...xs) - Math.min(...xs)) * 1.08 + 1, (Math.max(...ys) - Math.min(...ys)) * 1.08 + 1];
}

function faceRects(n: number, cx: number, cy: number, d: number): Rect[] {
  const pts = arc(n);
  const g = d * 1.08;
  const ys = pts.map((p) => p[1]);
  const mid = (Math.max(...ys) + Math.min(...ys)) / 2;
  return pts.map(([px, py]) => R(cx + px * g - d / 2, cy + (py - mid) * g - d / 2, d, d));
}

function pills(count: number, centerX: number, top: number, perRow: number, gap: number, pw = PILL_W, ph = PILL_H): Rect[] {
  const out: Rect[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, count - row * perRow);
    const col = i % perRow;
    const width = inRow * pw + (inRow - 1) * gap;
    out.push(R(centerX - width / 2 + col * (pw + gap), top + row * (ph + gap), pw, ph));
  }
  return out;
}

/** The playable area: the safe area, reaching a little into the side insets in landscape. */
export function playArea(w: number, h: number, ins: Insets, landscape: boolean): Rect {
  const top = Math.max(ins.t, 8);
  const bot = Math.max(ins.b, 8);
  const left = landscape ? Math.max(ins.l * 0.45, 8) : ins.l;
  const rt = landscape ? Math.max(ins.r * 0.45, 8) : ins.r;
  return R(left, top, w - left - rt, h - top - bot);
}

/** A box of a layout in canvas units. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface MenuBox extends Box {
  direction?: string;
  hide?: boolean;
  size?: number;
}
/** One orientation's layout as the skin file writes it. */
export interface LayoutJson {
  canvas: { w: number; h: number };
  screen: Box;
  dpad: Box;
  buttons: Box;
  coin: Box;
  starts: Box;
  header: Box;
  menu: MenuBox;
  label?: Box;
  pill?: { w: number; h: number };
  [key: string]: unknown;
}

export interface Placement {
  canvasW: number;
  canvasH: number;
  screen: Box;
  dpad: Box;
  buttons: Box;
  coin: Box;
  starts: Box;
  header: Box;
  menu: Box;
  menuVertical: boolean;
  menuHides: boolean;
  menuButton: number;
  pillW: number;
  pillH: number;
  label: Box | null;
}

/** A skin for one orientation as the apps read it (Placement), with defaults; null without a layout. */
export function placementOf(layout: LayoutJson | undefined): Placement | null {
  if (!layout) return null;
  const menu = layout.menu;
  return {
    canvasW: layout.canvas.w,
    canvasH: layout.canvas.h,
    screen: layout.screen,
    dpad: layout.dpad,
    buttons: layout.buttons,
    coin: layout.coin,
    starts: layout.starts,
    header: layout.header,
    menu,
    menuVertical: menu.direction === "column",
    menuHides: menu.hide === true,
    menuButton: clamp(menu.size == null ? 36 : menu.size, 28, 60),
    pillW: layout.pill ? clamp(layout.pill.w, 44, 160) : PILL_W,
    pillH: layout.pill ? clamp(layout.pill.h, 28, 80) : PILL_H,
    label: layout.label ?? null,
  };
}

export interface Computed {
  area: Rect;
  sx: number;
  sy: number;
  k: number;
  screen: Rect;
  frame: Rect;
  box: Rect;
  dpad: Rect;
  faces: Rect[];
  coin: Rect;
  starts: Rect[];
  header: Rect;
  leftRing: Rect;
  rightRing: Rect;
  label: { x: number; y: number } | null;
  menu: Rect;
  menuVertical: boolean;
  menuHides: boolean;
  menuButton: number;
}

/** Where every part lands on a screen (SkinLayout.placed). */
export function compute(p: Placement, dev: Screen, landscape: boolean, aspect: number, buttons: number, players: number): Computed {
  const a = clamp(aspect, 0.5, 2.5);
  const n = clamp(buttons, 1, 6);
  const s = clamp(players, 1, 4);
  const area = playArea(dev.w, dev.h, dev.ins, landscape);
  const sx = area.w / p.canvasW;
  const sy = area.h / p.canvasH;
  const k = Math.min(sx, sy, 1.5);
  const region = (b: Box) => R(area.x + b.x * sx, area.y + b.y * sy, b.w * sx, b.h * sy);
  const control = (b: Box) => {
    const cx = area.x + (b.x + b.w / 2) * sx;
    const cy = area.y + (b.y + b.h / 2) * sy;
    return R(cx - (b.w * k) / 2, cy - (b.h * k) / 2, b.w * k, b.h * k);
  };
  const dbox = control(p.dpad);
  const dd = Math.min(dbox.w, dbox.h);
  const dpad = R(midX(dbox) - dd / 2, midY(dbox) - dd / 2, dd, dd);
  const bbox = control(p.buttons);
  const [spanW, spanH] = arcSpan(n);
  const d = Math.max(36, Math.min(bbox.w / spanW, bbox.h / spanH, 76 * k));
  const faces = faceRects(n, midX(bbox), midY(bbox), d);
  const pk = clamp(k, 1, 1.25);
  const pw = p.pillW * pk;
  const ph = p.pillH * pk;
  const cbox = control(p.coin);
  let coin = R(midX(cbox) - pw / 2, clamp(midY(cbox) - ph / 2, area.y, bottom(area) - ph), pw, ph);
  const sbox = control(p.starts);
  const gap = 8;
  const perRow = Math.max(1, Math.min(s, Math.floor((p.starts.w + gap) / (p.pillW + gap))));
  const rows = Math.ceil(s / perRow);
  const rowsH = rows * ph + (rows - 1) * gap;
  const startsTop = clamp(midY(sbox) - rowsH / 2, area.y, bottom(area) - rowsH);
  let starts = pills(s, midX(sbox), startsTop, perRow, gap, pw, ph);
  if (starts.some((r) => intersects(r, coin))) {
    const left = Math.min(...starts.map((r) => r.x));
    const rt = Math.max(...starts.map(right));
    const shift = right(coin) + gap - left;
    if (midX(coin) < left + (rt - left) / 2 && rt + shift <= right(area)) starts = starts.map((r) => R(r.x + shift, r.y, r.w, r.h));
    else if (left - gap - pw >= area.x) coin = R(left - gap - pw, coin.y, coin.w, coin.h);
  }
  let inner = region(p.screen);
  for (const c of [dpad, coin, ...faces, ...starts]) {
    const near = inset(c, -12.5, -12.5);
    if (!intersects(near, inner)) continue;
    const cuts = ([
      [right(near) - inner.x, R(right(near), inner.y, right(inner) - right(near), inner.h)],
      [right(inner) - near.x, R(inner.x, inner.y, near.x - inner.x, inner.h)],
      [bottom(near) - inner.y, R(inner.x, bottom(near), inner.w, bottom(inner) - bottom(near))],
      [bottom(inner) - near.y, R(inner.x, inner.y, inner.w, near.y - inner.y)],
    ] as [number, Rect][]).filter((c2) => c2[1].w > 0 && c2[1].h > 0);
    const best = cuts.sort((x, y) => x[0] - y[0])[0];
    if (best) inner = best[1];
  }
  let gw = inner.w;
  let gh = gw / a;
  if (gh > inner.h) {
    gh = inner.h;
    gw = gh * a;
  }
  const screen = R(midX(inner) - gw / 2, midY(inner) - gh / 2, gw, gh);
  const clear = inset(screen, -12, -12);
  const away = (group: Rect[]) => {
    const box = group.slice(1).reduce(union, group[0]!);
    if (!intersects(box, clear)) return group;
    const dx = midX(box) > midX(screen) ? Math.min(right(clear) - box.x, right(area) - right(box)) : Math.max(clear.x - right(box), area.x - box.x);
    return group.map((r) => R(r.x + dx, r.y, r.w, r.h));
  };
  starts = away(starts);
  if (s > 1 && starts.some((r) => intersects(r, clear))) {
    const h = s * ph + (s - 1) * gap;
    const x = midX(sbox) > midX(screen) ? Math.min(right(clear), right(area) - pw) : Math.max(clear.x - pw, area.x);
    const top = clamp(bottom(sbox) - h, area.y, bottom(area) - h);
    starts = Array.from({ length: s }, (_, i) => R(x, top + i * (ph + gap), pw, ph));
  }
  coin = away([coin])[0]!;
  const faceBox = faces.slice(1).reduce(union, faces[0]!);
  const big = Math.max(faceBox.w, faceBox.h);
  const ringR = Math.max(big / 2 + 6, Math.min(big * 0.62, midX(faceBox) - area.x, right(area) - midX(faceBox)));
  const label = p.label ? region(p.label) : null;
  return {
    area, sx, sy, k,
    screen, frame: inner, box: region(p.screen), dpad, faces, coin, starts,
    header: region(p.header),
    leftRing: inset(dpad, -dd * 0.1, -dd * 0.1),
    rightRing: R(midX(faceBox) - ringR, midY(faceBox) - ringR, ringR * 2, ringR * 2),
    label: label ? { x: midX(label), y: midY(label) } : null,
    menu: region(p.menu),
    menuVertical: p.menuVertical,
    menuHides: p.menuHides,
    menuButton: Math.max(28, p.menuButton * Math.min(k, 1.3)),
  };
}

/** A control named by the checks: the D-pad, Coin, button N or start N. */
export type ControlName = { kind: "dpad" } | { kind: "coin" } | { kind: "button"; n: number } | { kind: "start"; n: number };

/** A problem the checks found, as data (the page words it in the viewer's language). */
export type Issue = { level: "error" | "warn"; where?: { orient: Orient; device: DeviceId } } & (
  | { kind: "noLayout"; orient: Orient }
  | { kind: "offScreen"; name: ControlName }
  | { kind: "onPicture"; name: ControlName }
  | { kind: "tooSmall"; name: ControlName; size: number }
  | { kind: "overlap"; name: ControlName; other: ControlName }
  | { kind: "menuOnPicture" }
  | { kind: "pictureSmaller"; percent: number }
);

/** Layouts by orientation, as the skin file writes them. */
export type Layouts = Partial<Record<Orient, LayoutJson>>;

/**
 * The apps' tests on one skin: every device, both orientations, 1 to 6
 * buttons and 1 to 4 players. Repeats (the same problem with another
 * button or player count) are reported once.
 */
export function check(layouts: Layouts | undefined, aspect = 4 / 3): Issue[] {
  const out: Issue[] = [];
  const seen = new Set<string>();
  const add = (issue: Issue) => {
    const key = JSON.stringify(issue);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(issue);
  };
  for (const orient of ["portrait", "landscape"] as Orient[]) {
    const p = placementOf(layouts?.[orient]);
    if (!p) {
      add({ level: "warn", kind: "noLayout", orient });
      continue;
    }
    for (const device of DEVICE_IDS) {
      const dev = deviceOf(device)[orient];
      const bounds = R(0, 0, dev.w, dev.h);
      const where = { orient, device };
      for (let n = 1; n <= 6; n++) {
        for (let s = 1; s <= 4; s++) {
          const l = compute(p, dev, orient === "landscape", aspect, n, s);
          const controls: [ControlName, Rect][] = [
            [{ kind: "dpad" }, l.dpad],
            [{ kind: "coin" }, l.coin],
            ...l.faces.map((r, i): [ControlName, Rect] => [{ kind: "button", n: i + 1 }, r]),
            ...l.starts.map((r, i): [ControlName, Rect] => [{ kind: "start", n: i + 1 }, r]),
          ];
          for (const [name, c] of controls) {
            if (!contains(bounds, c)) add({ level: "error", where, kind: "offScreen", name });
            if (intersects(c, inset(l.screen, -4, -4))) add({ level: "error", where, kind: "onPicture", name });
            if (Math.min(c.w, c.h) < 34) add({ level: "error", where, kind: "tooSmall", name, size: Math.round(Math.min(c.w, c.h)) });
          }
          for (let i = 0; i < controls.length; i++) {
            for (let j = i + 1; j < controls.length; j++) {
              if (intersects(controls[i]![1], controls[j]![1])) add({ level: "error", where, kind: "overlap", name: controls[i]![0], other: controls[j]![0] });
            }
          }
          if (!p.menuHides && intersects(l.menu, l.screen)) add({ level: "warn", where, kind: "menuOnPicture" });
          if (device === "iphone17" && n === 6 && s === 2) {
            // The picture the box would give without any control in the way.
            const whole = Math.min(l.box.w, l.box.h * aspect);
            const lost = 1 - l.screen.w / whole;
            if (lost > 0.01) add({ level: "warn", where, kind: "pictureSmaller", percent: Math.round(lost * 100) });
          }
        }
      }
    }
  }
  return out;
}
