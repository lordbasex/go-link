// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// The power-on test's results in English: one sentence per result code.
// Willy Maker's export.en.ts uses these; es and pt translate them there.

export type Params = Record<string, string | number>;

/** 68000 exception vectors by number (the ones the board reports as faults). */
export const VECTOR_NAMES: Record<number, string> = {
  2: "bus error",
  3: "address error",
  4: "illegal instruction",
  5: "division by zero",
  6: "CHK",
  7: "TRAPV",
  8: "privilege violation",
  9: "trace",
  10: "line A opcode",
  11: "line F opcode",
  14: "format error",
  15: "uninitialized interrupt",
  24: "spurious interrupt",
};

const vector = (p: Params) => VECTOR_NAMES[Number(p.vector)] ?? `vector ${p.vector}`;

const TEXT = {
  "files.ok": (p: Params) => `All ${p.n} files of ${p.set} are there, each with its size`,
  "files.not-zip": () => "This is not a .zip file, or it is damaged.",
  "files.too-big": (p: Params) => `The zip is too big: a ROM set is at most ${p.max} MB.`,
  "files.damaged": (p: Params) => `${p.name} is damaged inside the zip.`,
  "files.missing": (p: Params) => (Number(p.n) === 1 ? `${p.name} is missing from the zip.` : `${p.n} files are missing from the zip, like ${p.name}.`),
  "files.size": (p: Params) => `${p.name} is ${p.size} bytes. The set needs exactly ${p.expected}.`,
  "program.ok": (p: Params) => `The program ROMs join into ${p.bytes} bytes of 68000 code and data`,
  "program.empty": () => "The program ROMs are empty: there is no 68000 program in them.",
  "vectors.ok": (p: Params) => `Reset at ${p.pc}, stack at ${p.sp}, vblank handler at ${p.vblank}`,
  "vectors.stack": (p: Params) => `The initial stack pointer is ${p.sp}: it must point to work RAM (0xff0000-0xffffff).`,
  "vectors.reset": (p: Params) => `The reset vector points to ${p.pc}, outside the program.`,
  "vectors.vblank": (p: Params) => `The vblank interrupt (level 2) points to ${p.addr}, outside the program.`,
  "run.ok": (p: Params) => `${p.frames} frames (${p.seconds} s of game) with no crash`,
  "run.exception": (p: Params) => `The 68000 crashed at ${p.pc} on frame ${p.frame}: ${vector(p)}.`,
  "run.unmapped": (p: Params) => `On frame ${p.frame} the code at ${p.pc} ${p.access === "write" ? "wrote to" : "read"} ${p.addr}, an address the board does not have.`,
  "run.rom-write": (p: Params) => `On frame ${p.frame} the code at ${p.pc} wrote to ROM (${p.addr}).`,
  "run.odd": (p: Params) => `On frame ${p.frame} the code at ${p.pc} used a word at the odd address ${p.addr} (an address error on the 68000).`,
  "run.stack": (p: Params) => `On frame ${p.frame} the stack pointer left work RAM (${p.sp}).`,
  "run.stuck": (p: Params) => `The program is stuck in a loop at ${p.pc} with interrupts off, since frame ${p.frame}.`,
  "vblank.ok": (p: Params) => `The vblank interrupt ran on ${p.count} of ${p.frames} frames`,
  "vblank.none": (p: Params) => `The vblank interrupt never ran: interrupts stay masked (SR ${p.sr}).`,
  "vblank.missed": (p: Params) => `The vblank interrupt ran on only ${p.count} of ${p.frames} frames.`,
  "palette.ok": (p: Params) => `Palettes written from frame ${p.frame}, ${p.colors} colors set`,
  "palette.none": () => "The program never writes the palettes, so the screen stays black.",
  "palette.base": (p: Params) => `The palette base (${p.base}) is outside graphics RAM.`,
  "palette.black": () => "Every palette color is black.",
  "layers.ok": (p: Params) => `Layers on: ${p.layers}; ${p.sprites} sprites in the table`,
  "layers.none": (p: Params) => `No layer is enabled (layer control ${p.control}) and the sprite table is empty.`,
  "layers.base": (p: Params) => `${p.layer}'s map base (${p.base}) is outside graphics RAM.`,
  "picture.ok": (p: Params) => `A picture on screen from frame ${p.frame}`,
  "picture.flat": (p: Params) => `After ${p.frames} frames the screen is still one flat color.`,
  "alive.ok": (p: Params) => `The game keeps drawing (last change on frame ${p.frame})`,
  "alive.frozen": (p: Params) => (Number(p.frame) < 0 ? "The program never writes graphics RAM." : `The picture froze: graphics RAM has not changed since frame ${p.frame}.`),
  "inputs.ok": () => "Coin and Start change the game",
  "inputs.ignored": (p: Params) => `Coin (frame ${p.coin}) and Start (frame ${p.start}) changed nothing: the game does not read its inputs.`,
  skipped: () => "Not run: an earlier step failed.",
};

export type PowerOnCode = keyof typeof TEXT;
export type PowerOnTexts = Record<PowerOnCode, (p: Params) => string>;

export const POWER_ON_TEXT: PowerOnTexts = TEXT;

export const STEP_TITLES = {
  files: "Files of the set",
  program: "Program ROMs",
  vectors: "Reset vectors",
  run: "Runs without crashing",
  vblank: "Vblank interrupt",
  palette: "Palettes",
  layers: "Layers",
  picture: "A picture on screen",
  alive: "Keeps running",
  inputs: "Reacts to Coin and Start",
};
