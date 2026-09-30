// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The controller test's event log and its report. The Gamepad API has no
// events for buttons or sticks, only a state read on every frame, so the
// log is what changed from one frame to the next, stamped with the time
// the controller reported it. Plain data and functions (no DOM), so they
// are tested without a controller.

export type LogKind = "btn" | "axis" | "trig" | "sys" | "warn";
export const LOG_KINDS: readonly LogKind[] = ["btn", "axis", "trig", "sys", "warn"];

export interface LogLine {
  /** Wall clock time in ms (Date.now() scale). */
  at: number;
  /** The controller's index (0-3). */
  pad: number;
  kind: LogKind;
  text: string;
}

/** One controller's state on one frame. */
export interface PadSample {
  index: number;
  id: string;
  mapping: string;
  pressed: readonly boolean[];
  values: readonly number[];
  axes: readonly number[];
}

/** What the log counts per button. */
export interface ButtonStats {
  presses: number;
  bounces: number;
  /** Shortest and total press time in ms (for the average). */
  minMs: number | null;
  totalMs: number;
  released: number;
}

/** Everything the log knows about one controller, for the report. */
export interface PadStats {
  index: number;
  id: string;
  mapping: string;
  buttons: ButtonStats[];
  axes: number;
  connects: number;
  disconnects: number;
}

/** The standard mapping's button names (index → label). */
export const STANDARD_NAMES = ["B1", "B2", "B3", "B4", "L1", "R1", "L2", "R2", "Select", "Start", "L3", "R3", "Up", "Down", "Left", "Right", "Home", "Touch"];
const AXIS_NAMES = ["LX", "LY", "RX", "RY"];

export function buttonName(i: number, mapping: string): string {
  return mapping === "standard" ? (STANDARD_NAMES[i] ?? `B${i}`) : `B${i}`;
}

export function axisName(i: number, mapping: string): string {
  return mapping === "standard" ? (AXIS_NAMES[i] ?? `A${i}`) : `A${i}`;
}

/** A press less than this long after the same button was let go is a bounce. */
export const BOUNCE_MS = 40;
/** A stick is logged when it moved this much since the last line. */
const AXIS_STEP = 0.1;
/** ...and at most this often per axis. */
const AXIS_EVERY_MS = 50;
/** An analog trigger is logged every time it moves this much. */
const TRIGGER_STEP = 0.1;

interface PadState {
  pressed: boolean[];
  loggedAxes: number[];
  axisAt: number[];
  loggedTrig: number[];
  downAt: number[];
  upAt: number[];
}

const fmt = (v: number) => (v >= 0 ? " " : "") + v.toFixed(2);

export class PadLog {
  readonly lines: LogLine[] = [];
  /** Lines ever written (the list itself keeps the last `max`). */
  total = 0;
  readonly stats = new Map<number, PadStats>();
  private state = new Map<number, PadState>();

  constructor(readonly max = 5000) {}

  private push(line: LogLine) {
    this.lines.push(line);
    if (this.lines.length > this.max) this.lines.splice(0, this.lines.length - this.max);
    this.total++;
  }

  /** One frame of one controller at time `at` (ms, Date.now() scale). */
  observe(s: PadSample, at: number): void {
    let st = this.state.get(s.index);
    let stats = this.stats.get(s.index);
    if (!st || !stats || stats.id !== s.id) {
      st = { pressed: [], loggedAxes: s.axes.map(() => 0), axisAt: s.axes.map(() => 0), loggedTrig: [0, 0], downAt: [], upAt: [] };
      this.state.set(s.index, st);
      stats = stats && stats.id === s.id ? stats : { index: s.index, id: s.id, mapping: s.mapping, buttons: [], axes: s.axes.length, connects: 0, disconnects: 0 };
      stats.connects++;
      this.stats.set(s.index, stats);
      this.push({ at, pad: s.index, kind: "sys", text: `CONNECT  ${s.id} · mapping ${s.mapping || "none"} · ${s.pressed.length} buttons · ${s.axes.length} axes` });
    }
    const standard = s.mapping === "standard";
    s.pressed.forEach((on, i) => {
      const b = (stats!.buttons[i] ??= { presses: 0, bounces: 0, minMs: null, totalMs: 0, released: 0 });
      const was = st!.pressed[i] ?? false;
      const name = buttonName(i, s.mapping).padEnd(7);
      if (on && !was) {
        b.presses++;
        const up = st!.upAt[i];
        st!.downAt[i] = at;
        const v = s.values[i] ?? 1;
        this.push({ at, pad: s.index, kind: "btn", text: `BTN  ${name}(${i})  ▼ pressed${v > 0 && v < 1 ? `  ${v.toFixed(2)}` : ""}` });
        if (up !== undefined && at - up < BOUNCE_MS) {
          b.bounces++;
          this.push({ at, pad: s.index, kind: "warn", text: `WARN ${name}(${i})  pressed again ${Math.round(at - up)} ms after release (bounce)` });
        }
      } else if (!on && was) {
        const down = st!.downAt[i];
        const ms = down === undefined ? null : at - down;
        st!.upAt[i] = at;
        if (ms !== null) {
          b.released++;
          b.totalMs += ms;
          b.minMs = b.minMs === null ? ms : Math.min(b.minMs, ms);
        }
        this.push({ at, pad: s.index, kind: "btn", text: `BTN  ${name}(${i})  ▲ released${ms === null ? "" : `  ${Math.round(ms)} ms`}` });
      }
      st!.pressed[i] = on;
    });
    // Analog triggers (standard mapping 6 and 7): every 10 % of travel.
    if (standard) {
      [6, 7].forEach((bi, k) => {
        const v = s.values[bi] ?? 0;
        const last = st!.loggedTrig[k]!;
        if (Math.abs(v - last) >= TRIGGER_STEP || (v === 0 && last !== 0) || (v === 1 && last !== 1)) {
          st!.loggedTrig[k] = v;
          this.push({ at, pad: s.index, kind: "trig", text: `TRIG ${buttonName(bi, s.mapping).padEnd(7)}(${bi})  ${fmt(v)}` });
        }
      });
    }
    s.axes.forEach((v, i) => {
      const last = st!.loggedAxes[i] ?? 0;
      const back = v === 0 && last !== 0;
      if ((Math.abs(v - last) >= AXIS_STEP && at - (st!.axisAt[i] ?? 0) >= AXIS_EVERY_MS) || back) {
        this.push({ at, pad: s.index, kind: "axis", text: `AXIS ${axisName(i, s.mapping).padEnd(7)}(${i})  ${fmt(last)} → ${fmt(v)}` });
        st!.loggedAxes[i] = v;
        st!.axisAt[i] = at;
      }
    });
  }

  /** The controllers seen this frame: any other one known is gone. */
  present(indices: readonly number[], at: number): void {
    for (const [index, stats] of this.stats) {
      if (this.state.has(index) && !indices.includes(index)) {
        this.state.delete(index);
        stats.disconnects++;
        this.push({ at, pad: index, kind: "sys", text: `DISCONNECT  ${stats.id}` });
      }
    }
  }

  clear(): void {
    this.lines.length = 0;
    this.total++;
  }
}

/** HH:MM:SS.mmm in local time. */
export function clock(at: number): string {
  const d = new Date(at);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

export function formatLine(l: LogLine): string {
  return `${clock(l.at)}  P${l.pad + 1}  ${l.text}`;
}

/** What the tester measured on one controller, for the report. */
export interface ReportPad {
  stats: PadStats;
  brand: string;
  model: string;
  vendor: string;
  product: string;
  rumble: boolean;
  pollingHz: number;
  pollingPeakHz: number;
  sticks: { name: string; drift: number | null; jitter: number | null; circularity: number | null; coverage: number; maxRadius: number; deadzone: number | null }[];
  triggers: { name: string; max: number; returnMs: number | null; residual: number | null }[];
  /** The page's own verdicts, as shown in its check. */
  checks: { label: string; value: string; verdict: string }[];
}

export interface ReportEnv {
  date: string;
  userAgent: string;
  platform: string;
  screenHz: number | null;
  language: string;
}

const LANG_NAMES: Record<string, string> = { en: "English", es: "Spanish", pt: "Portuguese" };
const n = (v: number | null, d = 3) => (v === null ? "not measured" : v.toFixed(d));

/**
 * A Markdown report meant to be pasted into an AI assistant: short
 * instructions, a readable summary per controller, then the raw data as
 * JSON and the last lines of the log.
 */
export function buildReport(pads: readonly ReportPad[], log: readonly LogLine[], env: ReportEnv, logLines = 400): string {
  const out: string[] = [];
  out.push("# go-link controller report", "");
  out.push(
    `> You are a game controller technician. Analyze this report from go-link's controller test (the browser's Gamepad API) and say, for each controller: what works, what looks worn or faulty (stick drift, dead zone, circularity, triggers that do not return, buttons that bounce or were never pressed, a low update rate), how sure you are, and what the owner can do (clean, recalibrate, replace a part, update firmware, try another cable or Bluetooth). Values: sticks and triggers go from -1 to 1 and 0 to 1; drift under 0.05 is good and over 0.12 is bad; circularity is the average error against a perfect circle (under 10 % is good); a press less than ${BOUNCE_MS} ms after the same button was released is a bounce. "not measured" means the owner did not do that step. Answer in ${LANG_NAMES[env.language] ?? "English"}.`,
    "",
  );
  out.push("## Environment", "");
  out.push(`- Date: ${env.date}`, `- Browser: ${env.userAgent}`, `- Platform: ${env.platform || "unknown"}`, `- Screen: ${env.screenHz ? `${env.screenHz} Hz` : "unknown"}`, "");
  if (!pads.length) out.push("No controller was connected.", "");
  for (const p of pads) {
    const s = p.stats;
    out.push(`## Controller ${s.index + 1}: ${[p.brand, p.model].filter(Boolean).join(" ") || s.id}`, "");
    out.push(`- Browser id: \`${s.id}\``);
    if (p.vendor) out.push(`- USB ids: VID ${p.vendor} · PID ${p.product}`);
    out.push(`- Mapping: ${s.mapping || "none"} · ${s.buttons.length} buttons · ${s.axes} axes · vibration ${p.rumble ? "yes" : "no"}`);
    out.push(`- Updates per second: ${p.pollingHz} now, up to ${p.pollingPeakHz} seen (browsers may only report changes)`);
    out.push(`- Connected ${s.connects} time(s), disconnected ${s.disconnects} time(s) during the test`, "");
    if (p.checks.length) {
      out.push("| Check | Value | Verdict |", "| --- | --- | --- |");
      for (const c of p.checks) out.push(`| ${c.label} | ${c.value} | ${c.verdict} |`);
      out.push("");
    }
    out.push("| Stick | Drift | Jitter | Circularity | Reached | Max radius | Dead zone |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const st of p.sticks) out.push(`| ${st.name} | ${n(st.drift)} | ${n(st.jitter)} | ${st.circularity === null ? "not measured" : `${(st.circularity * 100).toFixed(1)} %`} | ${Math.round(st.coverage * 100)} % of directions | ${st.maxRadius.toFixed(2)} | ${n(st.deadzone, 2)} |`);
    out.push("");
    if (p.triggers.length) {
      out.push("| Trigger | Deepest | Return | At rest |", "| --- | --- | --- | --- |");
      for (const tr of p.triggers) out.push(`| ${tr.name} | ${tr.max.toFixed(2)} | ${tr.returnMs === null ? "not measured" : `${Math.round(tr.returnMs)} ms`} | ${n(tr.residual, 2)} |`);
      out.push("");
    }
    out.push("| Button | Presses | Bounces | Shortest press | Average press |", "| --- | --- | --- | --- | --- |");
    s.buttons.forEach((b, i) => {
      if (!b) return;
      out.push(`| ${buttonName(i, s.mapping)} (${i}) | ${b.presses} | ${b.bounces} | ${b.minMs === null ? "—" : `${Math.round(b.minMs)} ms`} | ${b.released ? `${Math.round(b.totalMs / b.released)} ms` : "—"} |`);
    });
    const never = Array.from({ length: s.buttons.length }, (_, i) => i).filter((i) => !s.buttons[i]?.presses);
    out.push("", `Never pressed: ${never.length ? never.map((i) => `${buttonName(i, s.mapping)} (${i})`).join(", ") : "none"}`, "");
  }
  const tail = log.slice(-logLines);
  out.push(`## Event log (last ${tail.length} lines)`, "", "```", ...tail.map(formatLine), "```", "");
  out.push("## Raw data", "", "```json", JSON.stringify({ env, pads }, null, 1), "```", "");
  return out.join("\n");
}
