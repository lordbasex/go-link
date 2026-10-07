// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  parseTelemetry,
  shortRunId,
  type TelemetryAnswer,
  type TelemetryEvent,
  type TelemetryIncident,
  type TelemetryPeer,
  type TelemetryRun,
  type TelemetrySeries,
} from "@go-link/shared";
import { getLang, t } from "../../i18n";
import { useSignal } from "../../signal/SignalProvider";
import { ChevronLeftIcon, CopyIcon } from "../Icons";
import { Select } from "../ui/Select";
import { SkeletonCards } from "../ui/Skeleton";
import { formatDuration, GameId } from "./HistoryTab";
import { TimeChart, type TimeBand, type TimeLine } from "./TimeChart";

/** Line colors: the seats' first, then the other accents. */
const COLORS = ["var(--color-p1)", "var(--color-p2)", "var(--color-p3)", "var(--color-p4)", "var(--color-ok)", "var(--color-water)", "var(--color-hazard)", "var(--color-accent)"];

type Metric = { m: string; agg: "avg" | "max"; label?: (l: typeof t.net.metrics) => string; dashed?: boolean };

/** The charts: each asks the device for its own metrics. */
const CHARTS: { id: keyof typeof t.net.charts; unit: string; metrics: Metric[]; max?: number }[] = [
  { id: "latency", unit: "ms", metrics: [{ m: "client.rtt_ms", agg: "avg" }, { m: "client.e2e_ms", agg: "avg", dashed: true, label: (l) => l.e2e }] },
  { id: "loss", unit: "%", metrics: [{ m: "client.video_loss_pct", agg: "max" }] },
  { id: "freezes", unit: "ms", metrics: [{ m: "client.freeze_ms", agg: "max" }, { m: "room.gap_max_ms", agg: "max", label: (l) => l.gameGap }] },
  { id: "frames", unit: "fps", metrics: [{ m: "room.fps_in", agg: "avg", label: (l) => l.fpsIn }, { m: "room.fps_sent", agg: "avg", label: (l) => l.fpsSent, dashed: true }, { m: "client.fps", agg: "avg" }] },
  { id: "input", unit: "ms", metrics: [{ m: "peer.input_gap_max_ms", agg: "max" }] },
  { id: "jitter", unit: "ms", metrics: [{ m: "client.jitter_ms", agg: "max" }, { m: "client.buffer_ms", agg: "avg", dashed: true, label: (l) => l.buffer }] },
  { id: "host", unit: "%", metrics: [{ m: "room.cpu_pct", agg: "avg", label: (l) => l.cpu }, { m: "room.proc_cpu_pct", agg: "avg", label: (l) => l.procCpu, dashed: true }] },
  { id: "upload", unit: "kbps", metrics: [{ m: "room.net_up_kbps", agg: "avg", label: (l) => l.netUp }, { m: "room.kbps", agg: "avg", label: (l) => l.video, dashed: true }] },
  { id: "voice", unit: "pkt/s", metrics: [{ m: "peer.voice_in_pps", agg: "avg" }] },
];

type ChartId = (typeof CHARTS)[number]["id"];
type ChartData = { from: number; step: number; list: TelemetrySeries[] };

const fmtWhen = (ms: number, withDate = true) =>
  new Intl.DateTimeFormat(getLang(), withDate ? { dateStyle: "medium", timeStyle: "medium" } : { timeStyle: "medium" }).format(ms);

/** Asks the device about a room's telemetry and matches each answer to its question. */
function useTelemetry() {
  const { sendToDevice, onDeviceMessage } = useSignal();
  const seq = useRef(0);
  const waiting = useRef(new Map<number, (a: TelemetryAnswer | null) => void>());
  useEffect(
    () =>
      onDeviceMessage((msg) => {
        const a = parseTelemetry(msg);
        if (!a) return;
        const done = waiting.current.get(a.req);
        waiting.current.delete(a.req);
        done?.(a);
      }),
    [onDeviceMessage],
  );
  return useCallback(
    <T extends TelemetryAnswer["type"]>(msg: { type: T } & Record<string, unknown>) =>
      new Promise<Extract<TelemetryAnswer, { type: T }> | null>((resolve) => {
        const req = ++seq.current;
        waiting.current.set(req, resolve as (a: TelemetryAnswer | null) => void);
        sendToDevice({ ...msg, req });
        setTimeout(() => {
          if (waiting.current.delete(req)) resolve(null);
        }, 30_000);
      }),
    [sendToDevice],
  );
}

/** A room's network report: charts, freezes with their likely cause and the raw log. */
export function NetworkReport({ roomId }: { roomId: string }) {
  const { linkedDevice } = useSignal();
  const ask = useTelemetry();
  const [params, setParams] = useSearchParams();
  const runParam = params.get("run") ?? "";
  const ready = linkedDevice.state === "connected" && linkedDevice.status !== null;
  const [runs, setRuns] = useState<TelemetryRun[] | null>(null);
  const [peers, setPeers] = useState<TelemetryPeer[]>([]);
  const [failed, setFailed] = useState(false);
  const [series, setSeries] = useState<Partial<Record<ChartId, ChartData>> | null>(null);
  const [incidents, setIncidents] = useState<TelemetryIncident[]>([]);
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [moreEvents, setMoreEvents] = useState(false);
  const [warnOnly, setWarnOnly] = useState(false);
  const [tick, setTick] = useState(0);
  const roomName = useMemo(() => linkedDevice.status?.rooms.find((r) => r.id === roomId)?.name, [linkedDevice.status, roomId]);

  useEffect(() => {
    if (!ready) return;
    let live = true;
    void ask({ type: "telemetry_runs", id: roomId }).then((a) => {
      if (!live) return;
      if (!a || a.error) {
        setFailed(true);
        return;
      }
      setRuns(a.runs);
      setPeers(a.peers);
    });
    return () => {
      live = false;
    };
  }, [ready, ask, roomId, tick]);

  // The span: one game (run=id) or every time the room was on.
  const run = runs?.find((r) => r.id === runParam) ?? null;
  const running = run ? run.endedAt === null : (runs?.some((r) => r.endedAt === null) ?? false);
  const from = run ? run.startedAt : (runs?.[0]?.startedAt ?? 0);
  const to = run ? (run.endedAt ?? 0) : 0; // 0: now

  // Live games refresh every 5 seconds.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!ready || !runs || runs.length === 0) return;
    let live = true;
    const span = { id: roomId, from, to };
    // One request per chart: each answer has to fit one message.
    void Promise.all(CHARTS.map((c) => ask({ type: "telemetry_series", ...span, metrics: c.metrics.map((m) => m.m) }))).then((answers) => {
      if (!live) return;
      const next: Partial<Record<ChartId, ChartData>> = {};
      answers.forEach((a, i) => {
        if (a && !a.error) next[CHARTS[i]!.id] = { from: a.from, step: a.step, list: a.series };
      });
      setSeries(next);
    });
    void ask({ type: "telemetry_incidents", ...span }).then((a) => {
      if (live && a && !a.error) setIncidents(a.incidents);
    });
    void ask({ type: "telemetry_events", ...span, level: warnOnly ? "warn" : "", limit: 300 }).then((a) => {
      if (!live || !a || a.error) return;
      setEvents(a.events);
      setMoreEvents(a.more);
    });
    return () => {
      live = false;
    };
  }, [ready, ask, roomId, runs, from, to, warnOnly, tick]);

  const loadMoreEvents = () => {
    const last = events[events.length - 1];
    if (!last) return;
    void ask({ type: "telemetry_events", id: roomId, from: last.at + 1, to, level: warnOnly ? "warn" : "", limit: 300 }).then((a) => {
      if (!a || a.error) return;
      setEvents((cur) => [...cur, ...a.events]);
      setMoreEvents(a.more);
    });
  };

  const nameOf = useCallback(
    (peer: string) => {
      if (!peer) return t.net.device;
      const p = peers.find((x) => x.id === peer);
      return p?.name || `${t.net.guest} ${peer.slice(0, 4).toUpperCase()}`;
    },
    [peers],
  );
  const colorOf = useCallback((peer: string) => COLORS[Math.max(0, peers.findIndex((x) => x.id === peer)) % COLORS.length]!, [peers]);

  const bands: TimeBand[] = useMemo(() => incidents.map((i) => ({ from: i.start, to: i.end })), [incidents]);
  const charts = useMemo(() => {
    if (!series) return [];
    return CHARTS.map((c) => {
      const lines: TimeLine[] = [];
      const data = series[c.id];
      c.metrics.forEach((m, mi) => {
        const [kind, metric] = m.m.split(".");
        for (const s of (data?.list ?? []).filter((x) => x.kind === kind && x.metric === metric)) {
          const values = m.agg === "max" ? s.max : s.avg;
          if (!values.some((v) => v !== null)) continue;
          const who = s.peer ? nameOf(s.peer) : "";
          const what = m.label ? m.label(t.net.metrics) : "";
          lines.push({
            key: `${m.m}|${s.peer}`,
            label: [who, what].filter(Boolean).join(" · "),
            color: s.peer ? colorOf(s.peer) : COLORS[(4 + mi) % COLORS.length]!,
            values,
            dashed: m.dashed,
          });
        }
      });
      return { ...c, lines, data };
    });
  }, [series, nameOf, colorOf]);

  const runOptions = useMemo(
    () => [
      { value: "", label: t.net.allRuns(runs?.length ?? 0) },
      ...[...(runs ?? [])].reverse().map((r) => ({
        value: r.id,
        label: `#${shortRunId(r.id)} · ${fmtWhen(r.startedAt)}`,
        detail: r.endedAt === null ? t.net.liveNow : formatDuration(r.endedAt - r.startedAt),
      })),
    ],
    [runs],
  );

  const copyLog = () => {
    const lines = [
      `# go-link network report · room ${roomId}${run ? ` · game #${run.id}` : ""}`,
      ...incidents.map((i) => `incident ${new Date(i.start).toISOString()} ${((i.end - i.start) / 1000).toFixed(1)}s ${i.verdict}: ${i.why}`),
      ...events.map((e) => `${new Date(e.at).toISOString()} ${e.level} ${e.kind}${e.peer ? ` [${nameOf(e.peer)}]` : ""} ${e.msg}${e.data ? ` ${JSON.stringify(e.data)}` : ""}`),
    ];
    void navigator.clipboard?.writeText(lines.join("\n")).catch(() => undefined);
  };

  return (
    <section className="netreport" aria-label={t.net.title}>
      <div className="netreport-head">
        <Link to="/device/history" className="back-link">
          <ChevronLeftIcon size={14} />
          {t.net.back}
        </Link>
        <h2 className="netreport-title">
          {t.net.title}
          <span className="muted"> · {roomName ?? run?.game ?? runs?.[runs.length - 1]?.game ?? roomId}</span>
        </h2>
        <div className="netreport-tools">
          {run && <GameId id={run.id} />}
          {running && <span className="chip netreport-live">{t.net.liveNow}</span>}
          {runs && runs.length > 0 && (
            <span className="netreport-range small muted">
              <label id="net-run-label" htmlFor="net-run">
                {t.net.range}
              </label>
              <Select
                id="net-run"
                labelId="net-run-label"
                className="select-sm"
                value={run ? run.id : ""}
                onChange={(v) => setParams(v ? { run: v } : {}, { replace: true })}
                options={runOptions}
              />
            </span>
          )}
        </div>
      </div>

      {failed ? (
        <p className="muted">{t.net.failed}</p>
      ) : !runs ? (
        <SkeletonCards cards={3} label={t.net.loading} />
      ) : runs.length === 0 || (runParam && !run) ? (
        <div className="empty-state">
          <p className="strong">{t.net.none}</p>
          <p className="muted">{t.net.noneHint}</p>
        </div>
      ) : (
        <>
          <p className="small muted netreport-span">
            {t.net.span(fmtWhen(from), to ? fmtWhen(to) : t.net.now, peers.length)}
          </p>
          <section className="netreport-incidents" aria-label={t.net.incidents}>
            <h3 className="strong">{t.net.incidentsTitle(incidents.length)}</h3>
            {incidents.length === 0 ? (
              <p className="small muted">{t.net.noIncidents}</p>
            ) : (
              <ul className="net-incidents">
                {incidents.map((i) => (
                  <li key={i.start} className={`net-incident is-${i.verdict}`}>
                    <span className="net-verdict">{t.net.verdicts[i.verdict]}</span>
                    <span className="mono small">
                      {fmtWhen(i.start)} · {((i.end - i.start) / 1000).toFixed(1)} s
                    </span>
                    <span className="small">{t.net.why[i.verdict]({ who: i.peers.map(nameOf).join(", "), gap: Math.round(i.deviceGapMs), voice: i.voice })}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="netreport-charts">
            {charts.map((c) => (
              <section key={c.id} className="netreport-chart">
                <h3 className="small strong">
                  {t.net.charts[c.id]} <span className="muted">({c.unit})</span>
                </h3>
                {c.lines.length === 0 || !c.data ? (
                  <p className="small faint">{t.net.noData}</p>
                ) : (
                  <TimeChart lines={c.lines} from={c.data.from} step={c.data.step} unit={c.unit} bands={bands} label={t.net.charts[c.id]} max={c.max} />
                )}
                <p className="small faint">{t.net.hints[c.id]}</p>
              </section>
            ))}
          </div>

          <section className="netreport-log" aria-label={t.net.log}>
            <div className="netreport-log-head">
              <h3 className="strong">{t.net.log}</h3>
              <div className="segmented netreport-seg" role="group" aria-label={t.net.log}>
                <button type="button" className={!warnOnly ? "is-on" : ""} aria-pressed={!warnOnly} onClick={() => setWarnOnly(false)}>
                  {t.net.allEvents}
                </button>
                <button type="button" className={warnOnly ? "is-on" : ""} aria-pressed={warnOnly} onClick={() => setWarnOnly(true)}>
                  {t.net.warnings}
                </button>
              </div>
              <button type="button" className="button button-secondary button-small" onClick={copyLog}>
                <CopyIcon size={14} />
                {t.net.copyLog}
              </button>
            </div>
            <div className="lobby-table-wrap">
              <table className="lobby-table net-log">
                <thead>
                  <tr>
                    <th scope="col">{t.net.cols.when}</th>
                    <th scope="col">{t.net.cols.level}</th>
                    <th scope="col">{t.net.cols.event}</th>
                    <th scope="col">{t.net.cols.who}</th>
                    <th scope="col">{t.net.cols.detail}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e, i) => (
                    <tr key={`${e.at}-${i}`} className={`net-ev is-${e.level}`}>
                      <td className="mono small">{fmtWhen(e.at, false)}</td>
                      <td>
                        <span className={`net-level is-${e.level}`}>{e.level}</span>
                      </td>
                      <td className="mono small">{e.kind}</td>
                      <td className="small">{e.peer ? nameOf(e.peer) : "–"}</td>
                      <td className="small">
                        {e.msg}
                        {e.data && <span className="mono faint net-data"> {JSON.stringify(e.data)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {moreEvents && (
              <div className="list-more">
                <button type="button" className="button button-secondary" onClick={loadMoreEvents}>
                  {t.net.moreEvents}
                </button>
              </div>
            )}
            <p className="small faint">{t.net.cliHint(run ? `#${shortRunId(run.id)}` : roomId)}</p>
          </section>
        </>
      )}
    </section>
  );
}
