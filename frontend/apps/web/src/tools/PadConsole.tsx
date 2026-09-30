// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { LOG_KINDS, clock, type LogKind, type PadLog } from "./padLog";

/** Lines drawn at once (the log keeps more, and the report takes them all). */
const SHOWN = 500;

/**
 * The event log as a terminal: every button, stick, trigger and connection
 * change of every controller, newest at the bottom, with filters, pause and
 * clear. It repaints on its own timer, not on every frame of the tester.
 */
export const PadConsole = memo(function PadConsole({ log, pads }: { log: PadLog; pads: readonly number[] }) {
  const [, setTick] = useState(0);
  const [kinds, setKinds] = useState<ReadonlySet<LogKind>>(() => new Set(LOG_KINDS));
  const [pad, setPad] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const frozen = useRef<typeof log.lines | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const seen = useRef(-1);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (log.total !== seen.current) {
        seen.current = log.total;
        setTick((n) => n + 1);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [log]);

  const source = paused ? (frozen.current ?? log.lines) : log.lines;
  const shown = source.filter((l) => kinds.has(l.kind) && (pad === null || l.pad === pad)).slice(-SHOWN);

  // Stay at the bottom unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = body.current;
    if (el && follow.current) el.scrollTop = el.scrollHeight;
  });

  const toggle = (k: LogKind) =>
    setKinds((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <section className="pad-console stage-tokens" aria-label={t.padTest.log.title}>
      <header className="pad-console-head">
        <span className="pad-console-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <strong className="mono">{t.padTest.log.title}</strong>
        <span className="mono small pad-console-count">{t.padTest.log.count(log.lines.length)}</span>
      </header>
      <div className="pad-console-bar">
        <div className="pad-console-filters" role="group" aria-label={t.padTest.log.filters}>
          {LOG_KINDS.map((k) => (
            <button key={k} type="button" className={`pad-console-chip is-${k}${kinds.has(k) ? " is-on" : ""}`} aria-pressed={kinds.has(k)} onClick={() => toggle(k)}>
              {t.padTest.log.kinds[k]}
            </button>
          ))}
          {pads.length > 1 && (
            <>
              <button type="button" className={`pad-console-chip${pad === null ? " is-on" : ""}`} aria-pressed={pad === null} onClick={() => setPad(null)}>
                {t.padTest.log.allPads}
              </button>
              {pads.map((i) => (
                <button key={i} type="button" className={`pad-console-chip${pad === i ? " is-on" : ""}`} aria-pressed={pad === i} onClick={() => setPad(i)}>
                  P{i + 1}
                </button>
              ))}
            </>
          )}
        </div>
        <div className="pad-console-actions">
          <button
            type="button"
            className="button button-secondary button-compact"
            onClick={() => {
              frozen.current = paused ? null : [...log.lines];
              setPaused(!paused);
            }}
          >
            {paused ? t.padTest.log.resume : t.padTest.log.pause}
          </button>
          <button
            type="button"
            className="button button-secondary button-compact"
            onClick={() => {
              log.clear();
              frozen.current = paused ? [] : null;
              setTick((n) => n + 1);
            }}
          >
            {t.padTest.log.clear}
          </button>
        </div>
      </div>
      <div
        ref={body}
        className="pad-console-body mono"
        role="log"
        aria-live="off"
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {shown.length === 0 && <div className="pad-console-empty">{t.padTest.log.empty}</div>}
        {shown.map((l, i) => (
          <div key={`${l.at}-${i}`} className={`pad-console-line is-${l.kind}`}>
            <span className="pad-console-time">{clock(l.at)}</span>
            <span className="pad-console-pad">P{l.pad + 1}</span>
            <span className="pad-console-text">{l.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
});
