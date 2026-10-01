// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Writes the device's list of go-link-made ROM sets: for each built set,
// the SHA-256 and size of every file inside the zip (never the zip's own
// hash: its entry timestamps change on every build), plus the title,
// description, controls and picture the library shows instead of the
// original set's. The device embeds the list (backend-device/pkg/ownsets)
// and only trusts a zip whose files all match it, never a name.
//
//   node rom/tools/ownsets.mjs [set...]   (default: slammast)
//
// build.mjs runs it after every build, so the list always matches the
// last build. Commit backend-device/pkg/ownsets/ together with the ROM
// that ships (see docs/rom/README.md, "Releasing the set").

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(ROOT, "..");
const PKG = path.join(REPO, "backend-device", "pkg", "ownsets");
const LIST = path.join(PKG, "sets.json");

const DESCRIPTION =
  "go-link's own arcade game: a side-scrolling run-and-gun for up to four players. Willy Gorklingo runs, jumps, climbs and rescues civilians across the rooftops of Buenos Aires. A prototype made by go-link, every byte original.";

// Our games, by the layout of the core's set they are built as.
export const GAMES = {
  slammast: {
    id: "willy-proto",
    title: "Willy Gorklingo: The Lag Protocol (prototype)",
    description: DESCRIPTION,
    year: "2026",
    maker: "go-link",
    players: 4,
    buttons: 3,
    control: "joy8way",
    labels: ["Jump", "Fire", "Special"],
    art: { name: "willy-proto.png", from: "docs/rom/images/step4-two-players.png" },
  },
  captcomm: {
    id: "willy-proto-2b",
    title: "Willy Gorklingo: The Lag Protocol (2-button prototype)",
    description: DESCRIPTION,
    year: "2026",
    maker: "go-link",
    players: 4,
    buttons: 2,
    control: "joy8way",
    labels: ["Jump", "Fire"],
    art: { name: "willy-proto.png", from: "docs/rom/images/step4-two-players.png" },
  },
};

/** Reads every file of a zip (stored or deflated) from its central directory. */
export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("damaged zip directory");
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error(`${name}: compression method ${method} is not supported`);
    if (data.length !== size) throw new Error(`${name}: wrong size`);
    files.push({ name: path.basename(name).toLowerCase(), data });
  }
  return files;
}

/** The list entry of one built set. */
export function entryFor(set) {
  const game = GAMES[set];
  if (!game) throw new Error(`${set}: not a go-link game layout (known: ${Object.keys(GAMES).join(", ")})`);
  const zip = path.join(ROOT, "build", `${set}.zip`);
  const files = readZip(fs.readFileSync(zip))
    .map((f) => ({ name: f.name, size: f.data.length, sha256: crypto.createHash("sha256").update(f.data).digest("hex") }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const { art, ...rest } = game;
  return { ...rest, set, art: art?.name ?? "", files };
}

/** Updates sets.json (and the pictures) with the given sets; others stay. */
export function writeOwnSets(sets) {
  let list = { format: 1, sets: [] };
  if (fs.existsSync(LIST)) list = JSON.parse(fs.readFileSync(LIST, "utf8"));
  for (const set of sets) {
    const entry = entryFor(set);
    list.sets = list.sets.filter((s) => s.set !== set);
    list.sets.push(entry);
    const art = GAMES[set].art;
    if (art) {
      fs.mkdirSync(path.join(PKG, "art"), { recursive: true });
      fs.copyFileSync(path.join(REPO, art.from), path.join(PKG, "art", art.name));
    }
  }
  list.sets.sort((a, b) => a.set.localeCompare(b.set));
  const text = JSON.stringify(list, null, 2) + "\n";
  const old = fs.existsSync(LIST) ? fs.readFileSync(LIST, "utf8") : "";
  if (text !== old) fs.writeFileSync(LIST, text);
  for (const set of sets) {
    const e = list.sets.find((s) => s.set === set);
    console.log(`own set list: ${set} (${e.files.length} files)${text === old ? ", unchanged" : ", updated"} -> ${path.relative(REPO, LIST)}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeOwnSets(process.argv.length > 2 ? process.argv.slice(2) : ["slammast"]);
}
