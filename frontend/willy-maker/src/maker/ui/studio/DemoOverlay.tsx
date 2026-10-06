// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The demo's own layer: a see-through cover so nothing else is clicked
// while it runs, the step bar at the bottom left (progress, caption, Exit,
// and at the end Create my game, Watch again and Keep editing) and the
// pretend cursor, which glides to each place and flashes a square when it
// clicks.

import { useStudioText } from "../../i18n";
import { DEMO_STEPS, type DemoCursor } from "./demo";

export function DemoOverlay({ state, cursor, onExit, onCreate, onAgain, onKeep }: { state: { n: number; done: boolean }; cursor: DemoCursor | null; onExit: () => void; onCreate: () => void; onAgain: () => void; onKeep: () => void }) {
  const t = useStudioText().demoTour;
  return (
    <>
      <div className="studio-demo-cover" aria-hidden="true" />
      <div className="studio-demo" role="status" aria-live="polite">
        <div className="studio-demo-bars" aria-hidden="true">
          {Array.from({ length: DEMO_STEPS }, (_, i) => (
            <span key={i} className={i < state.n ? "is-on" : undefined} />
          ))}
        </div>
        <div className="studio-demo-body">
          <div className="studio-demo-text">
            <span className="studio-demo-kicker">{t.kicker(state.n, DEMO_STEPS)}</span>
            <span className="studio-demo-caption">{t.captions[state.n - 1]}</span>
          </div>
          {!state.done && (
            <button type="button" className="btn studio-demo-btn" onClick={onExit}>
              {t.exit}
            </button>
          )}
        </div>
        {state.done && (
          <div className="studio-demo-actions">
            <button type="button" className="btn btn-primary" onClick={onCreate}>
              {t.create}
            </button>
            <button type="button" className="btn studio-demo-btn" onClick={onAgain}>
              {t.again}
            </button>
            <button type="button" className="btn studio-demo-btn is-plain" onClick={onKeep}>
              {t.keep}
            </button>
          </div>
        )}
      </div>
      {cursor && (
        <div className="studio-demo-cursor" style={{ left: cursor.x, top: cursor.y, transition: `left ${cursor.t}ms ease, top ${cursor.t}ms ease` }} aria-hidden="true">
          {cursor.down && <span className="studio-demo-press" />}
          <svg width="26" height="26" viewBox="0 0 24 24">
            <path d="M4 3l16 7-7 2-3 8z" fill="var(--color-text)" stroke="var(--color-bg)" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </>
  );
}
