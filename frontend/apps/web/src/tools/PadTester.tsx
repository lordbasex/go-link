// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useMemo, useRef, useState } from "react";
import { padBits, padMapFor, readGamepad, type Pad } from "@go-link/shared";
import { getLang, t } from "../i18n";
import { CopyIcon, DownloadIcon } from "../components/Icons";
import { useRefreshRate } from "@go-link/ui/picture";
import { PadConsole } from "./PadConsole";
import { PadLog, STANDARD_NAMES, buildReport, type ReportPad } from "./padLog";
import { useInputConfig } from "../signal/useInputConfig";
import { ControllerModel } from "@go-link/ui/controllers";
import { identify, type ControllerIdentity } from "@go-link/ui/controllers";
import {
  BounceProbe,
  DeadzoneProbe,
  PollingRate,
  StickRange,
  TriggerProbe,
  circularityVerdict,
  deadzoneVerdict,
  driftVerdict,
  restStats,
  triggerVerdict,
  type Verdict,
} from "./diagnostics";

/** The guided check's steps, in order. */
const STEPS = ["rest", "circle", "triggers", "buttons", "done"] as const;
type Step = "idle" | (typeof STEPS)[number];
const REST_MS = 3000;

/** A pressed-and-released event for the history list. */
interface HistoryItem {
  at: number;
  text: string;
}

/** Everything measured on one controller, kept across frames (not React state). */
interface Probes {
  sticks: [StickRange, StickRange];
  deadzones: [DeadzoneProbe, DeadzoneProbe];
  triggers: [TriggerProbe, TriggerProbe];
  bounce: BounceProbe;
  polling: PollingRate;
  rest: [number, number][][];
  restStart: number;
  seen: Set<number>;
  history: HistoryItem[];
  prevPressed: boolean[];
}

function newProbes(): Probes {
  return {
    sticks: [new StickRange(), new StickRange()],
    deadzones: [new DeadzoneProbe(), new DeadzoneProbe()],
    triggers: [new TriggerProbe(), new TriggerProbe()],
    bounce: new BounceProbe(),
    polling: new PollingRate(),
    rest: [[], []],
    restStart: 0,
    seen: new Set(),
    history: [],
    prevPressed: [],
  };
}

/** One frame of one controller, for drawing. */
interface Frame {
  index: number;
  id: ControllerIdentity;
  mapping: string;
  axes: number[];
  pressed: boolean[];
  values: number[];
  pad: Pad;
  triggers: [number, number];
  rumble: boolean;
}

/**
 * The per-controller tester: each connected controller gets a card with
 * its faithful drawing, what the browser says about it, both sticks (reach,
 * drift, dead zone), the triggers (range, return, residual), every raw
 * button with a history, the update rate, vibration, and a guided check
 * that ends in a summary. Nothing is sent or stored.
 */
export function PadTester({ onPress }: { onPress?: (eventTime: number) => void }) {
  const { input } = useInputConfig();
  const probes = useRef(new Map<number, Probes>());
  const steps = useRef(new Map<number, Step>());
  const [frames, setFrames] = useState<Frame[]>([]);
  const [, setTick] = useState(0);
  const pressRef = useRef(onPress);
  pressRef.current = onPress;
  const log = useRef(new PadLog());
  const [showLog, setShowLog] = useState(false);
  const [copied, setCopied] = useState(false);
  const hz = useRefreshRate();

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return;
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      const wall = Date.now();
      const list: Frame[] = [];
      for (const gp of navigator.getGamepads()) {
        if (!gp || !gp.connected) continue;
        // The log's time is when the controller reported the change.
        log.current.observe(
          { index: gp.index, id: gp.id, mapping: gp.mapping, pressed: gp.buttons.map((b) => b.pressed), values: gp.buttons.map((b) => b.value), axes: gp.axes },
          gp.timestamp > 0 && gp.timestamp <= now ? wall - (now - gp.timestamp) : wall,
        );
        let p = probes.current.get(gp.index);
        if (!p) {
          p = newProbes();
          probes.current.set(gp.index, p);
        }
        const axes = [...gp.axes];
        const pressed = gp.buttons.map((b) => b.pressed);
        const values = gp.buttons.map((b) => b.value);
        p.polling.add(gp.timestamp, now);
        p.bounce.add(pressed, now);
        const step = steps.current.get(gp.index) ?? "idle";
        for (let s = 0; s < 2; s++) {
          const x = axes[s * 2] ?? 0;
          const y = axes[s * 2 + 1] ?? 0;
          p.sticks[s]!.add(x, y);
          p.deadzones[s]!.add(x, y);
          if (step === "rest") p.rest[s]!.push([x, y]);
        }
        const trig: [number, number] = gp.mapping === "standard" ? [values[6] ?? 0, values[7] ?? 0] : [0, 0];
        p.triggers[0].add(trig[0], now);
        p.triggers[1].add(trig[1], now);
        pressed.forEach((on, i) => {
          if (on && !p!.prevPressed[i]) {
            p!.seen.add(i);
            const name = gp.mapping === "standard" ? STANDARD_NAMES[i] ?? `B${i}` : `B${i}`;
            p!.history.unshift({ at: Date.now(), text: values[i]! < 1 && values[i]! > 0 ? `${name} ${values[i]!.toFixed(2)}` : name });
            p!.history.length = Math.min(p!.history.length, 8);
            if (gp.timestamp) pressRef.current?.(gp.timestamp);
          }
        });
        p.prevPressed = pressed;
        // The guided check moves on by itself when a step is done.
        if (step === "rest" && now - p.restStart > REST_MS) steps.current.set(gp.index, "circle");
        if (step === "circle" && p.sticks.every((s) => s.coverage() >= 0.9)) steps.current.set(gp.index, gp.mapping === "standard" ? "triggers" : "buttons");
        if (step === "triggers" && p.triggers.every((tp) => tp.max >= 0.95 && tp.returnMs !== null)) steps.current.set(gp.index, "buttons");
        if (step === "buttons" && Array.from({ length: Math.min(16, gp.buttons.length) }, (_, i) => i).every((i) => p!.seen.has(i))) steps.current.set(gp.index, "done");
        const pad = readGamepad(gp, padBits(padMapFor(input, gp.id)));
        list.push({ index: gp.index, id: identify(gp.id), mapping: gp.mapping || "—", axes, pressed, values, pad, triggers: trig, rumble: !!(gp as Gamepad & { vibrationActuator?: unknown }).vibrationActuator });
      }
      log.current.present(
        list.map((f) => f.index),
        wall,
      );
      setFrames(list);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [input]);

  const start = (index: number) => {
    const p = newProbes();
    p.restStart = performance.now();
    probes.current.set(index, p);
    steps.current.set(index, "rest");
    setTick((n) => n + 1);
  };
  const skip = (index: number) => {
    const cur = steps.current.get(index) ?? "idle";
    const i = STEPS.indexOf(cur as (typeof STEPS)[number]);
    steps.current.set(index, STEPS[Math.min(STEPS.length - 1, i + 1)]!);
    setTick((n) => n + 1);
  };
  const vibrate = (index: number, weak: number, strong: number) => {
    const gp = navigator.getGamepads()[index] as (Gamepad & { vibrationActuator?: { playEffect?: (type: string, params: object) => Promise<unknown> } }) | null;
    void gp?.vibrationActuator?.playEffect?.("dual-rumble", { duration: 500, weakMagnitude: weak, strongMagnitude: strong }).catch(() => undefined);
  };

  const padKey = frames.map((f) => f.index).join(",");
  const padList = useMemo(() => (padKey ? padKey.split(",").map(Number) : []), [padKey]);

  /** The report for an AI assistant, from everything measured so far. */
  const report = () => {
    const pads: ReportPad[] = [];
    for (const [index, stats] of log.current.stats) {
      const p = probes.current.get(index);
      const f = frames.find((x) => x.index === index);
      if (!p) continue;
      const id = identify(stats.id);
      const rest = p.rest.map((r) => (r.length > 20 ? restStats(r) : null));
      const standard = stats.mapping === "standard";
      pads.push({
        stats,
        brand: id.brand,
        model: id.modelName,
        vendor: id.vendor,
        product: id.product,
        rumble: f?.rumble ?? false,
        pollingHz: p.polling.hz(),
        pollingPeakHz: p.polling.peak,
        sticks: [0, 1].map((s) => ({
          name: s ? "Right" : "Left",
          drift: rest[s]?.drift ?? null,
          jitter: rest[s]?.jitter ?? null,
          circularity: p.sticks[s]!.circularity(),
          coverage: p.sticks[s]!.coverage(),
          maxRadius: p.sticks[s]!.maxRadius(),
          deadzone: p.deadzones[s]!.value(),
        })),
        triggers: standard ? p.triggers.map((tp, i) => ({ name: i ? "R2" : "L2", max: tp.max, returnMs: tp.returnMs, residual: tp.residual })) : [],
        checks: summary(p, rest, standard, stats.buttons.length).map((r) => ({ label: r.label, value: r.value, verdict: r.verdict ? t.padTest.verdict[r.verdict] : t.padTest.pending })),
      });
    }
    return buildReport(pads, log.current.lines, {
      date: new Date().toString(),
      userAgent: navigator.userAgent,
      platform: (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "",
      screenHz: hz,
      language: getLang(),
    });
  };
  const copy = () => {
    void navigator.clipboard?.writeText(report()).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    });
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([report()], { type: "text/markdown" }));
    const a = document.createElement("a");
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    a.href = url;
    a.download = `go-link-controller-report-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.md`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Without a controller the page's Input card already says how to connect one.
  if (!frames.length && !log.current.lines.length) return null;
  return (
    <div className="pad-tester-wrap">
      <div className="pad-tester-bar">
        <button type="button" className={`button button-secondary pad-tester-logbtn${showLog ? " is-on" : ""}`} aria-pressed={showLog} onClick={() => setShowLog(!showLog)}>
          <span className="pad-tester-prompt mono" aria-hidden="true">&gt;_</span>
          {showLog ? t.padTest.log.hide : t.padTest.log.show}
        </button>
        <button type="button" className="button button-secondary" onClick={copy}>
          <CopyIcon /> {copied ? t.padTest.log.copied : t.padTest.log.copy}
        </button>
        <button type="button" className="button button-secondary" onClick={download}>
          <DownloadIcon size={16} /> {t.padTest.log.download}
        </button>
        <span className="small muted pad-tester-bar-note">{t.padTest.log.note}</span>
      </div>
      <div className={`pad-tester-layout${showLog ? " has-log" : ""}`}>
        {showLog && <PadConsole log={log.current} pads={padList} />}
        <div className="pad-tester">
          {frames.map((f) => (
            <PadCard key={f.index} f={f} p={probes.current.get(f.index)!} step={steps.current.get(f.index) ?? "idle"} onStart={() => start(f.index)} onSkip={() => skip(f.index)} onVibrate={(w, s) => vibrate(f.index, w, s)} />
          ))}
          <p className="small muted pad-tester-brands">{t.padTest.brands}</p>
        </div>
      </div>
    </div>
  );
}

const fmt = (v: number, d = 2) => v.toFixed(d).replace(/^-0\.00$/, "0.00");
const pct = (v: number) => `${Math.round(v * 100)} %`;
/** The same value as a CSS length (no space). */
const cssPct = (v: number) => `${Math.min(100, Math.max(0, v * 100))}%`;

function VerdictChip({ v }: { v: Verdict | null }) {
  if (!v) return <span className="pt-chip">{t.padTest.pending}</span>;
  return <span className={`pt-chip is-${v}`}>{t.padTest.verdict[v]}</span>;
}

function PadCard({ f, p, step, onStart, onSkip, onVibrate }: { f: Frame; p: Probes; step: Step; onStart: () => void; onSkip: () => void; onVibrate: (weak: number, strong: number) => void }) {
  const rest = p.rest.map((s) => (s.length > 20 ? restStats(s) : null));
  const standard = f.mapping === "standard";
  const results = summary(p, rest, standard, f.pressed.length);
  return (
    <section className="card pad-card" aria-label={t.padTest.cardLabel(f.index + 1, f.id.modelName)}>
      <header className="pad-card-head">
        <span className="pad-card-num">{f.index + 1}</span>
        <div className="pad-card-name">
          <strong>{f.id.modelName}</strong>
          <span className="small muted">{[f.id.brand, f.id.vendor && `VID ${f.id.vendor} · PID ${f.id.product}`].filter(Boolean).join(" · ")}</span>
        </div>
        <span className="pt-chip is-info mono" title={t.padTest.hzTip}>
          {p.polling.hz() ? t.padTest.hz(p.polling.hz()) : p.polling.peak ? t.padTest.hzPeak(p.polling.peak) : t.padTest.hzIdle}
        </span>
      </header>
      <div className="pad-card-art">
        <ControllerModel model={f.id.model} pad={f.pad} triggers={f.triggers} label={t.padTest.art(f.id.modelName)} />
      </div>
      <dl className="pad-card-info">
        <div>
          <dt>{t.padTest.mapping}</dt>
          <dd className="mono">{f.mapping}</dd>
        </div>
        <div>
          <dt>{t.padTest.buttons}</dt>
          <dd className="mono">{f.pressed.length}</dd>
        </div>
        <div>
          <dt>{t.padTest.axes}</dt>
          <dd className="mono">{f.axes.length}</dd>
        </div>
        <div>
          <dt>{t.padTest.rumble}</dt>
          <dd>{f.rumble ? t.padTest.yes : t.padTest.no}</dd>
        </div>
      </dl>
      <p className="small muted">{t.padTest.connection}</p>

      <div className="pad-card-grid">
        {[0, 1].map((s) => (
          <StickScope key={s} title={s ? t.padTest.rightStick : t.padTest.leftStick} x={f.axes[s * 2] ?? 0} y={f.axes[s * 2 + 1] ?? 0} range={p.sticks[s]!} deadzone={p.deadzones[s]!.value()} drift={rest[s]?.drift ?? null} />
        ))}
        <section className="pt-panel" aria-label={t.padTest.triggers}>
          <h3>{t.padTest.triggers}</h3>
          {standard ? (
            (["L2", "R2"] as const).map((name, i) => {
              const tp = p.triggers[i]!;
              return (
                <div key={name} className="pt-trigger">
                  <div className="pt-row">
                    <span>{name}</span>
                    <span className="mono">
                      {pct(f.triggers[i]!)} · {t.padTest.max} {pct(tp.max)}
                    </span>
                  </div>
                  <div className="pt-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(f.triggers[i]! * 100)} aria-label={name}>
                    <span className="pt-bar-fill" style={{ width: cssPct(f.triggers[i]!) }} />
                    <span className="pt-bar-max" style={{ left: cssPct(tp.max) }} />
                  </div>
                  <div className="small muted mono">
                    {t.padTest.returnTime}: {tp.returnMs === null ? "—" : `${Math.round(tp.returnMs)} ms`} · {t.padTest.residual}: {tp.residual === null ? "—" : pct(tp.residual)}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="small muted">{t.padTest.noAnalogTriggers}</p>
          )}
          <h3>{t.padTest.vibration}</h3>
          {f.rumble ? (
            <div className="pt-buttons">
              <button type="button" className="button button-secondary" onClick={() => onVibrate(1, 0)}>
                {t.padTest.weak}
              </button>
              <button type="button" className="button button-secondary" onClick={() => onVibrate(0, 1)}>
                {t.padTest.strong}
              </button>
              <button type="button" className="button button-secondary" onClick={() => onVibrate(1, 1)}>
                {t.padTest.both}
              </button>
            </div>
          ) : (
            <p className="small muted">{t.padTest.noRumble}</p>
          )}
        </section>
        <section className="pt-panel" aria-label={t.padTest.rawButtons}>
          <h3>{t.padTest.rawButtons}</h3>
          <div className="pt-raw">
            {f.pressed.map((on, i) => (
              <span key={i} className={`pt-raw-b${on ? " is-on" : ""}${p.bounce.bounces[i] ? " is-bounce" : ""}`} title={`${i}: ${fmt(f.values[i] ?? 0)}`}>
                {i}
              </span>
            ))}
          </div>
          <h3>{t.padTest.history}</h3>
          <ul className="pt-history mono">
            {p.history.length === 0 && <li className="muted">{t.padTest.noHistory}</li>}
            {p.history.map((h, i) => (
              <li key={`${h.at}-${i}`}>
                <span>{h.text}</span>
                <span className="muted">{new Date(h.at).toLocaleTimeString(undefined, { hour12: false })}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="pt-guided" aria-live="polite">
        <div className="pt-row">
          <h3>{t.padTest.check}</h3>
          {step === "idle" || step === "done" ? (
            <button type="button" className="button button-primary" onClick={onStart}>
              {step === "done" ? t.padTest.again : t.padTest.start}
            </button>
          ) : (
            <button type="button" className="button button-secondary" onClick={onSkip}>
              {t.padTest.skip}
            </button>
          )}
        </div>
        {step !== "idle" && step !== "done" && (
          <p className="pt-step">
            <span className="pt-step-n">{STEPS.indexOf(step) + 1}/4</span> {t.padTest.steps[step]}
            {step === "circle" && ` (${pct(Math.min(p.sticks[0].coverage(), p.sticks[1].coverage()))})`}
            {step === "buttons" && ` (${p.seen.size}/${Math.min(16, f.pressed.length)})`}
          </p>
        )}
        <ul className="pt-results">
          {results.map((r) => (
            <li key={r.key}>
              <span>{r.label}</span>
              <span className="mono small">{r.value}</span>
              <VerdictChip v={r.verdict} />
            </li>
          ))}
        </ul>
        <p className="small muted">{t.padTest.gripTip}</p>
      </section>
    </section>
  );
}

/** The summary rows: every measurement with its verdict (null until measured). */
function summary(p: Probes, rest: ({ drift: number; jitter: number } | null)[], standard: boolean, buttons: number) {
  const rows: { key: string; label: string; value: string; verdict: Verdict | null }[] = [];
  (["left", "right"] as const).forEach((side, s) => {
    const name = side === "left" ? t.padTest.leftStick : t.padTest.rightStick;
    const r = rest[s];
    rows.push({ key: `drift-${s}`, label: `${name} · ${t.padTest.drift}`, value: r ? fmt(r.drift, 3) : "—", verdict: r ? driftVerdict(r.drift) : null });
    const c = p.sticks[s]!.circularity();
    rows.push({ key: `circle-${s}`, label: `${name} · ${t.padTest.circularity}`, value: c === null ? "—" : pct(c), verdict: c === null ? null : circularityVerdict(c) });
    const dz = p.deadzones[s]!.value();
    rows.push({ key: `dz-${s}`, label: `${name} · ${t.padTest.deadzone}`, value: dz === null ? "—" : fmt(dz), verdict: dz === null ? null : deadzoneVerdict(dz) });
  });
  if (standard) {
    (["L2", "R2"] as const).forEach((name, i) => {
      const tp = p.triggers[i]!;
      const measured = tp.max > 0.5 && (tp.returnMs !== null || tp.residual !== null);
      rows.push({ key: `trig-${i}`, label: `${name} · ${t.padTest.triggerHealth}`, value: measured ? `${pct(tp.max)} · ${tp.returnMs === null ? "—" : `${Math.round(tp.returnMs)} ms`}` : "—", verdict: measured ? triggerVerdict(tp) : null });
    });
  }
  const bounces = p.bounce.bounces.reduce((n, b) => n + (b ?? 0), 0);
  const tested = Math.min(16, buttons);
  const all = Array.from({ length: tested }, (_, i) => i).every((i) => p.seen.has(i));
  rows.push({ key: "buttons", label: t.padTest.buttonsWork, value: `${p.seen.size}/${tested}`, verdict: all ? (bounces ? "warn" : "good") : null });
  rows.push({ key: "bounce", label: t.padTest.bounce, value: String(bounces), verdict: p.seen.size ? (bounces === 0 ? "good" : bounces < 3 ? "warn" : "bad") : null });
  const peak = p.polling.peak;
  rows.push({ key: "polling", label: t.padTest.polling, value: peak ? t.padTest.hzPeak(peak) : "—", verdict: peak ? (peak >= 55 ? "good" : "warn") : null });
  return rows;
}

/** A stick's scope: the unit circle, the dead zone, the reach traced so far and where it is now. */
function StickScope({ title, x, y, range, deadzone, drift }: { title: string; x: number; y: number; range: StickRange; deadzone: number | null; drift: number | null }) {
  const R = 80;
  const c = 96;
  const reach = Array.from(range.reach)
    .map((r, i) => {
      if (!r) return null;
      const a = ((i + 0.5) / range.reach.length) * 2 * Math.PI - Math.PI;
      return `${c + Math.cos(a) * Math.min(r, 1.2) * R},${c + Math.sin(a) * Math.min(r, 1.2) * R}`;
    })
    .filter(Boolean);
  const circ = range.circularity();
  return (
    <section className="pt-panel" aria-label={title}>
      <div className="pt-row">
        <h3>{title}</h3>
        <span className="mono small muted">
          x {fmt(x)} · y {fmt(y)}
        </span>
      </div>
      <svg viewBox="0 0 192 192" className="pt-scope" aria-hidden="true">
        <circle cx={c} cy={c} r={R} className="pt-scope-gate" />
        {deadzone !== null && <circle cx={c} cy={c} r={deadzone * R} className="pt-scope-dz" />}
        <line x1={c - R} y1={c} x2={c + R} y2={c} className="pt-scope-axis" />
        <line x1={c} y1={c - R} x2={c} y2={c + R} className="pt-scope-axis" />
        {reach.length > 2 && <polygon points={reach.join(" ")} className="pt-scope-reach" />}
        <circle cx={c + x * R} cy={c + y * R} r={6} className="pt-scope-dot" />
      </svg>
      <dl className="pt-metrics">
        <div>
          <dt>{t.padTest.drift}</dt>
          <dd className={`mono${drift !== null ? ` is-${driftVerdict(drift)}` : ""}`}>{drift === null ? "—" : fmt(drift, 3)}</dd>
        </div>
        <div>
          <dt>{t.padTest.circularity}</dt>
          <dd className={`mono${circ !== null ? ` is-${circularityVerdict(circ)}` : ""}`}>{circ === null ? t.padTest.turnIt : pct(circ)}</dd>
        </div>
        <div>
          <dt>{t.padTest.deadzone}</dt>
          <dd className={`mono${deadzone !== null ? ` is-${deadzoneVerdict(deadzone)}` : ""}`}>{deadzone === null ? "—" : fmt(deadzone)}</dd>
        </div>
      </dl>
    </section>
  );
}
