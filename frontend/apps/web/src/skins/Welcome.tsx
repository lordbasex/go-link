// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { t } from "../i18n";

/** Set once the welcome was closed or finished: the editor opens straight away after that. */
export const WELCOME_KEY = "go-link.skin-editor.welcome";

/** True the first time (storage may be blocked: then it shows, and never crashes). */
export function welcomeNeeded(): boolean {
  try {
    return window.localStorage.getItem(WELCOME_KEY) !== "1";
  } catch {
    return true;
  }
}

export function markWelcomeSeen(): void {
  try {
    window.localStorage.setItem(WELCOME_KEY, "1");
  } catch {
    // Blocked storage: it shows again next time, which is fine.
  }
}

// The steps' pictures, drawn in the site's colors (no image files).

/** A phone with a console shell around the game. */
function ArtSkin() {
  return (
    <svg viewBox="0 0 240 150" className="sw-art" aria-hidden="true">
      <rect x="70" y="6" width="100" height="138" rx="16" className="sw-shell" />
      <rect x="80" y="18" width="80" height="56" rx="4" className="sw-screen" />
      <rect x="84" y="22" width="72" height="48" className="sw-game" />
      <path d="M96 96h8v-8h8v8h8v8h-8v8h-8v-8h-8z" className="sw-part" />
      <circle cx="140" cy="94" r="6" className="sw-part" />
      <circle cx="152" cy="104" r="6" className="sw-part" />
      <circle cx="140" cy="114" r="6" className="sw-part is-on" />
      <rect x="92" y="126" width="22" height="8" rx="4" className="sw-part" />
      <rect x="126" y="126" width="22" height="8" rx="4" className="sw-part" />
      <path d="M174 56q12 -12 24 -8" className="sw-line" />
      <text x="208" y="46" className="sw-code">{"{ }"}</text>
      <text x="208" y="66" className="sw-small">JSON</text>
    </svg>
  );
}

/** The canvas: layers on the left, the phone with a selected part and its handles. */
function ArtCanvas() {
  return (
    <svg viewBox="0 0 240 150" className="sw-art" aria-hidden="true">
      <rect x="6" y="10" width="52" height="130" rx="8" className="sw-panel" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x="14" y={20 + i * 18} width="36" height="8" rx="4" className={i === 2 ? "sw-part is-on" : "sw-part"} />
      ))}
      <rect x="110" y="8" width="84" height="134" rx="14" className="sw-shell" />
      <rect x="118" y="18" width="68" height="46" rx="3" className="sw-screen" />
      <rect x="120" y="82" width="34" height="34" className="sw-select" />
      {[
        [120, 82],
        [154, 82],
        [120, 116],
        [154, 116],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x! - 3} y={y! - 3} width="6" height="6" className="sw-handle" />
      ))}
      <path d="M128 99h18M137 90v18" className="sw-line" />
      <path d="M70 60l18 0M84 55l5 5-5 5" className="sw-arrow" />
    </svg>
  );
}

/** Rulers, a dashed guide and a part snapping to it with the magnet. */
function ArtPrecision() {
  return (
    <svg viewBox="0 0 240 150" className="sw-art" aria-hidden="true">
      <rect x="20" y="8" width="210" height="12" className="sw-ruler" />
      <rect x="8" y="20" width="12" height="122" className="sw-ruler" />
      {Array.from({ length: 20 }, (_, i) => (
        <path key={`x${i}`} d={`M${24 + i * 10} 20v${i % 5 ? -4 : -8}`} className="sw-tick" />
      ))}
      {Array.from({ length: 12 }, (_, i) => (
        <path key={`y${i}`} d={`M20 ${24 + i * 10}h${i % 5 ? -4 : -8}`} className="sw-tick" />
      ))}
      <path d="M124 20v122" className="sw-guide" />
      <path d="M20 84h210" className="sw-guide" />
      <rect x="124" y="84" width="46" height="30" rx="6" className="sw-part is-on" />
      <path d="M58 118v-16a14 14 0 0 1 28 0v16M58 110h8M78 110h8" className="sw-magnet" />
      <rect x="170" y="118" width="60" height="22" rx="11" className="sw-panel" />
      <text x="200" y="133" className="sw-small">70 %</text>
    </svg>
  );
}

/** Colors, a plate, a speaker grill and the button designs. */
function ArtStyle() {
  return (
    <svg viewBox="0 0 240 150" className="sw-art" aria-hidden="true">
      <rect x="14" y="10" width="110" height="130" rx="18" className="sw-shell" />
      <rect x="26" y="96" width="44" height="32" rx="8" className="sw-plate" />
      {Array.from({ length: 4 }, (_, r) =>
        Array.from({ length: 5 }, (_, c) => <circle key={`${r}-${c}`} cx={86 + c * 7} cy={104 + r * 7} r="2" className="sw-hole" />),
      )}
      <circle cx="50" cy="44" r="16" className="sw-dome" />
      <circle cx="50" cy="44" r="19" className="sw-well" />
      <path d="M84 32h24v24h-24z" transform="rotate(45 96 44)" className="sw-part" />
      {["var(--color-p1)", "var(--color-p2)", "var(--color-p3)", "var(--color-p4)", "var(--color-ok)"].map((c, i) => (
        <circle key={c} cx={150 + (i % 3) * 30} cy={36 + Math.floor(i / 3) * 34} r="11" style={{ fill: c }} />
      ))}
      <rect x="140" y="104" width="86" height="12" rx="6" className="sw-panel" />
      <circle cx="176" cy="110" r="7" className="sw-part is-on" />
    </svg>
  );
}

/** The checks' ticks, the Design/Split/Code views and the export going to a phone. */
function ArtExport() {
  return (
    <svg viewBox="0 0 240 150" className="sw-art" aria-hidden="true">
      <rect x="8" y="12" width="96" height="84" rx="10" className="sw-panel" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <path d={`M18 ${34 + i * 22}l6 6 10-12`} className={i === 2 ? "sw-warn" : "sw-ok"} />
          <rect x="42" y={31 + i * 22} width="52" height="8" rx="4" className="sw-part" />
        </g>
      ))}
      <rect x="8" y="108" width="96" height="26" rx="13" className="sw-panel" />
      <rect x="12" y="112" width="30" height="18" rx="9" className="sw-part is-on" />
      <path d="M126 64h30M148 56l8 8-8 8" className="sw-arrow" />
      <text x="142" y="92" className="sw-code">.json</text>
      <rect x="176" y="18" width="52" height="118" rx="12" className="sw-shell" />
      <rect x="183" y="30" width="38" height="28" rx="3" className="sw-screen" />
      <circle cx="194" cy="90" r="6" className="sw-part" />
      <circle cx="212" cy="96" r="6" className="sw-part is-on" />
    </svg>
  );
}

const ART: readonly (() => ReactNode)[] = [ArtSkin, ArtCanvas, ArtPrecision, ArtStyle, ArtExport];

/**
 * The skin editor's welcome: what the tool is for and how it works, in five
 * short steps. It opens by itself on the first visit and from the Guide
 * button; closing or finishing it remembers that it was seen.
 */
export function SkinEditorWelcome({ onClose, onManual }: { onClose: () => void; onManual: () => void }) {
  const w = t.skinEditor.welcome;
  const steps = w.steps;
  const [i, setI] = useState(0);
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const last = i === steps.length - 1;

  const close = () => {
    markWelcomeSeen();
    onClose();
  };
  const next = () => setI((n) => Math.min(steps.length - 1, n + 1));
  const back = () => setI((n) => Math.max(0, n - 1));

  useEffect(() => {
    first.current?.focus();
  }, [i]);

  useEffect(() => {
    // Capture phase: the editor's own shortcuts (arrows nudge, keys pick
    // tools) must not run while the welcome is open.
    const onKey = (ev: KeyboardEvent) => {
      const el = box.current;
      if (!el) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        markWelcomeSeen();
        onClose();
      } else if (ev.key === "ArrowRight") {
        ev.preventDefault();
        setI((n) => Math.min(steps.length - 1, n + 1));
      } else if (ev.key === "ArrowLeft") {
        ev.preventDefault();
        setI((n) => Math.max(0, n - 1));
      } else if (ev.key === "Tab") {
        // Keep the focus inside the dialog.
        const items = [...el.querySelectorAll<HTMLElement>("button, a[href]")].filter((b) => !b.hasAttribute("disabled"));
        if (!items.length) return;
        const at = items.indexOf(document.activeElement as HTMLElement);
        const to = ev.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : at === items.length - 1 ? 0 : at + 1;
        ev.preventDefault();
        items[to]!.focus();
      }
      // Other keys keep their default (Enter and Space press buttons) but never reach the editor.
      ev.stopPropagation();
    };
    const swallow = (ev: KeyboardEvent) => ev.stopPropagation();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", swallow, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", swallow, true);
    };
  }, [onClose, steps.length]);

  const step = steps[i]!;
  const Art = ART[i]!;
  return (
    <div className="dialog-backdrop sw-backdrop" onMouseDown={(ev) => ev.target === ev.currentTarget && close()}>
      <div ref={box} className="dialog sw-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="sw-head">
          <span className="sw-eyebrow">{w.eyebrow}</span>
          <span className="sw-count mono">{w.stepOf(i + 1, steps.length)}</span>
          <button
            type="button"
            className="sw-manual text-link"
            onClick={() => {
              markWelcomeSeen();
              onManual();
            }}
          >
            {w.manualLink}
          </button>
          <button type="button" className="icon-button sw-close" aria-label={w.close} data-tip={w.close} onClick={close}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="sw-body" aria-live="polite">
          <div className="sw-art-box">
            <Art />
          </div>
          <div className="sw-text">
            <h2 id={titleId} className="dialog-title">
              {step.title}
            </h2>
            <p>{step.text}</p>
            <ul className="sw-points">
              {step.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="sw-dots" role="tablist" aria-label={w.stepsLabel}>
          {steps.map((s, n) => (
            <button key={s.title} type="button" role="tab" aria-selected={n === i} aria-label={s.title} className={`sw-dot${n === i ? " is-on" : ""}`} onClick={() => setI(n)} />
          ))}
        </div>
        <div className="dialog-actions sw-actions">
          {last ? (
            <>
              <button ref={first} type="button" className="button button-primary" onClick={close}>
                {w.start}
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  markWelcomeSeen();
                  onManual();
                }}
              >
                {w.manual}
              </button>
              <span className="sw-spacer" />
              <button type="button" className="button button-secondary" onClick={back}>
                {w.back}
              </button>
            </>
          ) : (
            <>
              <button ref={first} type="button" className="button button-primary" onClick={next}>
                {w.next}
              </button>
              {i > 0 && (
                <button type="button" className="button button-secondary" onClick={back}>
                  {w.back}
                </button>
              )}
              <span className="sw-spacer" />
              <button type="button" className="button button-secondary" onClick={close}>
                {w.skip}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
