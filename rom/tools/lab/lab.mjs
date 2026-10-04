// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Experiment 1's harness library (docs/experiments/harness.md): reads a
// ROM set zip, powers it on the CPS-1 board model (@go-link/cps1-sim),
// applies inputs frame by frame, decodes the lab state (rom/src/lab_state.h)
// from work RAM and draws the screen. Used by run.mjs, validate.mjs and
// compare.mjs. Deterministic: the same zip and inputs give the same frames.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BoardSim, runPowerOn } from "../../../frontend/packages/cps1-sim/src/index.ts";
import { ROM_SETS, SLAMMAST, assembleProgram, joinGfx, renderScreen, SCREEN_W, SCREEN_H } from "../../../frontend/packages/cps1/src/index.ts";

export { SCREEN_W, SCREEN_H, runPowerOn };

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, "../../..");
export const WASM = path.join(REPO, "frontend/packages/cps1-sim/wasm/cps1sim.wasm");

export const LAB_MAGIC = 0x4c414231;
export const LAB_SIZE = 0xc8;
export const WRAM_BASE = 0xff0000;
/** The text layer the screen shows, in 8 px characters, and where our programs keep scroll1 in graphics RAM (0x900000). */
export const TEXT_COLS = 48;
export const TEXT_ROWS = 28;
const SCROLL1_OFFSET = 0;
const WRAM_BYTES = 0x10000;
const PROGRAM_BYTES = 0x200000; // the board model's program space (cps1-sim PROGRAM_SIZE)
export const MODES = ["boot", "title", "playing", "clear", "game_over"];
export const PLAYER_STATES = ["off", "idle", "walk", "run", "air", "climb", "attack", "hurt", "dead", "crouch", "crawl"];
export const ENEMY_STATES = ["off", "walk", "hit", "down", "attack", "fall", "held", "hidden"]; // the engine's EN_*, the beat 'em up's last
export const CELLS = ".#=HC"; // empty, solid, one-way, ladder, crate (LAB_CELL_*)

/** The files of a zip (name -> bytes), read with the system's unzip. */
export function readZip(zip) {
  const names = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" }).split("\n").filter(Boolean);
  const files = new Map();
  for (const n of names) files.set(n, new Uint8Array(execFileSync("unzip", ["-p", zip, n], { maxBuffer: 64 << 20 })));
  return files;
}

/** The set a zip is (by its name, else slammast). */
export function setOf(zip) {
  return ROM_SETS[path.basename(zip, ".zip")] ?? SLAMMAST;
}

/**
 * The symbol map next to a zip: <set>.symbols.json, else symbols.json of
 * the same set, else null (the lab state is then found by its magic).
 */
export function readSymbols(zip, explicit) {
  const dir = path.dirname(zip);
  const set = path.basename(zip, ".zip");
  for (const f of explicit ? [explicit] : [path.join(dir, `${set}.symbols.json`), path.join(dir, "symbols.json")]) {
    if (!fs.existsSync(f)) continue;
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    if (explicit || !j.set || j.set === set) return { file: f, ...j };
  }
  return null;
}

// --------------------------------------------------------------- inputs

/** Button names (the device's framelab names) and the board bit each one sets per port. */
export const BUTTONS = ["up", "down", "left", "right", "b1", "b2", "b3", "b4", "b5", "b6", "start", "coin"];
const DIR_BITS = { right: 0x01, left: 0x02, down: 0x04, up: 0x08, b1: 0x10, b2: 0x20 };

/**
 * The board's input words for one frame from a set of buttons per port
 * (ports 1-4), active low, as slammast wires them: P1/P2 share 0x800000
 * (P1 low byte, button 3 at 0x40 / 0x4000; P3 and P4's button 3 at 0x80 /
 * 0x8000), coins and starts of P1/P2 in the system byte, P3/P4 at
 * 0xf1c000/2 with their coin at 0x40 and start at 0x80. b4-b6 do nothing.
 */
export function boardInputs(ports) {
  let p12 = 0, sys = 0, p3 = 0, p4 = 0;
  ports.forEach((set, i) => {
    if (!set) return;
    let byte = 0;
    for (const b of set) if (DIR_BITS[b]) byte |= DIR_BITS[b];
    if (i === 0 || i === 1) {
      if (set.has("b3")) byte |= 0x40;
      p12 |= byte << (i * 8);
      if (set.has("coin")) sys |= i ? 0x02 : 0x01;
      if (set.has("start")) sys |= i ? 0x20 : 0x10;
    } else {
      if (set.has("coin")) byte |= 0x40;
      if (set.has("start")) byte |= 0x80;
      if (set.has("b3")) p12 |= i === 2 ? 0x80 : 0x8000;
      if (i === 2) p3 = byte;
      else p4 = byte;
    }
  });
  return { p12: ~p12 & 0xffff, sys: ~sys & 0xff, p3: ~p3 & 0xffff, p4: ~p4 & 0xffff };
}

/**
 * An input script (JSON): { frames, checkpoints, steps: [{ from, to,
 * buttons: ["right", "b1"], port: 1 }] }, the same steps as the device's
 * framelab script (FROM-TO:BUTTONS@PORT, TO inclusive).
 */
export function readScript(file) {
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  checkScript(j, file);
  return j;
}

export function checkScript(j, name = "script") {
  if (!Array.isArray(j.steps)) throw new Error(`${name}: "steps" must be a list`);
  for (const s of j.steps) {
    if (!Number.isInteger(s.from) || !Number.isInteger(s.to) || s.from < 0 || s.to < s.from) throw new Error(`${name}: bad frame range ${JSON.stringify(s)}`);
    if (s.port !== undefined && ![1, 2, 3, 4].includes(s.port)) throw new Error(`${name}: port must be 1-4 in ${JSON.stringify(s)}`);
    for (const b of s.buttons ?? []) if (!BUTTONS.includes(b)) throw new Error(`${name}: unknown button "${b}"`);
  }
}

/** A script as JSON text with one step per line (easy to read and diff). */
export function formatScript(j) {
  const { steps, ...head } = j;
  const top = JSON.stringify(head, null, 1).replace(/\n}$/, "");
  return `${top}${Object.keys(head).length ? "," : ""}\n "steps": [\n${steps.map((s) => "  " + JSON.stringify(s)).join(",\n")}\n ]\n}\n`;
}

/** The buttons of the four ports at a frame. */
export function scriptPorts(script, frame) {
  const ports = [new Set(), new Set(), new Set(), new Set()];
  for (const s of script.steps) if (frame >= s.from && frame <= s.to) for (const b of s.buttons ?? []) ports[(s.port ?? 1) - 1].add(b);
  return ports;
}

/** Run-length steps from per-frame inputs (frame -> [4 sets]), so any run can be replayed as a script. */
export class InputRecorder {
  constructor() {
    this.steps = [];
    this.open = new Map(); // "port:button" -> from
    this.last = -1;
  }

  add(frame, ports) {
    const now = new Set();
    ports.forEach((set, i) => set?.forEach((b) => now.add(`${i + 1}:${b}`)));
    for (const [k, from] of this.open) if (!now.has(k)) this.close(k, from, frame - 1);
    for (const k of now) if (!this.open.has(k)) this.open.set(k, frame);
    this.last = frame;
  }

  close(k, from, to) {
    const [port, b] = k.split(":");
    this.steps.push({ from, to, port: Number(port), buttons: [b] });
    this.open.delete(k);
  }

  finish(extra = {}) {
    for (const [k, from] of [...this.open]) this.close(k, from, this.last);
    this.steps.sort((a, b) => a.from - b.from || a.port - b.port || a.buttons[0].localeCompare(b.buttons[0]));
    return { ...extra, steps: this.steps };
  }
}

// ------------------------------------------------------------ the board

export class Machine {
  /**
   * Powers a zip on. inputDelay: frames between a frame's inputs and the
   * frame the board reads them. 1 (the default) matches the real core:
   * mame2003-plus polls the controls at the start of retro_run while the
   * board model raises the vblank (when our programs read the inputs) at
   * the start of its frame, so without the delay the simulator reacts one
   * frame earlier than the core (harness.md, "Same picture").
   */
  static async open(zip, { symbols, inputDelay = 1 } = {}) {
    const m = new Machine();
    m.zip = zip;
    m.set = setOf(zip);
    m.files = readZip(zip);
    m.program = assembleProgram(m.set, m.files);
    m.gfx = joinGfx(m.set, m.files);
    m.sim = await BoardSim.create(fs.readFileSync(WASM));
    m.sim.load(m.program);
    m.frame = 0; // frames run since power on
    m.symbols = readSymbols(zip, symbols);
    m.labAddr = m.symbols?.lab_state?.address ?? null;
    m.labFrom = m.labAddr !== null ? "symbol" : null;
    m.prevObj = null;
    m.inputDelay = inputDelay;
    m.queue = [];
    return m;
  }

  /** Runs one frame with these inputs (4 sets of button names). */
  step(ports) {
    this.queue.push(ports);
    const i = boardInputs(this.queue.length > this.inputDelay ? this.queue.shift() : []);
    this.sim.inputs(i.p12, i.sys, i.p3, i.p4);
    const st = this.sim.frame();
    this.frame++;
    if (st.fault) throw new Error(`the 68000 faulted at frame ${this.frame}: ${JSON.stringify({ fault: st.fault, addr: st.faultAddr.toString(16), pc: st.faultPc.toString(16) })}`);
    return st;
  }

  /**
   * The text layer (scroll1) as the screen shows it: 28 rows of 48
   * characters, as our programs write it (tile code = ASCII from the
   * screen's corner at 64, 16; a double-size glyph's top-left quarter is
   * its character, the other three quarters spaces). Other codes are "?".
   */
  text() {
    const g = this.sim.gfxram();
    const rows = [];
    for (let r = 0; r < TEXT_ROWS; r++) {
      let s = "";
      for (let c = 0; c < TEXT_COLS; c++) {
        const col = c + 8;
        const row = r + 2;
        const off = (row & 0x1f) + ((col & 0x3f) << 5) + ((row & 0x20) << 6);
        const code = g[(SCROLL1_OFFSET + off * 4) >> 1] ?? 0x20;
        if (code === 0x20 || code === 0) s += " ";
        else if (code > 0x20 && code < 0x60) s += String.fromCharCode(code);
        else if (code >= 0x80 && code < 0x80 + 63 * 4) s += (code - 0x80) % 4 ? " " : String.fromCharCode(0x21 + ((code - 0x80) >> 2));
        else s += "?";
      }
      rows.push(s.trimEnd());
    }
    return rows;
  }

  /** Work RAM as big-endian bytes (0xff0000 = index 0). */
  wramBytes() {
    const w = this.sim.wram();
    const b = new Uint8Array(w.length * 2);
    for (let i = 0; i < w.length; i++) {
      b[i * 2] = w[i] >> 8;
      b[i * 2 + 1] = w[i] & 0xff;
    }
    return b;
  }

  /** The lab state, decoded, or null when the game has none (yet). */
  lab(ram = this.wramBytes()) {
    if (this.labAddr === null) {
      for (let a = 0; a + LAB_SIZE <= ram.length; a += 2)
        if (be32(ram, a) === LAB_MAGIC && be16(ram, a + 4) === 1) {
          this.labAddr = WRAM_BASE + a;
          this.labFrom = "magic";
          break;
        }
      if (this.labAddr === null) return null;
    }
    const at = this.labAddr - WRAM_BASE;
    if (at < 0 || at + LAB_SIZE > ram.length || be32(ram, at) !== LAB_MAGIC) return null;
    return decodeLab(ram, at);
  }

  /** The collision map the lab state points at (rows of LAB_CELL_* codes), or null. */
  collision(lab, ram = this.wramBytes()) {
    if (!lab?.colMap || !lab.colCols) return null;
    const at = lab.colMap - WRAM_BASE;
    const n = lab.colCols * lab.colRows;
    if (at >= 0 && at + n <= ram.length) return { cols: lab.colCols, rows: lab.colRows, cells: Array.from(ram.subarray(at, at + n)) };
    if (lab.colMap + n <= this.program.length) return { cols: lab.colCols, rows: lab.colRows, cells: Array.from(this.program.subarray(lab.colMap, lab.colMap + n)) };
    return null;
  }

  /**
   * The screen as RGBA (384 x 224). With `delayed`, sprites come from the
   * previous frame's table, as the board shows them (closer to the core).
   */
  screen({ delayed = true } = {}) {
    const gfxram = this.sim.gfxram();
    const regs = this.sim.regs();
    let shown = gfxram;
    if (delayed) {
      const base = ((regs[0] << 8) & 0x3ffff) >> 1;
      const cur = gfxram.slice(base, base + 0x400);
      if (this.prevObj) {
        shown = gfxram.slice();
        shown.set(this.prevObj, base);
      }
      this.prevObj = cur;
    }
    return renderScreen({ gfxram: shown, regs, gfx: this.gfx, set: this.set });
  }

  /**
   * The lab state read straight from the board's memory (only its 200
   * bytes, no copy of the whole work RAM): the same result as lab(), about
   * ten times cheaper, for tools that read it every frame (qa.mjs).
   */
  labFast() {
    if (this.labAddr === null) return this.lab();
    const at = (this.labAddr - WRAM_BASE) >> 1;
    const words = this.wramView();
    if (at < 0 || at + LAB_SIZE / 2 > words.length) return null;
    const b = new Uint8Array(LAB_SIZE);
    for (let i = 0; i < LAB_SIZE / 2; i++) {
      b[i * 2] = words[at + i] >> 8;
      b[i * 2 + 1] = words[at + i] & 0xff;
    }
    return be32(b, 0) === LAB_MAGIC ? decodeLab(b, 0) : null;
  }

  /** collision() without copying the work RAM (a map in ROM is read once and kept). */
  collisionFast(lab) {
    if (!lab?.colMap || !lab.colCols) return null;
    const n = lab.colCols * lab.colRows;
    const at = lab.colMap - WRAM_BASE;
    if (at >= 0 && at + n <= WRAM_BYTES) {
      const words = this.wramView();
      const cells = new Array(n);
      for (let i = 0; i < n; i++) {
        const w = words[(at + i) >> 1];
        cells[i] = (at + i) & 1 ? w & 0xff : w >> 8;
      }
      return { cols: lab.colCols, rows: lab.colRows, cells };
    }
    const key = `${lab.colMap}:${n}`;
    if (this.romMap?.key !== key) this.romMap = { key, map: this.collision(lab, new Uint8Array(0)) };
    return this.romMap.map;
  }

  /** A live view of the work RAM words (host order; valid until the next call into the board). */
  wramView() {
    return new Uint16Array(this.sim.x.memory.buffer, this.sim.x.board_wram(), WRAM_BYTES / 2);
  }

  /**
   * The whole machine at this frame (the board model's memory and the
   * runner's own state), for restore(): replaying from a snapshot gives
   * the same frames as running from power on.
   */
  snapshot() {
    // the program ROM (2 MB) never changes after load(): it is left out
    const all = new Uint8Array(this.sim.x.memory.buffer);
    const rom = this.sim.x.board_rom();
    const romEnd = rom + PROGRAM_BYTES;
    return { size: all.length, rom, low: all.slice(0, rom), high: all.slice(romEnd), frame: this.frame, queue: this.queue.map((p) => p.map((s) => new Set(s))), prevObj: this.prevObj?.slice() ?? null, labAddr: this.labAddr, labFrom: this.labFrom };
  }

  restore(s) {
    const mem = this.sim.x.memory;
    if (mem.buffer.byteLength < s.size) mem.grow((s.size - mem.buffer.byteLength) / 65536);
    const all = new Uint8Array(mem.buffer);
    all.set(s.low, 0);
    all.set(s.high, s.rom + PROGRAM_BYTES);
    this.frame = s.frame;
    this.queue = s.queue.map((p) => p.map((x) => new Set(x)));
    this.prevObj = s.prevObj?.slice() ?? null;
    this.labAddr = s.labAddr;
    this.labFrom = s.labFrom;
  }

  /** Keeps the sprite table history right when a frame is not drawn. */
  keepSprites() {
    const regs = this.sim.regs();
    const base = ((regs[0] << 8) & 0x3ffff) >> 1;
    this.prevObj = this.sim.gfxram().slice(base, base + 0x400);
  }
}

const be16 = (b, a) => (b[a] << 8) | b[a + 1];
const be32 = (b, a) => ((b[a] << 24) | (b[a + 1] << 16) | (b[a + 2] << 8) | b[a + 3]) >>> 0;
const s16 = (b, a) => (be16(b, a) << 16) >> 16;
const s8 = (v) => (v << 24) >> 24;

/** Decodes lab_state.h's layout at offset `at` of the work RAM bytes. */
export function decodeLab(b, at) {
  const players = [];
  for (let i = 0; i < 4; i++) {
    const o = at + 0x28 + i * 16;
    const pf = b[o + 13];
    players.push({
      active: b[o] === 1,
      state: PLAYER_STATES[b[o + 1]] ?? b[o + 1],
      facing: s8(b[o + 2]),
      energy: b[o + 3],
      x: s16(b, o + 4),
      y: s16(b, o + 6),
      score: be32(b, o + 8),
      hurt: b[o + 12],
      ground: !!(pf & 1),
      climbing: !!(pf & 2),
      running: !!(pf & 4),
      firing: !!(pf & 8),
      kicking: !!(pf & 0x10),
      jetting: !!(pf & 0x20),
      airJump: !!(pf & 0x40),
      vy: s16(b, o + 14),
    });
  }
  const nE = Math.min(b[at + 0x1e], 8);
  const nC = Math.min(b[at + 0x1f], 4);
  const enemies = [];
  for (let i = 0; i < nE; i++) {
    const o = at + 0x68 + i * 8;
    enemies.push({ alive: b[o] === 1, hp: b[o + 1], x: s16(b, o + 2), y: s16(b, o + 4), facing: s8(b[o + 6]), state: ENEMY_STATES[b[o + 7]] ?? b[o + 7] });
  }
  const civilians = [];
  for (let i = 0; i < nC; i++) {
    const o = at + 0xa8 + i * 8;
    civilians.push({ rescued: b[o] === 1, x: s16(b, o + 2), y: s16(b, o + 4) });
  }
  const flags = b[at + 0x0f];
  return {
    frame: be32(b, at + 8),
    mode: MODES[b[at + 0x0c]] ?? b[at + 0x0c],
    credits: b[at + 0x0d],
    sectionClear: b[at + 0x0e] === 1,
    flags: { exit: !!(flags & 1), rescueAll: !!(flags & 2), damage: !!(flags & 4), exitTouch: !!(flags & 8) },
    cam: { x: s16(b, at + 0x10), y: s16(b, at + 0x12) },
    level: { w: be16(b, at + 0x14), h: be16(b, at + 0x16) },
    exit: { x0: s16(b, at + 0x18), x1: s16(b, at + 0x1a), y: s16(b, at + 0x1c) },
    colMap: be32(b, at + 0x20),
    colCols: be16(b, at + 0x24),
    colRows: be16(b, at + 0x26),
    players,
    enemies,
    civilians,
  };
}

/** The lab state without the bookkeeping fields (what players and logs see). */
export function publicLab(lab) {
  if (!lab) return null;
  const { colMap, colCols, colRows, ...rest } = lab;
  return rest;
}
