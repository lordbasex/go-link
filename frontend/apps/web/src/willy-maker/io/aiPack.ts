// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The AI pack (docs/willy-maker/file-format.md): everything an AI, or a
// person, needs to produce the ROM with the tools in rom/. The levels as
// Tiled maps with their pictures, each character as animation strips and a
// sheet.json, the project file, the review, our ROM docs and a generated
// PROMPT.md. Pictures are converted to the board's colors. The output is
// deterministic: the same project gives the same bytes (fixed timestamps,
// sorted entries, a PNG writer without a canvas).

import { CELL, DEFAULT_GENRE, genreAvailable, isGenre, layerGrid, TAGS, tagLayer, type AssetRef, type Character, type Level, type Project, type TileLayer, type Tileset } from "../model";
import { boardOf, layoutOf } from "../board/cps1";
import * as R from "../engine/rules";
import { checkText, REQUIRED_ANIMS, type Review } from "../editor/validate";
import { exportEn } from "../i18n/export.en";
import { coreEn } from "../i18n/core.en";
import { getAsset } from "./assets";
import { decodePng, encodePng, type RgbaImage } from "./png";
import { COLLISION_TILES, levelToTiled, playLayer, TAG_COLORS } from "./tiledExport";
import { readZip, writeZip, type ZipEntry } from "./zip";
import { checkAiPack, PackBuildError } from "./packCheck";

/** Zip entries get this date, so two exports of the same project are the same bytes. */
export const PACK_DATE = new Date(2026, 0, 1, 0, 0, 0);

/** Our ROM docs as the pack carries them (docs/<name>), from docs/rom/. */
export const DOC_FILES: Record<string, string> = { "README.md": "rom-README.md", "art-spec.md": "art-spec.md", "hardware.md": "hardware.md", "story.md": "story.md", "journal.md": "journal.md" };

/** Loads docs/rom/*.md from the repository (bundled at build time, fetched when the pack is made). */
export async function loadRomDocs(): Promise<Record<string, string>> {
  const files = import.meta.glob("../../../../../../docs/rom/*.md", { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;
  const out: Record<string, string> = {};
  for (const [path, load] of Object.entries(files)) {
    const name = DOC_FILES[path.slice(path.lastIndexOf("/") + 1)];
    if (name) out[name] = await load();
  }
  return out;
}

export interface AiPackOptions {
  review: Review;
  /** docs/<name> contents; loadRomDocs() when missing. */
  docs?: Record<string, string>;
  /** Reads a stored picture (IndexedDB by default). */
  loadAsset?: (ref: string) => Promise<{ bytes: Uint8Array; type: string } | null>;
  /** Decodes a picture that is not a PNG (the browser's canvas by default). */
  decode?: (bytes: Uint8Array, type: string) => Promise<RgbaImage>;
  /** Skips the build check (level 2); only tests that break a pack on purpose use it. */
  skipCheck?: boolean;
}

export interface AiPack {
  zip: Uint8Array;
  prompt: string;
  /** The entry names, in zip order. */
  files: string[];
}

/** "The Lag Protocol" -> "the-lag-protocol.ai-pack.zip". */
export function aiPackName(p: Project): string {
  const slug = p.title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "willy-maker-game"}.ai-pack.zip`;
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "_") || "_";

async function canvasDecode(bytes: Uint8Array, type: string): Promise<RgbaImage> {
  if (typeof document === "undefined") throw new Error("cannot read this picture here");
  const { decodeImage } = await import("../sprites/image");
  const img = await decodeImage(bytes, type);
  return { w: img.w, h: img.h, data: new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength) };
}

/** The pixel on the board: each channel to a multiple of 17, alpha on or off. */
function toBoard(img: RgbaImage): RgbaImage {
  const d = new Uint8Array(img.data.length);
  for (let i = 0; i < d.length; i += 4) {
    if (img.data[i + 3]! < 128) continue;
    d[i] = Math.round(img.data[i]! / 17) * 17;
    d[i + 1] = Math.round(img.data[i + 1]! / 17) * 17;
    d[i + 2] = Math.round(img.data[i + 2]! / 17) * 17;
    d[i + 3] = 255;
  }
  return { w: img.w, h: img.h, data: d };
}

function blit(dst: RgbaImage, src: RgbaImage, sx: number, sy: number, w: number, h: number, dx: number, dy: number, opaqueOnly = true): void {
  for (let y = 0; y < h; y++) {
    const ty = dy + y;
    const fy = sy + y;
    if (ty < 0 || ty >= dst.h || fy < 0 || fy >= src.h) continue;
    for (let x = 0; x < w; x++) {
      const tx = dx + x;
      const fx = sx + x;
      if (tx < 0 || tx >= dst.w || fx < 0 || fx >= src.w) continue;
      const s = (fy * src.w + fx) * 4;
      if (opaqueOnly && src.data[s + 3]! < 128) continue;
      const t = (ty * dst.w + tx) * 4;
      dst.data[t] = src.data[s]!;
      dst.data[t + 1] = src.data[s + 1]!;
      dst.data[t + 2] = src.data[s + 2]!;
      dst.data[t + 3] = src.data[s + 3]!;
    }
  }
}

/** Draws a tile layer with its tileset over `dst`; returns false when nothing was drawn. */
function drawTiles(dst: RgbaImage, level: Level, layer: TileLayer, ts: Tileset, img: RgbaImage): boolean {
  const g = layerGrid(level, layer);
  const size = ts.tile;
  const columns = ts.columns || Math.max(1, Math.floor(img.w / size));
  let drew = false;
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++) {
      const v = g.get(c, r);
      if (!v) continue;
      const i = v - 1;
      blit(dst, img, (i % columns) * size, Math.floor(i / columns) * size, size, size, c * layer.grid, r * layer.grid + layer.grid - size);
      drew = true;
    }
  return drew;
}

function collisionPicture(level: Level): RgbaImage {
  const w = level.size.w;
  const h = level.size.h;
  const data = new Uint8Array(w * h * 4);
  const g = layerGrid(level, tagLayer(level));
  for (let y = 0; y < h; y++) {
    const r = Math.floor(y / CELL);
    for (let x = 0; x < w; x++) {
      const [cr, cg, cb] = TAG_COLORS[TAGS[g.get(Math.floor(x / CELL), r)] ?? "air"] ?? TAG_COLORS.air!;
      const i = (y * w + x) * 4;
      data[i] = cr;
      data[i + 1] = cg;
      data[i + 2] = cb;
      data[i + 3] = 255;
    }
  }
  return { w, h, data };
}

function collisionTileset(): RgbaImage {
  const w = COLLISION_TILES.length * CELL;
  const data = new Uint8Array(w * CELL * 4);
  COLLISION_TILES.forEach((tag, t) => {
    const [r, g, b] = TAG_COLORS[tag]!;
    for (let y = 0; y < CELL; y++)
      for (let x = 0; x < CELL; x++) {
        const i = (y * w + t * CELL + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
  });
  return { w, h: CELL, data };
}

const MAGENTA = [255, 0, 255] as const;

/** An animation as one strip on magenta, feet on one line, and its frame boxes in the strip. */
function animStrip(ch: Character, frameIds: string[], atlas: RgbaImage): { img: RgbaImage; frames: Record<string, unknown>[] } {
  const frames = frameIds.map((id) => ch.frames.find((f) => f.id === id)).filter((f): f is Character["frames"][number] => !!f);
  const base = frames.reduce((m, f) => Math.max(m, f.py), 0);
  const w = Math.max(1, frames.reduce((n, f) => n + f.w, 0));
  const h = Math.max(1, frames.reduce((m, f) => Math.max(m, base - f.py + f.h), 0));
  const img: RgbaImage = { w, h, data: new Uint8Array(w * h * 4) };
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = MAGENTA[0];
    img.data[i + 1] = MAGENTA[1];
    img.data[i + 2] = MAGENTA[2];
    img.data[i + 3] = 255;
  }
  const out: Record<string, unknown>[] = [];
  let x = 0;
  for (const f of frames) {
    const y = base - f.py;
    blit(img, atlas, f.x, f.y, f.w, f.h, x, y);
    out.push({ id: f.id, x, y, w: f.w, h: f.h, px: f.px, py: f.py, zones: f.zones, muzzle: f.muzzle, hand: f.hand });
    x += f.w;
  }
  return { img, frames: out };
}

const actionText: Record<string, string> = {
  jump: "jump (down + jump drops through a one-way ledge)",
  fire: "fire: the machine gun, aimed with the stick; the knife automatically when an enemy is right in front",
  special: "special: the picked-up weapon, with limited ammo (a grenade when there is none)",
};

/** PROMPT.md: the brief for the AI, filled in from the project and the review. */
export function buildPrompt(p: Project, review: Review, notes: { missingPictures?: string[] } = {}): string {
  const board = boardOf(p);
  const layout = layoutOf(p);
  const s = p.settings;
  const order = (s.levels ?? []).map((id) => p.levels.find((l) => l.id === id)).filter((l): l is Level => !!l);
  const levels = order.length ? order : p.levels;
  const b = (s.buttons ?? {}) as unknown as Record<string, string>;
  const G = R.rulesWith(s.rules);
  const L: string[] = [];
  const line = (t = "") => L.push(t);

  line(`# ${p.title}: build the ROM`);
  line();
  line(`You are building an arcade game ROM for go-link with the tools in the go-link repository (rom/). Target board: Capcom ${board.name} (${board.screen.w} × ${board.screen.h} at ${board.screen.fps} Hz, 68000 main CPU), laid out as the files of the \`${layout.id}\` set: ${layout.players} players × ${layout.buttons} buttons, run by the mame2003-plus core (MAME 0.78). Every byte must be original: no code, graphics, music or text from any existing game.`);
  line();
  line("Follow docs/rom-README.md, docs/art-spec.md and docs/hardware.md (in this pack). docs/journal.md is the lab journal of the prototype that already runs in the core and in a go-link room: its section \"How to reproduce from zero\" is the build you start from. docs/story.md is the game bible: the world, the heroes and the tone.");
  line();
  line(`The rules the game must keep (a jump peaks at about 62 px, so ledges up to 48 px; 32 px crates climbed ${G.crateClimb === "push" ? "by walking into them" : "by jumping"}, one-way ledges, ladders, double-tap run, automatic knife) are the ones Willy Maker's play mode used; they are listed below with their numbers. Where this game's own rules (the Game tab's Rules card) differ from the prototype's rom/src/main.c, this game's win.`);
  line();

  line("## The game");
  line();
  line(`- Title: "${p.title}"${p.author ? ` by ${p.author}` : ""}.`);
  const genre = isGenre(p.genre) ? p.genre : DEFAULT_GENRE;
  line(`- Genre: ${coreEn.genres[genre].name} (\`${genre}\`): ${coreEn.genres[genre].text}${genreAvailable(genre) ? " Willy Maker's play mode and the prototype's engine are this genre." : " Willy Maker has no engine for this genre yet (docs/willy-maker/genres.md in the repository is the plan); build it as a new engine, not on the platform shooter's rules."}`);
  line(`- Board: ${board.name}, layout \`${layout.id}\` (${layout.players} players × ${layout.buttons} buttons). Players: ${s.players}.`);
  line(`- Levels, in play order: ${levels.length}.`);
  levels.forEach((l, i) => {
    const sections = l.sections?.length ? `; sections: ${l.sections.map((x) => `${x.name} (x ${x.x0}-${x.x1})`).join(", ")}` : "";
    line(`  ${i + 1}. "${l.name}" (\`${l.id}\`, ${l.size.w} × ${l.size.h} px, camera ${l.camera.forwardOnly ? "forward only" : "free"} with a ${l.camera.backtrack} px margin back${sections}): levels/${safe(l.id)}.tmj`);
  });
  if (p.characters.length) {
    line(`- Characters: ${p.characters.length}.`);
    for (const ch of p.characters) {
      const anims = Object.entries(ch.anims ?? {})
        .map(([n, a]) => `${n} ${a.frames.length}f @${a.fps} fps${a.loop ? " loop" : ""}`)
        .join(", ");
      line(`  - ${ch.name} (\`${ch.id}\`, ${ch.role}, ${ch.height} px tall): ${anims || "no animations"}. characters/${safe(ch.id)}/`);
    }
  } else line("- Characters: none of its own. Use the prototype's Willy (rom/tools/art.mjs) for every player, with a different shirt per player.");
  line(`- Buttons (Run is a double tap of the stick toward a side, within ${R.RUN_TAP_FRAMES} frames):`);
  for (const slot of ["b1", "b2", "b3"]) {
    const v = b[slot];
    if (!v) continue;
    const n = slot.slice(1);
    if (v === "b1+b2") {
      const used = new Set([b.b1, b.b2]);
      const left = ["jump", "fire", "special"].find((a) => !used.has(a)) ?? "special";
      line(`  - Buttons 1 + 2 together: ${actionText[left] ?? left}`);
    } else if (Number(n) <= layout.buttons) line(`  - Button ${n}: ${actionText[v] ?? v}`);
  }
  line("  - Start and Coin: join and credit, like any arcade board. go-link maps the RetroPad B, A, Y to buttons 1, 2, 3 on every seat.");
  const d = s.dip;
  line(`- DIP switches (the slammast board keeps them in EEPROM): difficulty ${d.difficulty}, ${d.lives} lives, free play ${d.freePlay ? "on" : "off"}, demo sound ${d.demoSound ? "on" : "off"}.`);
  const menus = Object.entries((s.menus ?? {}) as unknown as Record<string, { blocks?: unknown[] } | undefined>)
    .map(([k, m]) => `${k}${Array.isArray(m?.blocks) && m.blocks.length ? ` (${m.blocks.length} blocks)` : ""}`)
    .join(", ");
  line(`- Menus: ${menus || "none"}. Their blocks are in project.json (settings.menus); an empty screen gets a plain default with the 8 × 8 font.`);
  line();

  line("## Rules the engine keeps");
  line();
  line("The numbers of Willy Maker's play mode (its engine/rules.ts) with this game's Rules card applied. Vertical speeds are in 1/16 px per frame, like the 68000 code.");
  line();
  line("| Rule | Value |");
  line("|---|---|");
  const rows: [string, string][] = [
    ["Screen, frame rate", `${R.SCREEN_W} × ${R.SCREEN_H}, ${Math.round(1000 / R.FRAME_MS)} frames per second`],
    ["Collision grid", `${R.CELL} px`],
    ["Player body", `${R.BODY_H} px tall, ${R.HALF_W} px half width at the feet`],
    ["Gravity", `${R.GRAVITY}/16 px per frame, per frame`],
    ["Jump", `start speed ${R.JUMP_VY}/16 px per frame (peaks at 61.9 px: a ledge 48 px up is reachable, 64 px is not)`],
    ["Fastest fall", `${R.MAX_FALL}/16 px per frame`],
    ["Ladders", `${R.CLIMB_SPEED}/16 px per frame (up and down on the stick)`],
    ["Climbing a 32 px crate", G.crateClimb === "push" ? `walking into an edge up to ${R.STEP_UP} px climbs it after ${R.PUSH_FRAMES} frames` : "only by jumping: walking into it does nothing"],
    ["Run", `a second tap toward the same side within ${R.RUN_TAP_FRAMES} frames`],
    ["Drop through a one-way ledge", `down + jump, for ${R.DROP_FRAMES} frames`],
    ["Camera", `moves forward; goes back at most ${R.BACKTRACK} px from the farthest point reached`],
    ["Machine gun", `${R.SHOTS_PER_PLAYER} shots per player on screen, speed ${R.SHOT_SPEED} px per frame, one every ${R.FIRE_EVERY} frames`],
    ["Knife", `${R.KNIFE_FRAMES} frames, reach ${R.KNIFE_REACH} px`],
    ["Bazooka", `${R.BAZOOKA_AMMO} rockets, ${R.BAZOOKA_FRAMES} frames each`],
    ["Enemies", `${G.enemyHp} hits unless the object gives its own; ${G.enemiesChase ? `chase a player on their floor within ${R.ENEMY_SIGHT} px` : "keep their patrol and turn at its ends"}; ${G.enemiesShoot ? `fire every ${R.ENEMY_FIRE_EVERY} frames at ${R.ENEMY_SHOT_SPEED} px per frame` : "never shoot"}; touching one ${G.touchHurts ? "hurts" : "does not hurt"}`],
    ["Crates and breakable walls", `${R.CRATE_HP} and ${R.BREAKABLE_HP} hits (a rocket counts 9, a knife 2); a crate whose object says breakable: false never breaks from shots; crates resting on a broken crate with nothing else under them break too`],
    ["Lives", `${R.LIVES} by default (the DIP switch above wins); after a hit the player ${G.respawnOnHurt ? "comes back near the camera's left side" : "blinks in place"} and cannot be hurt for ${G.hurtFrames} frames`],
    ["Score", `crate ${G.crateScore}, enemy ${G.enemyScore}, rescued civilian ${G.rescueScore}`],
    ["The exit", `${G.exitNeedsEnemies ? "clears the level only with every enemy down; reaching it earlier shows a message (DEFEAT EVERY ENEMY) and the HUD shows ENEMY n, the enemies left" : "clears the level when a player reaches it"}; a door is drawn on it`],
    ["Start on a port past the game's players", G.extraPorts === "soon" ? "shows \"3P COMING SOON\" (or 4P) for 2 s; no credit is taken" : "does nothing; no credit is taken"],
    ["Opposite directions", "left with right, or up with down, held together count as neither (the core delivers them so)"],
  ];
  for (const [k, v] of rows) line(`| ${k} | ${v} |`);
  line();

  line("## Board limits");
  line();
  line(`- ${board.palettes.sprite} sprite palettes, ${board.palettes.play} for the play layer (scroll2, 16 px tiles) and ${board.palettes.far} for the far layer (scroll3, 32 px tiles); the HUD and text use scroll1 (8 px tiles).`);
  line(`- ${board.colors.perPalette} colors plus transparency per palette, per 16 × 16 tile or sprite zone. Colors are 12-bit: every channel a multiple of 17.`);
  line(`- Graphics ROM ${board.rom.graphicsBytes / 1048576} MB, program ROM ${board.rom.programBytes / 1048576} MB, ${board.sprites.perScreen} sprite table entries.`);
  line("- What this game uses now:");
  for (const m of board.meters(p)) line(`  - ${m.id}: ${m.unit === "bytes" ? `${(m.used / 1048576).toFixed(2)} of ${(m.max / 1048576).toFixed(0)} MB` : `${m.used} of ${m.max}`}`);
  line();

  line("## What is in this pack");
  line();
  line("```");
  line("PROMPT.md                 this brief");
  line("project.json              the Willy Maker project (format in docs/willy-maker/file-format.md of the repository)");
  line("review.json               Willy Maker's checks at export (below)");
  line("levels/<id>.tmj           Tiled maps: far (image), play, collision and objects layers");
  line("levels/<id>/far.png       the far layer (and the middle one merged in) as one picture");
  line("levels/<id>/play.png      the play layer as one picture");
  line("levels/<id>/collision.png the collision tags in the colors of docs/art-spec.md, on the 16 px grid");
  line("tilesets/<id>.png         each tileset, in board colors; tilesets/collision.png the tag tiles");
  line("characters/<id>/<anim>.png one strip per animation on magenta #FF00FF, feet on one line");
  line("characters/<id>/sheet.json frames (boxes in the strip), pivots, palette zones, fps, loop");
  line("docs/                     rom-README.md, art-spec.md, hardware.md, story.md, journal.md");
  line("```");
  line();
  line(`Collision tags: ${TAGS.slice(1).join(", ")} (air is empty). Objects have unique names and the types and properties of docs/art-spec.md section 4. Every picture is already in board colors; transparency is alpha 0 (strips use magenta).`);
  if (notes.missingPictures?.length) line(`Pictures that were not in this browser and are missing from the pack: ${notes.missingPictures.join(", ")}. A missing tileset is a transparent picture of the right size, so the maps still open.`);
  line();

  line("## Willy Maker's checks at export");
  line();
  const listed = review.checks.filter((c) => c.severity !== "ok");
  line(review.ready ? `Ready: no errors, ${review.warnings} warning${review.warnings === 1 ? "" : "s"}.` : `${review.errors} error${review.errors === 1 ? "" : "s"}: fix them in Willy Maker before building.`);
  for (const c of listed) line(`- ${c.severity}: ${checkText(exportEn, c)}`);
  const passed = review.checks.filter((c) => c.severity === "ok");
  if (passed.length) line(`- Passed: ${passed.map((c) => checkText(exportEn, c)).join("; ")}.`);
  line();

  line("## Build it");
  line();
  line("1. Tools (macOS with Homebrew, as in docs/journal.md; Linux has the same packages): the m68k-elf cross compiler, binutils and z80asm, and **Node 22.18 or newer** (rom/tools imports TypeScript from frontend/packages/cps1).");
  line("   ```sh");
  line("   brew install m68k-elf-binutils m68k-elf-gcc z80asm");
  line("   ```");
  line(`2. Build the prototype once, to prove the toolchain: \`node rom/tools/build.mjs${layout.id === "slammast" ? "" : ` ${layout.id}`}\` writes rom/build/${layout.id}.zip.`);
  line("3. Extend rom/tools/build.mjs (art.mjs, level.mjs and rom/src/main.c) to read this pack instead of the prototype's level: the maps and collision from levels/*.tmj, the tiles cut from the layer pictures (deduplicated, 15 colors per tile), the characters from their strips and sheet.json, the objects with their properties, the buttons, players and DIP switches above.");
  line("4. Get the core the device uses (`device core download`), build the frame capture tool and run the set in it:");
  line("   ```sh");
  line("   (cd backend-device && go build -o /tmp/framelab ./cmd/framelab)");
  line(`   /tmp/framelab capture -log -core ~/go-link/cores/mame2003_plus_libretro.dylib -rom rom/build/${layout.id}.zip -out /tmp/rom-run -frames 860 -script "60-63:coin 110-113:start 140-400:right"`);
  line("   ```");
  line("   (The core is a .so on Linux.) The core's log must have no \"WRONG CHECKSUMS\", \"NOT FOUND\" or \"INCORRECT LENGTH\" line.");
  line(`5. Play it in a real go-link room: \`node rom/tools/room-test.mjs${layout.id === "slammast" ? "" : ` ${layout.id}`}\` (it needs the signalhub repository next to go-link).`);
  line();

  line("## Task");
  line();
  line(`Produce the ROM set (${layout.id}.zip) with rom/tools/build.mjs extended to read this pack. Keep within the budgets above and the rules of docs/hardware.md (watch its pitfalls: sprites wrap at 512 px, write board registers with plain stores). Test it with framelab and in a go-link room, and report what you changed and anything that needs a decision.`);
  line();
  return L.join("\n");
}

/** The review as review.json carries it (messages in English). */
export function reviewJson(p: Project, review: Review): string {
  const layout = layoutOf(p);
  return JSON.stringify(
    {
      format: 1,
      project: p.id,
      board: p.board.id,
      layout: layout.id,
      ready: review.ready,
      errors: review.errors,
      warnings: review.warnings,
      checks: review.checks.map((c) => ({ id: c.id, severity: c.severity, message: checkText(exportEn, c), params: c.params, ...(c.target ? { target: c.target } : {}), ...(c.fix ? { fix: c.fix } : {}) })),
    },
    null,
    2,
  );
}

/**
 * Builds the AI pack. Throws when the review has errors (they block it),
 * and a PackBuildError when the finished pack fails its build check.
 */
export async function buildAiPack(p: Project, opts: AiPackOptions): Promise<AiPack> {
  if (!opts.review.ready) throw new Error(`the review has ${opts.review.errors} error(s)`);
  const enc = new TextEncoder();
  const load = opts.loadAsset ?? (async (ref: string) => getAsset(ref));
  const decode = opts.decode ?? canvasDecode;
  const docs = opts.docs ?? (await loadRomDocs());
  const missing: string[] = [];
  const pictures = new Map<string, RgbaImage | null>();
  const picture = async (ref: AssetRef | null | undefined, what: string): Promise<RgbaImage | null> => {
    if (!ref) return null;
    if (pictures.has(ref)) return pictures.get(ref)!;
    let img: RgbaImage | null = null;
    const a = await load(ref);
    if (a) {
      try {
        img = a.type === "image/png" || (a.bytes[0] === 0x89 && a.bytes[1] === 0x50) ? await decodePng(a.bytes).catch(() => decode(a.bytes, a.type)) : await decode(a.bytes, a.type);
      } catch {
        img = null;
      }
    }
    if (!img) missing.push(what);
    pictures.set(ref, img);
    return img;
  };
  const files = new Map<string, Uint8Array>();
  const png = (name: string, img: RgbaImage) => files.set(name, encodePng(img.w, img.h, img.data));

  // tilesets, in board colors
  const tilesetImages = new Map<string, RgbaImage>();
  for (const ts of p.tilesets) {
    let img = await picture(ts.image, `tileset ${ts.id}`);
    if (!img) {
      // a blank picture of the right size keeps the maps whole (PROMPT.md lists it as missing)
      const columns = Math.max(1, Number(ts.columns) || 8);
      const rows = Math.max(1, Math.ceil((Number(ts.count) || 1) / columns));
      img = { w: columns * ts.tile, h: rows * ts.tile, data: new Uint8Array(columns * ts.tile * rows * ts.tile * 4) };
    }
    const board = toBoard(img);
    tilesetImages.set(ts.id, board);
    png(`tilesets/${safe(ts.id)}.png`, board);
  }
  png("tilesets/collision.png", collisionTileset());

  // levels
  for (const level of p.levels) {
    const dir = `levels/${safe(level.id)}`;
    const tiles = level.layers.filter((l): l is TileLayer => l.kind === "tiles");
    const tilesetOf = (l: TileLayer) => p.tilesets.find((t) => t.id === l.tileset) ?? p.tilesets.find((t) => t.tile === l.grid);
    const draw = (layers: TileLayer[]) => {
      const img: RgbaImage = { w: level.size.w, h: level.size.h, data: new Uint8Array(level.size.w * level.size.h * 4) };
      let any = false;
      for (const l of layers) {
        const ts = tilesetOf(l);
        const src = ts ? tilesetImages.get(ts.id) : undefined;
        if (ts && src && drawTiles(img, level, l, ts, src)) any = true;
      }
      return any ? img : null;
    };
    const far = draw(tiles.filter((l) => l.id === "far" || l.id === "mid"));
    if (far) png(`${dir}/far.png`, far);
    const play = playLayer(level);
    const playImg = play ? draw([play]) : null;
    if (playImg) png(`${dir}/play.png`, playImg);
    const text = tiles.find((l) => l.id === "text");
    const textImg = text ? draw([text]) : null;
    if (textImg) png(`${dir}/text.png`, textImg);
    png(`${dir}/collision.png`, collisionPicture(level));
    const ts = play ? tilesetOf(play) : undefined;
    const tsImg = ts ? tilesetImages.get(ts.id) : undefined;
    const map = levelToTiled(level, p, {
      farImage: far ? `${safe(level.id)}/far.png` : null,
      playTileset: ts && tsImg ? { path: `../tilesets/${safe(ts.id)}.png`, w: tsImg.w, h: tsImg.h } : null,
      collisionTileset: "../tilesets/collision.png",
    });
    files.set(`${dir}.tmj`, enc.encode(JSON.stringify(map, null, 1)));
  }

  // characters: a strip per animation and the sheet
  for (const ch of p.characters) {
    const dir = `characters/${safe(ch.id)}`;
    const atlas = await picture(ch.sheet, `character ${ch.name || ch.id}`);
    const board = atlas ? toBoard(atlas) : null;
    const anims: Record<string, unknown> = {};
    for (const [name, anim] of Object.entries(ch.anims ?? {})) {
      const entry: Record<string, unknown> = { fps: anim.fps, loop: anim.loop, frames: anim.frames };
      if (board && anim.frames.length) {
        const strip = animStrip(ch, anim.frames, board);
        png(`${dir}/${safe(name)}.png`, strip.img);
        entry.file = `${safe(name)}.png`;
        entry.frames = strip.frames;
      }
      anims[name] = entry;
    }
    const needs = REQUIRED_ANIMS[ch.role] ?? ["idle"];
    const sheet = {
      id: ch.id,
      name: ch.name,
      role: ch.role,
      height: ch.height,
      background: "#FF00FF",
      picture: board ? "strips" : null,
      required: needs,
      swapColors: ch.swapColors,
      palettes: [...new Set(ch.frames.flatMap((f) => f.zones ?? []))].map((id) => p.palettes.find((x) => x.id === id) ?? { id, missing: true }),
      anims,
    };
    files.set(`${dir}/sheet.json`, enc.encode(JSON.stringify(sheet, null, 2)));
  }

  for (const [name, text] of Object.entries(docs)) files.set(`docs/${name}`, enc.encode(text));
  files.set("project.json", enc.encode(JSON.stringify(p, null, 2)));
  files.set("review.json", enc.encode(reviewJson(p, opts.review)));
  const prompt = buildPrompt(p, opts.review, { missingPictures: missing });

  const names = [...files.keys()].sort();
  const entries: ZipEntry[] = [{ name: "PROMPT.md", data: enc.encode(prompt) }, ...names.map((name) => ({ name, data: files.get(name)! }))];
  const zip = await writeZip(entries, { date: PACK_DATE });
  // level 2: the pack, read back from its own zip, must be what the prompt promises
  if (!opts.skipCheck) {
    const problems = await checkAiPack(await readZip(zip));
    if (problems.length) throw new PackBuildError(problems);
  }
  return { zip, prompt, files: entries.map((e) => e.name) };
}
