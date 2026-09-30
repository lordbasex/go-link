// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The game's screens (atomic design: organisms): the mission briefing with
// the alarm, the HUD while playing, the pause menu and the mission complete.

import { useEffect, useState } from "react";
import type { Stats } from "../engine/game";
import type { DestroyMessages } from "../messages";
import { CapsuleButton } from "./atoms";
import { HudBar, WeaponBar, formatTime, percent } from "./molecules";
import { ControlsHelp } from "./help";

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      {muted ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M17 8a5 5 0 0 1 0 8M19.5 5.5a8.5 8.5 0 0 1 0 13" />}
    </svg>
  );
}

export interface PersonView {
  style: Record<string, string>;
  rescued: boolean;
  name: string;
  /** How many of this kind were saved (the final screen). */
  count?: number;
}

/** The red alarm around the page: a pulsing vignette and two beacons. */
export function Alarm({ strong }: { strong: boolean }) {
  return (
    <div className={`dz-alarm${strong ? " is-strong" : ""}`} aria-hidden="true">
      <span className="dz-beacon is-left">
        <i />
      </span>
      <span className="dz-beacon is-right">
        <i />
      </span>
    </div>
  );
}

/** Willy's portrait: his idle animation, scaled up crisp. */
function HeroPortrait({ frame, name }: { frame: (i: number) => Record<string, string>; name: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setI((n) => (n + 1) % 4), 260);
    return () => window.clearInterval(id);
  }, []);
  return (
    <figure className="dz-portrait">
      <span className="dz-person is-big dz-crisp" style={frame(i) as React.CSSProperties} aria-hidden="true" />
      <figcaption className="dz-px is-accent">{name}</figcaption>
    </figure>
  );
}

export interface FoeView {
  name: string;
  style: Record<string, string>;
  count?: number;
}

export function Briefing({ m, people, foes, count, ready, error, muted, hero, onStart, onCancel, onMute }: { m: DestroyMessages; people: PersonView[]; foes: FoeView[]; count: number; ready: boolean; error: boolean; muted: boolean; hero: (i: number) => Record<string, string>; onStart: () => void; onCancel: () => void; onMute: () => void }) {
  // One screen, no scrolling to start: head, a two-column body (the story on
  // the left, the controls help on the right) that scrolls inside if it must,
  // and the actions in a bar that is always visible.
  return (
    <div className="dz-modal is-brief" role="dialog" aria-modal="true" aria-labelledby="dz-brief-title">
      <div className="dz-card is-alert dz-brief">
        <header className="dz-brief-head">
          <span className="dz-px dz-blink is-danger">⚠ {m.alert}</span>
          <h2 id="dz-brief-title" className="dz-px">
            {m.mission}
          </h2>
        </header>
        <div className="dz-brief-body">
          <div className="dz-brief-story">
            <div className="dz-story">
              <HeroPortrait frame={hero} name={m.hero} />
              <p className="dz-lead">{m.briefing(count, 10, foes.length > 0)}</p>
            </div>
            <div className="dz-brief-rosters">
              <div className="dz-roster">
                <span className="dz-roster-title dz-px">{m.toRescue(count)}</span>
                <div className="dz-lineup">
                  {people.map((p) => (
                    <span key={p.name} className="dz-lineup-person">
                      <span className="dz-person is-big" style={p.style as React.CSSProperties} aria-hidden="true" />
                      <span className="dz-muted">{p.name}</span>
                    </span>
                  ))}
                </div>
              </div>
              {foes.length > 0 && (
                <div className="dz-roster">
                  <span className="dz-roster-title dz-px is-danger">{m.wanted}</span>
                  <div className="dz-lineup">
                    {foes.map((f) => (
                      <span key={f.name} className="dz-lineup-person dz-wanted">
                        <span className="dz-person is-big dz-crisp" style={f.style as React.CSSProperties} aria-hidden="true" />
                        <span>{f.name}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <ControlsHelp m={m} idBase="dz-brief-help" />
        </div>
        <footer className="dz-brief-actions">
          {error ? (
            <p className="dz-muted">{m.error}</p>
          ) : (
            <CapsuleButton tone="danger" onClick={onStart} autoFocus>
              {ready ? `▶ ${m.start}` : m.loading}
            </CapsuleButton>
          )}
          <CapsuleButton onClick={onCancel}>{m.notNow}</CapsuleButton>
          <CapsuleButton onClick={onMute} pressed={!muted} label={muted ? m.hud.soundOn : m.hud.soundOff}>
            <SpeakerIcon muted={muted} />
          </CapsuleButton>
          <span className="dz-px dz-blink dz-press is-accent">{m.pressStart}</span>
        </footer>
      </div>
    </div>
  );
}

export function Hud({ m, people, stats, muted, controller, onPause, onExit, onMute, onRestart, onUnstuck }: { m: DestroyMessages; people: PersonView[]; stats: Stats; muted: boolean; controller: string | null; onPause: () => void; onExit: () => void; onMute: () => void; onRestart: () => void; onUnstuck: () => void }) {
  return (
    <>
      <HudBar m={m} people={people} stats={stats} />
      <div className="dz-bottom is-left">
        <WeaponBar m={m} />
        {controller && <span className="dz-muted dz-small">{m.hud.controller(controller)}</span>}
      </div>
      <div className="dz-bottom is-right">
        <CapsuleButton onClick={onMute} pressed={!muted} label={muted ? m.hud.soundOn : m.hud.soundOff}>
          <SpeakerIcon muted={muted} />
        </CapsuleButton>
        <CapsuleButton onClick={onUnstuck}>{m.hud.unstuck}</CapsuleButton>
        <CapsuleButton onClick={onRestart}>{m.hud.restart}</CapsuleButton>
        <CapsuleButton onClick={onPause}>{m.hud.pause}</CapsuleButton>
        <CapsuleButton tone="danger" onClick={onExit}>
          {m.hud.exit}
        </CapsuleButton>
      </div>
    </>
  );
}

export function PauseMenu({ m, resized, onResume, onExit, onRestart, onUnstuck }: { m: DestroyMessages; resized: boolean; onResume: () => void; onExit: () => void; onRestart: () => void; onUnstuck: () => void }) {
  return (
    <div className="dz-modal" role="dialog" aria-modal="true" aria-labelledby="dz-pause-title">
      <div className="dz-card dz-pause">
        <h2 id="dz-pause-title" className="dz-px">
          {m.paused.title}
        </h2>
        {resized && <p className="dz-lead">{m.paused.resized}</p>}
        <ControlsHelp m={m} idBase="dz-pause-help" />
        <div className="dz-row">
          <CapsuleButton tone="primary" onClick={onResume} autoFocus>
            {m.paused.resume}
          </CapsuleButton>
          <CapsuleButton onClick={onUnstuck}>{m.hud.unstuck}</CapsuleButton>
          <CapsuleButton onClick={onRestart}>{m.hud.restart}</CapsuleButton>
          <CapsuleButton tone="danger" onClick={onExit}>
            {m.paused.exit}
          </CapsuleButton>
        </div>
      </div>
    </div>
  );
}

export function CompleteScreen({ m, people, foes, stats, onRebuild, onKeep, onAgain }: { m: DestroyMessages; people: PersonView[]; foes: FoeView[]; stats: Stats; onRebuild: () => void; onKeep: () => void; onAgain: () => void }) {
  const rows: [string, string][] = [
    [m.complete.timeUsed, formatTime(stats.time)],
    [m.complete.timeLeft, formatTime(Math.ceil(stats.timeLeft))],
    [m.complete.destroyed, percent(stats.destroyed)],
    [m.complete.shots, String(stats.shots)],
    [m.complete.rockets, String(stats.rockets)],
  ];
  return (
    <div className="dz-modal" role="dialog" aria-modal="true" aria-labelledby="dz-done-title">
      <div className="dz-card is-done">
        <h2 id="dz-done-title" className="dz-px is-ok">
          {m.complete.title}
        </h2>
        <p className="dz-lead">{m.complete.text}</p>
        <div className="dz-lineup">
          {people.map((p) => (
            <span key={p.name} className="dz-lineup-person">
              <span className="dz-person is-big dz-cheer" style={p.style as React.CSSProperties} aria-hidden="true" />
              <span>
                {p.name} <b className="dz-mono is-ok">×{p.count ?? 0}</b>
              </span>
            </span>
          ))}
        </div>
        {foes.length > 0 && (
          <div className="dz-roster is-center">
            <span className="dz-roster-title dz-px is-danger">{m.complete.defeated}</span>
            <div className="dz-lineup">
              {foes.map((f) => (
                <span key={f.name} className="dz-lineup-person">
                  <span className="dz-person is-big dz-crisp" style={f.style as React.CSSProperties} aria-hidden="true" />
                  <span>
                    {f.name} <b className="dz-mono is-danger">×{f.count ?? 0}</b>
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
        <dl className="dz-stats">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd className="dz-mono is-accent">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="dz-row">
          <CapsuleButton tone="primary" onClick={onRebuild} autoFocus>
            {m.complete.rebuild}
          </CapsuleButton>
          <CapsuleButton onClick={onKeep}>{m.complete.keepPlaying}</CapsuleButton>
          <CapsuleButton onClick={onAgain}>{m.complete.again}</CapsuleButton>
        </div>
      </div>
    </div>
  );
}

/** Time ran out: MISSION ABORTED, what was done, and try again or rebuild. */
export function FailedScreen({ m, stats, cause, onAgain, onRebuild }: { m: DestroyMessages; stats: Stats; cause: "timeout" | "dead" | null; onAgain: () => void; onRebuild: () => void }) {
  const rows: [string, string][] = [
    [m.complete.timeUsed, formatTime(stats.time)],
    [m.complete.destroyed, percent(stats.destroyed)],
    [m.failed.rescued, `${stats.rescued}/${stats.people}`],
    [m.complete.shots, String(stats.shots)],
  ];
  return (
    <div className="dz-modal" role="dialog" aria-modal="true" aria-labelledby="dz-failed-title">
      <div className="dz-card is-alert is-failed">
        <h2 id="dz-failed-title" className="dz-px is-danger">
          {m.failed.title}
        </h2>
        <p className="dz-lead">{cause === "dead" ? m.failed.textDead : m.failed.text}</p>
        <dl className="dz-stats">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd className="dz-mono is-accent">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="dz-row">
          <CapsuleButton tone="primary" onClick={onAgain} autoFocus>
            {m.failed.again}
          </CapsuleButton>
          <CapsuleButton onClick={onRebuild}>{m.failed.rebuild}</CapsuleButton>
        </div>
      </div>
    </div>
  );
}
