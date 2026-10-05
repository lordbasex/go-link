// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// A small hero of the game's own for the Create ROM tests: a 32 x 48 figure
// drawn in code (head, torso and legs, one palette zone each, counted from
// the feet), with an idle frame, two run frames, a 32 px tall crouched jump
// frame (only the torso and legs zones) and an empty frame the packer skips.
// Its picture is the 1:1 atlas the Characters screen would save.

import type { Character, Palette } from "../model";
import type { Picture } from "./pack";

export const HERO_ID = "vera";
export const HERO_PALETTES: Palette[] = [
  { id: "pal-vera-head", group: "sprite", colors: ["#000000", "#ffcc99", "#ffffff"] },
  { id: "pal-vera-torso", group: "sprite", colors: ["#000000", "#ee3322", "#ffcc99"] },
  { id: "pal-vera-legs", group: "sprite", colors: ["#000000", "#2255cc"] },
];
const ZONES = HERO_PALETTES.map((p) => p.id);

const W = 32;
/** The atlas: idle, run 1, run 2, jump (32 tall, at the bottom), empty. */
const BOXES = [
  { id: "idle_0", x: 0, h: 48 },
  { id: "run_0", x: 32, h: 48 },
  { id: "run_1", x: 64, h: 48 },
  { id: "jump_0", x: 96, h: 32 },
  { id: "empty_0", x: 128, h: 48 },
];

function hex(c: string): [number, number, number] {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function heroPicture(): Picture {
  const w = W * BOXES.length;
  const h = 48;
  const rgba = new Uint8Array(w * h * 4);
  const put = (x: number, y: number, color: string) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const [r, g, b] = hex(color);
    const o = (y * w + x) * 4;
    rgba.set([r, g, b, 255], o);
  };
  // a frame's rows from its top; `top` is its first row in the atlas
  const head = (x0: number, top: number) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < W; x++) {
        const d = Math.hypot(x - 16, y - 9);
        if (d < 5.5) put(x0 + x, top + y, x === 19 && y === 8 ? "#ffffff" : "#ffcc99");
        else if (d < 7) put(x0 + x, top + y, "#000000");
      }
  };
  const torso = (x0: number, top: number) => {
    for (let y = 0; y < 16; y++)
      for (let x = 7; x < 25; x++) {
        const arm = x < 9 || x > 22;
        if (arm && (y < 2 || y > 11)) continue;
        const edge = x === 9 || x === 22 || y === 0 || y === 15;
        put(x0 + x, top + y, arm ? "#ffcc99" : edge ? "#000000" : "#ee3322");
      }
  };
  const legs = (x0: number, top: number, spread: number) => {
    for (let y = 0; y < 16; y++) {
      const s = Math.round((spread * y) / 15);
      for (const [a, b] of [
        [10 - s, 14 - s],
        [17 + s, 21 + s],
      ] as const)
        for (let x = a; x <= b; x++) put(x0 + x, top + y, y >= 14 ? "#000000" : "#2255cc");
    }
  };
  head(0, 0);
  torso(0, 16);
  legs(0, 32, 0);
  head(32, 0);
  torso(32, 16);
  legs(32, 32, 4);
  head(64, 0);
  torso(64, 16);
  legs(64, 32, -2);
  // the jump frame: crouched, 32 px tall, sitting on the atlas' bottom
  torso(96, 16);
  legs(96, 32, 2);
  return { w, h, rgba };
}

export function heroCharacter(): Character {
  return {
    id: HERO_ID,
    name: "Vera",
    role: "hero",
    height: 48,
    sheet: "sha256:0000000000000000000000000000000000000000000000000000000000000001",
    frames: BOXES.map((b) => {
      const rows = Math.ceil(b.h / 16);
      return { id: b.id, x: b.x, y: 48 - b.h, w: W, h: b.h, px: 16, py: b.h - 1, zones: ZONES.slice(ZONES.length - rows), muzzle: null, hand: null };
    }),
    anims: {
      idle: { frames: ["idle_0", "empty_0"], fps: 4, loop: true },
      run: { frames: ["run_0", "run_1"], fps: 8, loop: true },
      jump: { frames: ["jump_0"], fps: 8, loop: false },
    },
    swapColors: ["#ee3322"],
  };
}
