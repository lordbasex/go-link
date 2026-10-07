// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// A room's telemetry as the device keeps it (telemetry.db) and sends it to
// the host's linked browser: the times it was on, who joined, series of
// samples for the charts, the log of events and the freezes with where
// each most likely came from. See docs/telemetry.md.

/** One time the room was on; endedAt is null while it runs. */
export interface TelemetryRun {
  id: string;
  startedAt: number;
  endedAt: number | null;
  game: string;
}

export interface TelemetryPeer {
  id: string;
  name: string;
  first: number;
  last: number;
}

/** One metric in buckets: the average and the highest of each; null: no sample. */
export interface TelemetrySeries {
  peer: string;
  kind: "room" | "peer" | "client" | string;
  metric: string;
  avg: (number | null)[];
  max: (number | null)[];
}

export interface TelemetryEvent {
  at: number;
  level: "info" | "warn" | "error";
  kind: string;
  peer: string;
  msg: string;
  data: Record<string, unknown> | null;
}

export type IncidentVerdict = "device" | "host_network" | "host" | "guest" | "network" | "player";

export interface TelemetryIncident {
  start: number;
  end: number;
  verdict: IncidentVerdict;
  why: string;
  peers: string[];
  deviceGapMs: number;
  lost: Record<string, number>;
  voice: boolean;
}

export type TelemetryAnswer =
  | { type: "telemetry_runs"; req: number; id: string; error?: string; from: number; to: number; runs: TelemetryRun[]; peers: TelemetryPeer[] }
  | { type: "telemetry_series"; req: number; id: string; error?: string; from: number; to: number; step: number; series: TelemetrySeries[] }
  | { type: "telemetry_events"; req: number; id: string; error?: string; from: number; to: number; events: TelemetryEvent[]; more: boolean }
  | { type: "telemetry_incidents"; req: number; id: string; error?: string; from: number; to: number; incidents: TelemetryIncident[] }
  | { type: "telemetry_find"; req: number; id: string; error?: string; run: TelemetryRun | null };

const VERDICTS: IncidentVerdict[] = ["device", "host_network", "host", "guest", "network", "player"];

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
// Go's zero time ("0001-01-01...") means none.
const time = (v: unknown) => {
  if (typeof v !== "string" || v.startsWith("0001-")) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const nums = (v: unknown) => arr(v).map((x) => (typeof x === "number" && Number.isFinite(x) ? x : null));

function parseRun(v: unknown): TelemetryRun {
  const o = obj(v);
  return { id: str(o.id, 64), startedAt: time(o.started) ?? 0, endedAt: time(o.ended), game: str(o.game) };
}

/** Reads a telemetry answer from the device, or null for any other message. */
export function parseTelemetry(msg: unknown): TelemetryAnswer | null {
  const m = obj(msg);
  const base = { req: num(m.req), id: str(m.id, 64), ...(typeof m.error === "string" ? { error: str(m.error) } : {}) };
  const span = { from: num(m.from), to: num(m.to) };
  switch (m.type) {
    case "telemetry_runs":
      return {
        type: m.type, ...base, ...span,
        runs: arr(m.runs).map(parseRun),
        peers: arr(m.peers).map((p) => {
          const o = obj(p);
          return { id: str(o.id, 64), name: str(o.name, 40), first: time(o.first) ?? 0, last: time(o.last) ?? 0 };
        }),
      };
    case "telemetry_series":
      return {
        type: m.type, ...base, ...span, step: num(m.step),
        series: arr(m.series).map((s) => {
          const o = obj(s);
          return { peer: str(o.peer, 64), kind: str(o.kind, 16), metric: str(o.metric, 40), avg: nums(o.avg), max: nums(o.max) };
        }),
      };
    case "telemetry_events":
      return {
        type: m.type, ...base, ...span, more: m.more === true,
        events: arr(m.events).map((e) => {
          const o = obj(e);
          const level = o.level === "warn" || o.level === "error" ? o.level : "info";
          return { at: time(o.at) ?? 0, level, kind: str(o.kind, 40), peer: str(o.peer, 64), msg: str(o.msg, 300), data: typeof o.data === "object" && o.data !== null ? (o.data as Record<string, unknown>) : null };
        }),
      };
    case "telemetry_incidents":
      return {
        type: m.type, ...base, ...span,
        incidents: arr(m.incidents).map((i) => {
          const o = obj(i);
          const lost: Record<string, number> = {};
          for (const [k, v] of Object.entries(obj(o.lost))) if (typeof v === "number") lost[k] = v;
          const verdict = VERDICTS.includes(o.verdict as IncidentVerdict) ? (o.verdict as IncidentVerdict) : "player";
          return {
            start: time(o.start) ?? 0, end: time(o.end) ?? 0, verdict, why: str(o.why, 400),
            peers: arr(o.peers).map((p) => str(p, 64)), deviceGapMs: num(o.device_gap_ms), lost, voice: o.voice === true,
          };
        }),
      };
    case "telemetry_find":
      return { type: m.type, ...base, run: m.run ? parseRun(m.run) : null };
    default:
      return null;
  }
}

/** The short form of a game id shown in the history: its first 8 characters. */
export const shortRunId = (id: string) => id.slice(0, 8);
