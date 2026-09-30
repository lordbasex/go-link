// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Groups of atoms (atomic design: molecules): the HUD bar, the weapons, the
// controls table and the touch pad.

import { useRef } from "react";
import type { Stats } from "../engine/game";
import type { TouchState } from "../host/input";
import type { DestroyMessages } from "../messages";
import { CivilianIcon, CounterChip, WeaponChip } from "./atoms";

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
export const formatTime = clock;
/** A share as a percent, with a decimal while it is small (so the first breaks show). */
export const percent = (v: number) => `${v < 0.1 ? (Math.floor(v * 1000) / 10).toFixed(1) : Math.floor(v * 100)} %`;

/** How many person icons the HUD shows before "+n". */
const HUD_ICONS = 5;

/**
 * The HUD: the people of this run (a few icons and "+n"), how many are
 * rescued, the mission countdown (red and blinking in the last minute), and
 * under it the mission bar with its two parts (destroyed and rescued).
 */
export function HudBar({ m, people, stats }: { m: DestroyMessages; people: { style: Record<string, string>; rescued: boolean; name: string }[]; stats: Stats }) {
  const late = stats.timeLeft < 60;
  // Never 100 until the mission is complete; a decimal while it is small.
  const raw = stats.progress * 100;
  const percent = stats.progress >= 1 ? 100 : raw < 10 ? Math.floor(raw * 10) / 10 : Math.min(99, Math.floor(raw));
  const destroyed = Math.floor(stats.destroyed * 100);
  const tip = m.hud.progressTip(destroyed, stats.rescued, stats.people);
  return (
    <div className="dz-hud-top">
      <div className="dz-hudbar" role="status" aria-label={m.hud.label}>
        <span className="dz-rec dz-px">● {m.mission}</span>
        <span className="dz-people">
          {people.slice(0, HUD_ICONS).map((p) => (
            <CivilianIcon key={p.name} {...p} />
          ))}
          {people.length > HUD_ICONS && <span className="dz-mono dz-muted dz-more">+{people.length - HUD_ICONS}</span>}
        </span>
        <CounterChip label="" value={m.hud.rescued(stats.rescued, stats.people)} tone="ok" />
        {stats.enemies > 0 && <span className="dz-chip dz-mono is-danger">{m.hud.enemies(stats.enemies - stats.defeated)}</span>}
        {stats.chasing > 0 && <span className="dz-chip dz-mono dz-chasing">{m.hud.chasing(stats.chasing)}</span>}
        <span className="dz-life" role="img" aria-label={`${m.hud.lives(stats.lives, 4)} · ${m.hud.health} ${Math.round(stats.health)} %`}>
          {Array.from({ length: 4 }, (_, i) => (
            <svg key={i} className={`dz-heart${i < stats.lives ? " is-on" : ""}`} width="14" height="13" viewBox="0 0 14 13" aria-hidden="true">
              <path d="M7 12.5C3 9.4.5 7.2.5 4.2A3.4 3.4 0 0 1 7 2.6a3.4 3.4 0 0 1 6.5 1.6c0 3-2.5 5.2-6.5 8.3z" />
            </svg>
          ))}
          <span className="dz-health">
            <span className="dz-health-fill" style={{ width: `${Math.max(0, stats.health)}%` }} />
          </span>
        </span>
        <span className={`dz-clock${late ? " is-late" : ""}`}>
          <span className="dz-chip-label">{m.hud.missionTime}</span> <b className="dz-mono">{clock(Math.ceil(stats.timeLeft))}</b>
        </span>
      </div>
      <div className={`dz-progress${percent >= 90 ? " is-near" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={m.hud.progress(percent)} title={tip}>
        <span className="dz-progress-label dz-mono">{m.hud.progress(percent)}</span>
        {/* The bar and its two thin marks (destroyed, rescued) are one block, centered beside the label. */}
        <span className="dz-progress-meter">
          <span className="dz-progress-track">
            <span className="dz-progress-fill" style={{ width: `${percent}%` }} />
          </span>
          <span className="dz-progress-parts" aria-hidden="true">
            <span className="dz-part is-destroyed" style={{ width: `${destroyed}%` }} />
            <span className="dz-part is-rescued" style={{ width: `${stats.people ? (stats.rescued / stats.people) * 100 : 100}%` }} />
          </span>
        </span>
        <span className="dz-progress-tip dz-muted">{tip}</span>
      </div>
    </div>
  );
}

export function WeaponBar({ m, firing }: { m: DestroyMessages; firing?: boolean }) {
  return (
    <div className="dz-weapons" aria-label={m.weapons.label}>
      <WeaponChip name={m.weapons.gun} keys="J · 3" active={firing} />
      <WeaponChip name={m.weapons.knife} keys="K · 2" />
      <WeaponChip name={m.weapons.bazooka} keys="L · 4" />
    </div>
  );
}

/** The on-screen pad for touch screens: move on the left, actions on the right. */
export function TouchPad({ m, touch }: { m: DestroyMessages; touch: TouchState }) {
  const knob = useRef<HTMLSpanElement>(null);
  const moveFrom = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    touch.moveX = Math.abs(dx) < 0.15 ? 0 : Math.max(-1, Math.min(1, dx * 1.3));
    touch.down = dy > 0.45;
    touch.up = dy < -0.45;
    if (knob.current) knob.current.style.transform = `translate(${(Math.max(-1, Math.min(1, dx)) * r.width * 0.3).toFixed(0)}px, ${(Math.max(-1, Math.min(1, dy)) * r.height * 0.3).toFixed(0)}px)`;
  };
  const stop = () => {
    touch.moveX = 0;
    touch.down = false;
    touch.up = false;
    if (knob.current) knob.current.style.transform = "";
  };
  const hold = (key: "jump" | "fire" | "knife" | "bazooka") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      touch[key] = true;
    },
    onPointerUp: () => (touch[key] = false),
    onPointerCancel: () => (touch[key] = false),
    onPointerLeave: () => (touch[key] = false),
  });
  return (
    <div className="dz-touch" aria-label={m.touch.label}>
      <div
        className="dz-stick"
        role="slider"
        aria-label={m.touch.move}
        aria-valuemin={-1}
        aria-valuemax={1}
        aria-valuenow={0}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          moveFrom(e);
        }}
        onPointerMove={(e) => e.buttons && moveFrom(e)}
        onPointerUp={stop}
        onPointerCancel={stop}
      >
        <span ref={knob} className="dz-knob" />
      </div>
      <div className="dz-actions">
        <button type="button" className="dz-act is-bazooka" {...hold("bazooka")}>
          {m.touch.bazooka}
        </button>
        <button type="button" className="dz-act is-fire" {...hold("fire")}>
          {m.touch.fire}
        </button>
        <button type="button" className="dz-act is-knife" {...hold("knife")}>
          {m.touch.knife}
        </button>
        <button type="button" className="dz-act is-jump" {...hold("jump")}>
          {m.touch.jump}
        </button>
      </div>
    </div>
  );
}
