// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The adaptive controls help (atomic design): a tab atom, a key cap atom,
// the legend and the three views (molecules) and the ControlsHelp organism
// that the briefing and the pause menu share. With a controller connected
// it shows that controller's own drawing (recognized by its USB id, like the
// site's controller test), names every button as the controller prints it
// and lights what is pressed; without one it asks for a button press, since
// browsers list a controller only after one.

import { useEffect, useState } from "react";
import { Button, type Pad } from "@go-link/shared";
import { loadPadConfig, readPad } from "../host/pad";
import { ControllerModel } from "../../controllers/ControllerModel";
import { buttonNames, identify, type ButtonNames, type ControllerIdentity } from "../../controllers/controllerModels";
import type { DestroyMessages } from "../messages";

type Tab = "pad" | "keys" | "touch";

/** The first connected controller and what it presses now, polled every frame while shown. */
export function useGamepad(): { id: ControllerIdentity; pad: Pad; pressed: readonly boolean[]; triggers: [number, number] } | null {
  const [state, setState] = useState<ReturnType<typeof useGamepad>>(null);
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return;
    let raf = 0;
    let last = "";
    // The site's map for each controller model, like the controller test.
    const cfg = loadPadConfig(typeof window === "undefined" ? undefined : window);
    const loop = () => {
      let found: ReturnType<typeof useGamepad> = null;
      for (const gp of navigator.getGamepads()) {
        if (!gp || !gp.connected) continue;
        const pressed = gp.buttons.map((b) => b.pressed || b.value > 0.5);
        const pad = readPad(gp, cfg);
        // Analog triggers where the pad has them; a remapped pad's trigger buttons show full.
        const triggers: [number, number] =
          gp.mapping === "standard" ? [gp.buttons[6]?.value ?? 0, gp.buttons[7]?.value ?? 0] : [pad.buttons & Button.L2 ? 1 : 0, pad.buttons & Button.R2 ? 1 : 0];
        found = { id: identify(gp.id), pad, pressed, triggers };
        break;
      }
      // Re-render only when something changed (the id or what is held).
      const key = found ? `${found.id.modelName}|${found.pad.buttons}|${found.pad.axes.map((a) => Math.round(a / 32)).join(",")}|${found.triggers.map((v) => Math.round(v * 4)).join(",")}` : "";
      if (key !== last) {
        last = key;
        setState(found);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return state;
}

// ---------------------------------------------------------------- atoms

function TabButton({ on, onClick, children, id, controls }: { on: boolean; onClick: () => void; children: string; id: string; controls: string }) {
  return (
    <button type="button" role="tab" id={id} aria-selected={on} aria-controls={controls} tabIndex={on ? 0 : -1} className={`dz-help-tab${on ? " is-on" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

/** A button's printed name in a small cap. */
function KeyCap({ children, lit }: { children: string; lit?: boolean }) {
  return <kbd className={`dz-cap${lit ? " is-lit" : ""}`}>{children}</kbd>;
}

// ------------------------------------------------------------ molecules

interface LegendRow {
  key: string;
  action: string;
  caps: string[];
  note?: string;
  lit: boolean;
}

/**
 * The controller's buttons for each action, lit while held. It reads the
 * same buttons as the drawing (readGamepad's bits: the standard layout, and
 * a generic pad's buttons held at rest ignored), so both always agree.
 */
function legendRows(m: DestroyMessages, n: ButtonNames, pad: Pad): LegendRow[] {
  const g = m.guide;
  const held = (...bits: number[]) => bits.some((b) => (pad.buttons & b) !== 0);
  const moving = held(Button.Up, Button.Down, Button.Left, Button.Right);
  const jump = held(Button.B1);
  return [
    { key: "move", action: g.actions.move, caps: [g.stick], lit: moving },
    { key: "run", action: g.actions.run, caps: [n.r1], note: `· ${g.stick} ${g.fullTilt}`, lit: held(Button.B6) },
    { key: "jump", action: g.actions.jump, caps: [n.b1], lit: jump },
    { key: "jet", action: g.actions.jet, caps: [n.b1], note: `${g.hold} · ${g.inAir}`, lit: jump },
    { key: "drop", action: g.actions.drop, caps: ["↓", n.b1], lit: held(Button.Down) && jump },
    { key: "gun", action: g.actions.gun, caps: [n.b3], note: g.aim, lit: held(Button.B3) },
    { key: "knife", action: g.actions.knife, caps: [n.b2], lit: held(Button.B2) },
    { key: "kick", action: g.actions.kick, caps: [n.b2], note: g.inAir, lit: held(Button.B2) },
    { key: "bazooka", action: g.actions.bazooka, caps: [n.b4, n.r2], lit: held(Button.B4, Button.R2) },
    { key: "rescue", action: g.actions.rescue, caps: [n.b1], note: g.near, lit: jump },
    { key: "pause", action: g.actions.pause, caps: [n.start], lit: held(Button.Start) },
  ];
}

function PadView({ m }: { m: DestroyMessages }) {
  const gp = useGamepad();
  if (!gp) {
    return (
      <div className="dz-help-wait" role="status">
        <svg className="dz-help-pulse" width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="7" width="20" height="11" rx="4" />
          <path d="M7 11v3M5.5 12.5h3" />
          <circle cx="16" cy="11.5" r="1" />
          <circle cx="18" cy="13.5" r="1" />
        </svg>
        <p>{m.guide.noPad}</p>
      </div>
    );
  }
  const names = buttonNames(gp.id.model);
  const rows = legendRows(m, names, gp.pad);
  return (
    <div className="dz-help-pad">
      <p className="dz-help-found">
        <span className="dz-help-dot" aria-hidden="true" />
        {m.guide.detected([gp.id.brand, gp.id.modelName].filter(Boolean).join(" "))}
        <span className="dz-muted"> · {m.guide.tryIt}</span>
      </p>
      <div className="dz-help-art">
        <ControllerModel model={gp.id.model} pad={gp.pad} triggers={gp.triggers} label={gp.id.modelName} />
      </div>
      <ul className="dz-legend">
        {rows.map((r) => (
          <li key={r.key} className={r.lit ? "is-lit" : ""}>
            <span className="dz-legend-caps">
              {r.caps.map((c, i) => (
                <KeyCap key={`${c}-${i}`} lit={r.lit}>
                  {c}
                </KeyCap>
              ))}
            </span>
            <span className="dz-legend-action">
              {r.action}
              {r.note && <span className="dz-muted"> {r.note}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The keys held now (codes), while the help is shown. */
function useHeldKeys(): ReadonlySet<string> {
  const [held, setHeld] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    const cur = new Set<string>();
    const update = () => setHeld(new Set(cur));
    const down = (e: KeyboardEvent) => {
      if (e.repeat || cur.has(e.code)) return;
      cur.add(e.code);
      update();
    };
    const up = (e: KeyboardEvent) => {
      if (cur.delete(e.code)) update();
    };
    const blur = () => {
      cur.clear();
      update();
    };
    // Capture phase, like the game's own input (which stops the keys there).
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur);
    };
  }, []);
  return held;
}

/**
 * Which keys light each row of the keyboard table, in the rows' order:
 * walk, run, jump, double jump, jetpack, crouch, drop down, kick, gun, aim,
 * knife, bazooka, rescue, pause.
 */
const KEY_ROWS: ((k: ReadonlySet<string>) => boolean)[] = (() => {
  const any = (...codes: string[]) => (k: ReadonlySet<string>) => codes.some((c) => k.has(c));
  const jump = any("Space", "KeyW");
  const down = any("ArrowDown", "KeyS");
  return [
    any("ArrowLeft", "ArrowRight", "KeyA", "KeyD"),
    any("ShiftLeft", "ShiftRight"),
    jump,
    jump,
    jump,
    down,
    (k) => down(k) && jump(k),
    any("KeyK"),
    any("KeyJ"),
    (k) => any("ArrowUp", "ArrowDown", "KeyS")(k) && k.has("KeyJ"),
    any("KeyK"),
    any("KeyL"),
    any("KeyE"),
    any("Escape", "KeyP"),
  ];
})();

function KeysView({ m }: { m: DestroyMessages }) {
  const held = useHeldKeys();
  return (
    <table className="dz-controls">
      <caption className="dz-sr">{m.controls.title}</caption>
      <thead>
        <tr>
          <th scope="col">{m.controls.action}</th>
          <th scope="col">{m.controls.keys}</th>
        </tr>
      </thead>
      <tbody>
        {m.controls.rows.map(([a = "", , k = ""], i) => {
          const lit = KEY_ROWS[i]?.(held) ?? false;
          return (
            <tr key={a} className={lit ? "is-lit" : undefined}>
              <th scope="row">{a}</th>
              <td className="dz-mono is-accent">{k}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

type TouchButton = "move" | "jump" | "fire" | "knife" | "bazooka";
/** Which touch button lights each row of the touch table, in the rows' order. */
const TOUCH_ROWS: TouchButton[] = ["move", "jump", "jump", "jump", "fire", "knife", "bazooka", "jump"];

function TouchView({ m }: { m: DestroyMessages }) {
  // A small copy of the touch pad to try: each button lights its rows.
  const [held, setHeld] = useState<TouchButton | null>(null);
  const buttons: TouchButton[] = ["move", "jump", "fire", "knife", "bazooka"];
  return (
    <div className="dz-help-touch">
      <div className="dz-touch-try" role="group" aria-label={m.touch.label}>
        {buttons.map((b) => (
          <button
            key={b}
            type="button"
            className={`dz-touch-try-btn${b === "move" ? " is-stick" : ""}${held === b ? " is-lit" : ""}`}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture?.(e.pointerId);
              setHeld(b);
            }}
            onPointerUp={() => setHeld(null)}
            onPointerCancel={() => setHeld(null)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setHeld(b)}
            onKeyUp={() => setHeld(null)}
            onBlur={() => setHeld(null)}
          >
            {m.touch[b]}
          </button>
        ))}
      </div>
      <table className="dz-controls">
        <caption className="dz-sr">{m.touch.label}</caption>
        <tbody>
          {m.guide.touchRows.map(([a = "", how = ""], i) => (
            <tr key={a} className={held !== null && TOUCH_ROWS[i] === held ? "is-lit" : undefined}>
              <th scope="row">{a}</th>
              <td>{how}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------ organism

const coarse = () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
const anyPad = () => typeof navigator !== "undefined" && !!navigator.getGamepads && [...navigator.getGamepads()].some((g) => !!g && g.connected);

/**
 * The controls help with a tab per input: the controller when one is
 * listed (it switches there by itself as soon as a controller shows up),
 * the touch pad on touch screens, the keyboard otherwise.
 */
export function ControlsHelp({ m, idBase }: { m: DestroyMessages; idBase: string }) {
  const [tab, setTab] = useState<Tab>(() => (anyPad() ? "pad" : coarse() ? "touch" : "keys"));
  const [chosen, setChosen] = useState(false);
  useEffect(() => {
    if (chosen) return;
    const show = () => setTab("pad");
    window.addEventListener("gamepadconnected", show);
    // Some browsers only list a controller after a press, with no event.
    const id = window.setInterval(() => anyPad() && show(), 500);
    return () => {
      window.removeEventListener("gamepadconnected", show);
      window.clearInterval(id);
    };
  }, [chosen]);
  const pick = (t: Tab) => {
    setChosen(true);
    setTab(t);
  };
  const tabs: [Tab, string][] = [
    ["pad", m.guide.tabs.pad],
    ["keys", m.guide.tabs.keys],
    ["touch", m.guide.tabs.touch],
  ];
  const panel = `${idBase}-panel`;
  return (
    <section className="dz-help" aria-label={m.controls.title}>
      <div className="dz-help-tabs" role="tablist" aria-label={m.controls.title}>
        {tabs.map(([t, label]) => (
          <TabButton key={t} id={`${idBase}-${t}`} controls={panel} on={tab === t} onClick={() => pick(t)}>
            {label}
          </TabButton>
        ))}
      </div>
      <div className="dz-help-panel" id={panel} role="tabpanel" aria-labelledby={`${idBase}-${tab}`}>
        {tab === "pad" ? <PadView m={m} /> : tab === "keys" ? <KeysView m={m} /> : <TouchView m={m} />}
      </div>
    </section>
  );
}

