// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Experiment 1's simulator runner (docs/experiments/harness.md): powers a
// ROM set on the CPS-1 board model and plays it with an input script or an
// external player, recording the lab state of every frame, PNG frames and
// an MP4. Deterministic: the same zip, script and player answers give the
// same frames.
//
//   node rom/tools/lab/run.mjs ZIP --out DIR --script FILE.json [options]
//   node rom/tools/lab/run.mjs ZIP --out DIR --player "COMMAND" [options]
//
// Options:
//   --frames N          frames to run (script: its "frames", else 3600)
//   --checkpoints LIST  frames to save as PNG (and state), e.g. 300,600
//                       (script: its "checkpoints")
//   --png-every K       also save every K-th frame as PNG
//   --mp4               render every frame into DIR/run.mp4 (ffmpeg)
//   --scale S           MP4 scale, nearest neighbour (default 2)
//   --every N           player: frames per decision (default 6, at least 4)
//   --player-port P     player: the port it plays (default 1)
//   --timeout-ms MS     player: the longest wait for one answer (default 120000)
//   --after-clear N     player: frames to keep running after the section clears (120)
//   --symbols FILE      the symbol map (default: <set>.symbols.json next to the zip)
//   --quiet             no progress lines
//
// Outputs in DIR: state.jsonl (one line per frame), inputs.json (what was
// pressed, as a script: replays the run anywhere, the real core included),
// frames/fNNNNNN.png, decisions.jsonl and player.log (player runs),
// summary.json and run.mp4.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { InputRecorder, Machine, SCREEN_H, SCREEN_W, formatScript, publicLab, readScript, scriptPorts, CELLS } from "./lab.mjs";
import { writePng } from "../png.mjs";

export const ACTIONS = ["right", "left", "jump", "run_right", "fire", "climb_up", "climb_down", "drop", "wait"];
const FFMPEG = process.env.FFMPEG || (fs.existsSync("/usr/local/bin/ffmpeg") ? "/usr/local/bin/ffmpeg" : "ffmpeg");
/** The player's prelude: Coin then 1P Start (the validator's frames). */
const PRELUDE = { coin: 120, start: 150, hold: 6, giveUp: 900 };

function parseArgs(argv) {
  const o = { zip: null, png: [], every: 6, port: 1, timeoutMs: 120000, afterClear: 120, scale: 2 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--out") o.out = v();
    else if (a === "--script") o.script = v();
    else if (a === "--player") o.player = v();
    else if (a === "--frames") o.frames = Number(v());
    else if (a === "--checkpoints") o.checkpoints = v().split(",").filter(Boolean).map(Number);
    else if (a === "--png-every") o.pngEvery = Number(v());
    else if (a === "--mp4") o.mp4 = true;
    else if (a === "--scale") o.scale = Number(v());
    else if (a === "--every") o.every = Number(v());
    else if (a === "--player-port") o.port = Number(v());
    else if (a === "--timeout-ms") o.timeoutMs = Number(v());
    else if (a === "--after-clear") o.afterClear = Number(v());
    else if (a === "--symbols") o.symbols = v();
    else if (a === "--quiet") o.quiet = true;
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    else o.zip = a;
  }
  if (!o.zip || !o.out || !!o.script === !!o.player) throw new Error("usage: run.mjs ZIP --out DIR (--script FILE | --player COMMAND) [options]; see the header");
  if (o.every < 4) throw new Error("--every must be at least 4 frames");
  if (![1, 2, 3, 4].includes(o.port)) throw new Error("--player-port must be 1-4");
  return o;
}

/** The buttons of the k-th frame of a decision window for one action. */
export function actionButtons(action, k, n, { facing = 1, last = null } = {}) {
  const fwd = facing < 0 ? "left" : "right";
  switch (action) {
    case "right":
      return ["right"];
    case "left":
      return ["left"];
    case "jump": // a forward jump: button 1 pressed, the stick toward the facing side
      return k < 3 ? ["b1", fwd] : [fwd];
    case "run_right": // a double tap (right, release, right), or keep holding when already running
      if (last === "run_right") return ["right"];
      return k === 2 ? [] : ["right"];
    case "fire": // released on the window's last frame so the next fire is a new press
      return k < n - 1 ? ["b2"] : [];
    case "climb_up":
      return ["up"];
    case "climb_down":
      return ["down"];
    case "drop": // down + button 1
      return k >= 1 && k <= 2 ? ["down", "b1"] : ["down"];
    case "wait":
      return [];
    default:
      throw new Error(`unknown action ${action}`);
  }
}

/** The collision map as text rows (CELLS: . # = H C). */
export function mapText(col) {
  const rows = [];
  for (let r = 0; r < col.rows; r++) rows.push(col.cells.slice(r * col.cols, (r + 1) * col.cols).map((c) => CELLS[c] ?? "?").join(""));
  return rows;
}

class Player {
  constructor(cmd, out, timeoutMs) {
    this.log = fs.openSync(path.join(out, "player.log"), "w");
    this.proc = spawn("/bin/sh", ["-c", cmd], { stdio: ["pipe", "pipe", this.log] });
    this.timeoutMs = timeoutMs;
    this.lines = [];
    this.waiting = null;
    this.exited = null;
    readline.createInterface({ input: this.proc.stdout }).on("line", (l) => {
      if (!l.trim()) return;
      if (this.waiting) {
        const w = this.waiting;
        this.waiting = null;
        w.resolve(l);
      } else this.lines.push(l);
    });
    this.proc.on("exit", (code, sig) => {
      this.exited = `the player exited (code ${code}${sig ? `, signal ${sig}` : ""}); see player.log`;
      if (this.waiting) this.waiting.reject(new Error(this.exited));
    });
    this.proc.stdin.on("error", () => {});
  }

  send(msg) {
    if (this.exited) throw new Error(this.exited);
    this.proc.stdin.write(JSON.stringify(msg) + "\n");
  }

  async ask(msg) {
    this.send(msg);
    const line = this.lines.length
      ? this.lines.shift()
      : await new Promise((resolve, reject) => {
          // each wait has its own timer, cleared with the answer (a timer
          // left from an earlier wait once cancelled a later one)
          const w = {
            resolve: (l) => {
              clearTimeout(timer);
              resolve(l);
            },
            reject: (e) => {
              clearTimeout(timer);
              reject(e);
            },
          };
          const timer = setTimeout(() => {
            if (this.waiting === w) {
              this.waiting = null;
              reject(new Error(`the player did not answer within ${this.timeoutMs} ms`));
            }
          }, this.timeoutMs);
          this.waiting = w;
        });
    let ans;
    try {
      ans = JSON.parse(line);
    } catch {
      throw new Error(`the player answered something that is not JSON: ${line.slice(0, 200)}`);
    }
    if (ans.error) throw new Error(`the player failed: ${ans.error}`);
    if (!ACTIONS.includes(ans.action)) throw new Error(`the player answered an action outside the list: ${JSON.stringify(ans.action)}`);
    return ans;
  }

  async close(summary) {
    try {
      this.send({ type: "end", summary });
      this.proc.stdin.end();
    } catch {
      /* already gone */
    }
    if (!this.exited) await Promise.race([new Promise((r) => this.proc.on("exit", r)), new Promise((r) => setTimeout(r, 5000).unref())]);
    if (!this.exited) this.proc.kill("SIGKILL");
    fs.closeSync(this.log);
  }
}

class Video {
  constructor(file, scale) {
    this.file = file;
    this.proc = spawn(FFMPEG, ["-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${SCREEN_W}x${SCREEN_H}`, "-r", "60", "-i", "-", "-vf", `scale=${SCREEN_W * scale}:${SCREEN_H * scale}:flags=neighbor`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", file], { stdio: ["pipe", "inherit", "inherit"] });
    this.done = new Promise((resolve, reject) => {
      this.proc.on("error", reject);
      this.proc.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${c}`))));
    });
  }

  async write(rgba) {
    if (!this.proc.stdin.write(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength))) await new Promise((r) => this.proc.stdin.once("drain", r));
  }

  async end() {
    this.proc.stdin.end();
    await this.done;
  }
}

/**
 * One expectation of a script: { frame, path: "players.0.x", equals | min | max }
 * on the lab state after that frame (path "" is the whole state).
 */
export function checkExpect(x, lab, text = []) {
  // {"text": "RESCUED"} or {"noText": "INSERT COIN"}, optionally on one "row": what the screen shows
  if ("text" in x || "noText" in x) {
    const shown = x.row !== undefined ? (text[x.row] ?? "") : text.join("\n");
    // double-size text reads "C O N T I N U E", so a text also matches with the spaces left out
    const has = (t) => shown.includes(t) || shown.replace(/ /g, "").includes(String(t).replace(/ /g, ""));
    const ok = ("text" in x ? has(x.text) : true) && ("noText" in x ? !has(x.noText) : true);
    return { ...x, ok, got: x.row !== undefined ? shown : text.filter(Boolean) };
  }
  let v = lab;
  for (const k of String(x.path ?? "").split(".").filter(Boolean)) v = v?.[k];
  let ok = v !== undefined;
  if ("equals" in x) ok &&= JSON.stringify(v) === JSON.stringify(x.equals);
  if ("min" in x) ok &&= v >= x.min;
  if ("max" in x) ok &&= v <= x.max;
  return { ...x, ok, got: v === undefined ? null : v };
}

const names = (ports) =>
  ports
    .map((s, i) => (s.size ? `${[...s].sort().join("+")}@${i + 1}` : ""))
    .filter(Boolean)
    .join(" ");

export async function run(o) {
  const started = Date.now();
  fs.mkdirSync(path.join(o.out, "frames"), { recursive: true });
  const script = o.script ? readScript(o.script) : null;
  const total = o.frames ?? script?.frames ?? 3600;
  const checkpoints = new Set(o.checkpoints ?? script?.checkpoints ?? []);
  const m = await Machine.open(o.zip, { symbols: o.symbols });
  const stateOut = fs.createWriteStream(path.join(o.out, "state.jsonl"));
  const decOut = o.player ? fs.createWriteStream(path.join(o.out, "decisions.jsonl")) : null;
  const video = o.mp4 ? new Video(path.join(o.out, "run.mp4"), o.scale) : null;
  const rec = new InputRecorder();
  const player = o.player ? new Player(o.player, o.out, o.timeoutMs) : null;
  const sum = {
    zip: path.resolve(o.zip),
    set: m.set.id,
    kind: script ? "script" : "player",
    script: o.script ? path.resolve(o.script) : null,
    player: o.player ?? null,
    labState: null,
    frames: 0,
    cleared: false,
    clearFrame: null,
    gameOver: false,
    gameOverFrame: null,
    startFrame: null,
    checkpoints: [],
    decisions: 0,
    thinkMs: { total: 0, max: 0 },
    actions: {},
    energyLost: 0,
    falls: 0,
    expect: [],
    error: null,
  };
  const expects = script?.expect ?? [];
  if (player) player.send({ type: "hello", protocol: 1, set: m.set.id, actions: ACTIONS, every: o.every, port: o.port, screen: { w: SCREEN_W, h: SCREEN_H } });

  let lab = null;
  let action = "wait";
  let lastAction = null;
  let windowAt = 0;
  let sentMap = null;
  let stopAt = total;
  let prevPl = null;
  try {
    for (let f = 0; f < stopAt; f++) {
      let ports;
      if (script) ports = scriptPorts(script, f);
      else {
        ports = [new Set(), new Set(), new Set(), new Set()];
        if (lab?.mode !== "playing") {
          // the prelude: Coin and Start on the player's port
          if (f >= PRELUDE.coin && f < PRELUDE.coin + PRELUDE.hold) ports[o.port - 1].add("coin");
          if (f >= PRELUDE.start && f < PRELUDE.start + PRELUDE.hold) ports[o.port - 1].add("start");
          if (f >= PRELUDE.giveUp && sum.startFrame === null) throw new Error(`the game did not start by frame ${PRELUDE.giveUp} (lab mode: ${lab?.mode ?? "none"})`);
          windowAt = f + 1; // the first playing frame asks the player
        } else {
          if (f === windowAt) {
            const me = lab.players[o.port - 1];
            const msg = { type: "state", frame: f, port: o.port, last_action: sum.decisions ? action : null, lab: publicLab(lab) };
            const col = m.collision(lab);
            if (col) {
              const text = mapText(col);
              const key = text.join("\n");
              if (key !== sentMap) {
                msg.map = { cols: col.cols, rows: col.rows, cell: 16, legend: { ".": "empty", "#": "solid", "=": "one-way ledge", H: "ladder", C: "crate (solid, breakable)" }, rows_text: text };
                sentMap = key;
              }
            }
            const t0 = performance.now();
            const ans = await player.ask(msg);
            const dt = performance.now() - t0;
            sum.decisions++;
            sum.thinkMs.total += dt;
            sum.thinkMs.max = Math.max(sum.thinkMs.max, dt);
            sum.actions[ans.action] = (sum.actions[ans.action] ?? 0) + 1;
            lastAction = action;
            action = ans.action;
            decOut.write(JSON.stringify({ frame: f, ms: Math.round(dt), x: me?.x, y: me?.y, ...ans }) + "\n");
            windowAt = f + o.every;
          }
          const k = f - (windowAt - o.every);
          for (const b of actionButtons(action, k, o.every, { facing: lab.players[o.port - 1]?.facing ?? 1, last: lastAction })) ports[o.port - 1].add(b);
        }
      }
      rec.add(f, ports);
      m.step(ports);
      const ram = m.wramBytes();
      lab = m.lab(ram);
      if (lab && !sum.labState) sum.labState = { from: m.labFrom, address: `0x${m.labAddr.toString(16)}` };
      const n = m.frame; // frames run so far: this frame's number in every output
      stateOut.write(JSON.stringify({ f: n, in: names(ports), lab: publicLab(lab) }) + "\n");
      if (lab) {
        if (lab.mode === "playing" && sum.startFrame === null) sum.startFrame = n;
        if (lab.sectionClear && !sum.cleared) {
          sum.cleared = true;
          sum.clearFrame = n;
          if (player) stopAt = Math.min(stopAt, f + 1 + o.afterClear);
        }
        if (lab.mode === "game_over" && !sum.gameOver) {
          sum.gameOver = true;
          sum.gameOverFrame = n;
          if (player) stopAt = Math.min(stopAt, f + 61);
        }
        if (prevPl)
          lab.players.forEach((p, i) => {
            const q = prevPl[i];
            if (p.active && q.active) {
              if (p.energy < q.energy) sum.energyLost += q.energy - p.energy;
              if (q.y - p.y > 64 && p.ground) sum.falls++; // put back far above: a fall out of the map
            }
          });
        prevPl = lab.players;
      }
      const textNow = expects.some((x) => x.frame === n && ("text" in x || "noText" in x)) || checkpoints.has(n) ? m.text() : null;
      for (const x of expects) if (x.frame === n) sum.expect.push(checkExpect(x, lab, textNow ?? []));
      const wantPng = checkpoints.has(n) || (o.pngEvery && n % o.pngEvery === 0);
      if (wantPng || video) {
        const rgba = m.screen();
        if (wantPng) {
          const file = path.join(o.out, "frames", `f${String(n).padStart(6, "0")}.png`);
          writePng(file, SCREEN_W, SCREEN_H, rgba);
          if (checkpoints.has(n)) sum.checkpoints.push({ frame: n, png: path.relative(o.out, file), lab: publicLab(lab), text: textNow });
        }
        if (video) await video.write(rgba);
      } else m.keepSprites();
      sum.frames = n;
      if (!o.quiet && n % 600 === 0) process.stderr.write(`frame ${n}: ${lab?.mode ?? "no lab state"}${lab ? `, P1 x ${lab.players[0].x} y ${lab.players[0].y}` : ""}\n`);
    }
  } catch (e) {
    sum.error = e.message;
  }
  const final = lab ? publicLab(lab) : null;
  sum.final = final && {
    mode: final.mode,
    scores: final.players.map((p) => p.score),
    rescued: final.civilians.filter((c) => c.rescued).length,
    civilians: final.civilians.length,
    enemiesDown: final.enemies.filter((e) => !e.alive).length,
    enemies: final.enemies.length,
    p1: { x: final.players[0].x, y: final.players[0].y, energy: final.players[0].energy },
  };
  for (const x of expects) if (x.frame > sum.frames) sum.expect.push({ ...x, ok: false, got: `the run ended at frame ${sum.frames}` });
  sum.expectOk = sum.expect.every((x) => x.ok);
  if (!sum.expectOk && !sum.error) sum.error = `${sum.expect.filter((x) => !x.ok).length} expectation(s) failed`;
  sum.thinkMs.mean = sum.decisions ? Math.round(sum.thinkMs.total / sum.decisions) : 0;
  sum.thinkMs.total = Math.round(sum.thinkMs.total);
  sum.thinkMs.max = Math.round(sum.thinkMs.max);
  sum.wallMs = Date.now() - started;
  await new Promise((r) => stateOut.end(r));
  if (decOut) await new Promise((r) => decOut.end(r));
  if (player) await player.close({ cleared: sum.cleared, frames: sum.frames, error: sum.error });
  fs.writeFileSync(path.join(o.out, "inputs.json"), formatScript(rec.finish({ name: `inputs of ${sum.kind} run`, frames: sum.frames, checkpoints: [...checkpoints].sort((a, b) => a - b) })));
  if (video) {
    try {
      await video.end();
      sum.mp4 = "run.mp4";
    } catch (e) {
      sum.error ??= e.message;
    }
  }
  fs.writeFileSync(path.join(o.out, "summary.json"), JSON.stringify(sum, null, 2) + "\n");
  return sum;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  const sum = await run(o);
  const { checkpoints, ...short } = sum;
  console.log(JSON.stringify({ ...short, checkpoints: checkpoints.map((c) => c.frame) }, null, 2));
  process.exit(sum.error ? 1 : 0);
}
