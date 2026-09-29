// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Drives the go-link Player Android app on an emulator or a phone with adb
// and UiAutomator, for e2e/tests/android.spec.ts. Controls are found by
// their Compose test tags (exposed as resource ids) or their text; the
// app's debug build logs its room events and WebRTC counters with the tag
// GoLinkE2E (mobile/android/app/src/debug/.../E2eProbe.kt).

export const PACKAGE = "org.golink.player";

/** The adb binary: ADB, the Android SDK's platform-tools, or the PATH. */
export function adbPath(): string {
  if (process.env.ADB) return process.env.ADB;
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(homedir(), "Library", "Android", "sdk");
  const p = join(sdk, "platform-tools", "adb");
  return existsSync(p) ? p : "adb";
}

/** The attached device's serial (ANDROID_SERIAL wins), or "" when none is ready. */
export function attachedDevice(): string {
  try {
    const out = execFileSync(adbPath(), ["devices"], { encoding: "utf8", timeout: 10_000 });
    const ready = out
      .split("\n")
      .slice(1)
      .map((l) => l.trim().split(/\s+/))
      .filter((f) => f.length >= 2 && f[1] === "device")
      .map((f) => f[0]!);
    if (process.env.ANDROID_SERIAL) return ready.includes(process.env.ANDROID_SERIAL) ? process.env.ANDROID_SERIAL : "";
    return ready[0] ?? "";
  } catch {
    return "";
  }
}

export function adb(...args: string[]): string {
  return execFileSync(adbPath(), args, { encoding: "utf8", timeout: 60_000, maxBuffer: 64 * 1024 * 1024 });
}

export function shell(cmd: string): string {
  return adb("shell", cmd);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One node of a UiAutomator dump. */
export interface UiNode {
  text: string;
  desc: string;
  id: string;
  cls: string;
  checked: boolean;
  enabled: boolean;
  bounds: [number, number, number, number];
}

function attr(tag: string, name: string): string {
  const m = tag.match(new RegExp(` ${name}="([^"]*)"`));
  return m ? decodeEntities(m[1]!) : "";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

/** The screen's accessibility tree, as UiAutomator sees it. */
export function dump(): UiNode[] {
  // uiautomator refuses while the UI is busy animating; try a few times.
  for (let i = 0; i < 5; i++) {
    const r = spawnSync(adbPath(), ["exec-out", "uiautomator", "dump", "/dev/tty"], { encoding: "utf8", timeout: 30_000 });
    const xml = r.stdout ?? "";
    const start = xml.indexOf("<?xml");
    if (start >= 0) {
      const nodes: UiNode[] = [];
      for (const m of xml.slice(start).matchAll(/<node [^>]*>/g)) {
        const tag = m[0];
        const b = attr(tag, "bounds").match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
        nodes.push({
          text: attr(tag, "text"),
          desc: attr(tag, "content-desc"),
          id: attr(tag, "resource-id"),
          cls: attr(tag, "class"),
          checked: attr(tag, "checked") === "true",
          enabled: attr(tag, "enabled") !== "false",
          bounds: b ? [Number(b[1]), Number(b[2]), Number(b[3]), Number(b[4])] : [0, 0, 0, 0],
        });
      }
      return nodes;
    }
    spawnSync("sleep", ["0.5"]);
  }
  return [];
}

export type Match = { id?: string; text?: string | RegExp; desc?: string | RegExp };

function matches(n: UiNode, q: Match): boolean {
  if (q.id !== undefined && n.id !== q.id) return false;
  const test = (v: string, p: string | RegExp) => (typeof p === "string" ? v === p : p.test(v));
  if (q.text !== undefined && !test(n.text, q.text)) return false;
  if (q.desc !== undefined && !test(n.desc, q.desc)) return false;
  return true;
}

export function find(q: Match, nodes = dump()): UiNode | undefined {
  return nodes.find((n) => matches(n, q));
}

/** Waits for a node; throws with what the screen showed on timeout. */
export async function waitFor(q: Match, timeout = 30_000): Promise<UiNode> {
  const end = Date.now() + timeout;
  let last: UiNode[] = [];
  while (Date.now() < end) {
    last = dump();
    const n = last.find((x) => matches(x, q));
    if (n) return n;
    await sleep(700);
  }
  const seen = last
    .filter((n) => n.text || n.desc || n.id)
    .map((n) => [n.id, n.text, n.desc].filter(Boolean).join("|"))
    .join("; ");
  throw new Error(`Android: no node ${JSON.stringify(q, (_, v) => (v instanceof RegExp ? String(v) : v))}; screen: ${seen}`);
}

export async function waitGone(q: Match, timeout = 30_000): Promise<void> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (!find(q)) return;
    await sleep(700);
  }
  throw new Error(`Android: node still shown: ${JSON.stringify(q)}`);
}

export function center(n: UiNode): [number, number] {
  return [Math.round((n.bounds[0] + n.bounds[2]) / 2), Math.round((n.bounds[1] + n.bounds[3]) / 2)];
}

export function tap(n: UiNode | [number, number]) {
  const [x, y] = Array.isArray(n) ? n : center(n);
  shell(`input tap ${x} ${y}`);
}

/** Holds a finger at a point for ms (a swipe that does not move). */
export function hold(at: [number, number], ms: number) {
  shell(`input swipe ${at[0]} ${at[1]} ${at[0]} ${at[1]} ${ms}`);
}

export async function tapOn(q: Match, timeout?: number) {
  const n = await waitFor(q, timeout);
  tap(n);
  return n;
}

/** Types ASCII text into the focused field (spaces as %s, like adb wants). */
export function typeText(text: string) {
  const escaped = text.replace(/ /g, "%s").replace(/([\\"'`$&|;<>()])/g, "\\$1");
  shell(`input text "${escaped}"`);
}

/** Focuses a field, clears it and types. */
export async function fill(q: Match, text: string) {
  const n = await tapOn(q);
  await sleep(300);
  // Select everything and delete (ctrl+a, del), then type.
  shell("input keycombination 113 29");
  shell("input keyevent 67");
  typeText(text);
  await sleep(300);
  return n;
}

export function hideKeyboard() {
  // Back closes the keyboard when it is shown; check first so Back never leaves a screen.
  const out = shell("dumpsys input_method | grep -c 'mInputShown=true' || true").trim();
  if (out !== "0" && out !== "") shell("input keyevent 4");
}

/** Saves a PNG screenshot of the device. */
export function screenshot(file: string) {
  mkdirSync(join(file, ".."), { recursive: true });
  const r = spawnSync(adbPath(), ["exec-out", "screencap", "-p"], { maxBuffer: 64 * 1024 * 1024, timeout: 30_000 });
  writeFileSync(file, r.stdout);
}

/** The screen's raw RGBA pixels. */
export function rawScreen(): { width: number; height: number; px: Buffer } {
  const r = spawnSync(adbPath(), ["exec-out", "screencap"], { maxBuffer: 128 * 1024 * 1024, timeout: 30_000 });
  const b = r.stdout as Buffer;
  const width = b.readUInt32LE(0);
  const height = b.readUInt32LE(4);
  // The header is 12 bytes (width, height, format) or 16 with the color space.
  const header = b.length - width * height * 4;
  return { width, height, px: b.subarray(header) };
}

/**
 * How much of a screen rectangle is lit and how varied it is: the share
 * of sampled pixels brighter than a dark gray and the number of distinct
 * coarse colors. A black or frozen-blank picture scores ~0 on both.
 */
export function pictureStats(rect: [number, number, number, number]) {
  const { width, height, px } = rawScreen();
  const [l, t, r, bt] = [Math.max(0, rect[0]), Math.max(0, rect[1]), Math.min(width, rect[2]), Math.min(height, rect[3])];
  let lit = 0;
  let total = 0;
  const colors = new Set<number>();
  for (let y = t + 2; y < bt - 2; y += 6) {
    for (let x = l + 2; x < r - 2; x += 6) {
      const i = (y * width + x) * 4;
      const R = px[i]!;
      const G = px[i + 1]!;
      const B = px[i + 2]!;
      total++;
      if (R + G + B > 90) lit++;
      colors.add(((R >> 5) << 6) | ((G >> 5) << 3) | (B >> 5));
    }
  }
  return { litShare: total ? lit / total : 0, colors: colors.size };
}

/** Records the screen in chunks (screenrecord stops at 180 s), pulled at the end. */
export class ScreenRecorder {
  private chunk = 0;
  private proc: ChildProcess | null = null;
  private pid = "";
  private stopped = false;
  private readonly files: string[] = [];

  private readonly prefix: string;

  constructor(prefix = "golink-e2e") {
    this.prefix = prefix;
  }

  start() {
    this.stopped = false;
    this.next();
  }

  private next() {
    if (this.stopped) return;
    const remote = `/sdcard/${this.prefix}-${++this.chunk}.mp4`;
    this.files.push(remote);
    // The shell prints its PID and becomes screenrecord (exec), so stop()
    // signals exactly the recorder this test started.
    this.pid = "";
    this.proc = spawn(adbPath(), ["shell", `echo $$; exec screenrecord --time-limit 175 --bit-rate 4000000 ${remote}`], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    this.proc.stdout!.setEncoding("utf8");
    this.proc.stdout!.on("data", (d: string) => {
      if (!this.pid) this.pid = d.trim().split(/\s+/)[0] ?? "";
    });
    this.proc.on("exit", () => {
      this.proc = null;
      if (!this.stopped) this.next();
    });
  }

  /** Stops the recording and copies the chunks to dir; returns the local files. */
  async stop(dir: string): Promise<string[]> {
    this.stopped = true;
    if (this.pid && /^\d+$/.test(this.pid)) {
      try {
        // SIGINT makes screenrecord finish the file properly.
        shell(`kill -INT ${this.pid} || true`);
      } catch {
        // already finished
      }
    }
    const end = Date.now() + 15_000;
    while (this.proc && Date.now() < end) await sleep(300);
    await sleep(1500);
    mkdirSync(dir, { recursive: true });
    const out: string[] = [];
    for (const remote of this.files) {
      const local = join(dir, remote.split("/").pop()!);
      try {
        adb("pull", remote, local);
        shell(`rm -f ${remote}`);
        out.push(local);
      } catch {
        // a chunk that never started
      }
    }
    return out;
  }
}

/** One GoLinkE2E line from the app. */
export type ProbeEvent = Record<string, unknown> & { ev: string };

/** Follows the app's GoLinkE2E logcat lines. */
export class Probe {
  readonly events: ProbeEvent[] = [];
  private proc: ChildProcess | null = null;
  private buf = "";

  start() {
    adb("logcat", "-c");
    this.proc = spawn(adbPath(), ["logcat", "-v", "raw", "-s", "GoLinkE2E:I"], { stdio: ["ignore", "pipe", "ignore"] });
    this.proc.stdout!.setEncoding("utf8");
    this.proc.stdout!.on("data", (chunk: string) => {
      this.buf += chunk;
      let nl: number;
      while ((nl = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, nl).trim();
        this.buf = this.buf.slice(nl + 1);
        if (!line.startsWith("{")) continue;
        try {
          this.events.push(JSON.parse(line) as ProbeEvent);
        } catch {
          // a line cut by logcat
        }
      }
    });
  }

  stop() {
    this.proc?.kill();
    this.proc = null;
  }

  /** Index to read "events after now" from. */
  mark(): number {
    return this.events.length;
  }

  lastUi(): ProbeEvent | undefined {
    for (let i = this.events.length - 1; i >= 0; i--) if (this.events[i]!.ev === "ui") return this.events[i];
    return undefined;
  }

  lastStats(): StatsLine | undefined {
    for (let i = this.events.length - 1; i >= 0; i--) if (this.events[i]!.ev === "stats") return this.events[i] as unknown as StatsLine;
    return undefined;
  }

  /** Waits for an event after `from` that passes ok. */
  async waitFor(ok: (e: ProbeEvent) => boolean, timeout = 30_000, from = 0): Promise<ProbeEvent> {
    const end = Date.now() + timeout;
    let i = from;
    while (Date.now() < end) {
      for (; i < this.events.length; i++) if (ok(this.events[i]!)) return this.events[i]!;
      await sleep(250);
    }
    throw new Error(`GoLinkE2E: no matching event in ${timeout} ms; last ui: ${JSON.stringify(this.lastUi())}`);
  }
}

export interface TrackStats {
  packets?: number;
  bytes?: number;
  level?: number;
  energy?: number;
  samples?: number;
  frames?: number;
  width?: number;
}

export interface StatsLine {
  ev: "stats";
  in: Record<string, TrackStats>;
  out: { mic?: { packets?: number; bytes?: number }; mic_level?: number };
  path?: string;
}
