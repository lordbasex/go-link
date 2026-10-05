// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// "Your controller": the connected controller drawn with its own button
// names and lit while pressed, press-to-assign remapping of the keyboard
// and each controller model (the site's button map in this browser, the
// one play mode and go-link rooms read), the on-screen pad choice for play
// mode, and a reset to go-link's defaults.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  bind,
  bindingOf,
  DEFAULT_KEYBOARD,
  INPUT_ACTIONS,
  keyboardButtons,
  loadInputConfig,
  padBits,
  padMapFor,
  readGamepad,
  saveInputConfig,
  type GamepadLike,
  type InputAction,
  type InputConfig,
  type Pad,
} from "@go-link/shared";
import { ControllerModel } from "@go-link/ui/controllers";
import { buttonNames, identify, type ButtonNames } from "@go-link/ui/controllers";
import { loadTouchPref, saveTouchPref, type TouchPref } from "../play/input";
import { Capsule, Eyebrow, Segmented } from "../ui/atoms";
import { fill, useGameText } from "./texts";

/** The actions a Willy Maker game uses, in the order the panel lists them. */
export const REMAP_ACTIONS = ["up", "down", "left", "right", "b1", "b2", "b3", "start", "coin"] as const;
type RemapAction = (typeof REMAP_ACTIONS)[number];
type Source = "pad" | "keyboard" | "touch";

const BIT = Object.fromEntries(INPUT_ACTIONS.map((a) => [a.id, a.bit])) as Record<InputAction, number>;

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function connectedPads(): GamepadLike[] {
  try {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return [];
    return Array.from(navigator.getGamepads()).filter((g): g is Gamepad => !!g && g.connected);
  } catch {
    return [];
  }
}

/** A readable name for a KeyboardEvent.code ("KeyZ" -> "Z", "ArrowUp" -> "↑"). */
export function keyLabel(code: string): string {
  const arrows: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
  if (arrows[code]) return arrows[code]!;
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code.replace(/(Left|Right)$/, " $1");
}

/** What a model prints on a standard-mapping button index. */
export function padButtonLabel(index: number, names: ButtonNames, fallback: (n: number) => string): string {
  const byIndex: Record<number, string> = {
    0: names.b1,
    1: names.b2,
    2: names.b3,
    3: names.b4,
    4: names.l1,
    5: names.r1,
    6: names.l2,
    7: names.r2,
    8: names.select,
    9: names.start,
    12: "↑",
    13: "↓",
    14: "←",
    15: "→",
  };
  return byIndex[index] ?? fallback(index);
}

export function ControllerPanel({ labels }: { labels: Partial<Record<"b1" | "b2" | "b3", string>> }) {
  const t = useGameText();
  const [cfg, setCfg] = useState<InputConfig>(() => loadInputConfig(safeStorage()));
  const [touch, setTouch] = useState<TouchPref>(() => loadTouchPref(safeStorage()));
  const [pads, setPads] = useState<{ id: string; index: number }[]>([]);
  const [padId, setPadId] = useState<string | null>(null);
  const [source, setSource] = useState<Source>("keyboard");
  const [listening, setListening] = useState<RemapAction | null>(null);
  const [live, setLive] = useState<Pad | null>(null);
  const [keyBits, setKeyBits] = useState(0);
  const held = useRef(new Set<string>());
  const state = useRef({ cfg, padId, source, listening });
  state.current = { cfg, padId, source, listening };

  const update = useCallback((change: (cur: InputConfig) => InputConfig) => {
    setCfg((cur) => {
      const next = change(cur);
      saveInputConfig(safeStorage(), next);
      return next;
    });
  }, []);

  // controllers: found, read every frame (lit buttons), and the next press while assigning
  useEffect(() => {
    let raf = 0;
    let prev: boolean[] = [];
    let seen = "";
    let wasListening: RemapAction | null = null;
    const tick = () => {
      const list = connectedPads();
      const key = list.map((g) => `${g.index}:${g.id}`).join("|");
      if (key !== seen) {
        seen = key;
        setPads(list.map((g) => ({ id: g.id, index: g.index })));
        if (list.length && !state.current.padId) {
          setPadId(list[0]!.id);
          setSource((s) => (s === "keyboard" ? "pad" : s));
        }
      }
      const { cfg: c, padId: id, source: src, listening: action } = state.current;
      const gp = list.find((g) => g.id === id);
      if (gp) {
        setLive((old) => {
          const pad = readGamepad(gp, padBits(padMapFor(c, gp.id)));
          return old && old.buttons === pad.buttons ? old : pad;
        });
        const now = gp.buttons.map((b) => b.pressed);
        if (action && src === "pad") {
          // a button that went down after assigning started
          if (wasListening !== action) prev = now;
          const i = now.findIndex((p, k) => p && !prev[k]);
          if (i >= 0) {
            update((cur) => ({ ...cur, pads: { ...cur.pads, [gp.id]: bind(padMapFor(cur, gp.id), i, action) } }));
            setListening(null);
          }
        }
        prev = now;
      } else setLive(null);
      wasListening = action;
      raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame(tick) : 0;
    };
    if (typeof requestAnimationFrame === "function") raf = requestAnimationFrame(tick);
    else tick();
    return () => {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
    };
  }, [update]);

  // the keyboard: held keys light the rows; while assigning, the next key is the binding
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const { listening: action, source: src } = state.current;
      if (action && e.code === "Escape") {
        e.preventDefault();
        setListening(null);
        return;
      }
      if (action && src === "keyboard") {
        e.preventDefault();
        e.stopPropagation();
        update((cur) => ({ ...cur, keyboard: bind(cur.keyboard, e.code, action) }));
        setListening(null);
        return;
      }
      held.current.add(e.code);
      setKeyBits(keyboardButtons(held.current, state.current.cfg.keyboard));
    };
    const up = (e: KeyboardEvent) => {
      held.current.delete(e.code);
      setKeyBits(keyboardButtons(held.current, state.current.cfg.keyboard));
    };
    window.addEventListener("keydown", down, { capture: true });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down, { capture: true });
      window.removeEventListener("keyup", up);
    };
  }, [update]);

  const identity = padId ? identify(padId) : null;
  const names = buttonNames(identity?.model ?? "generic");
  const padMap = padId ? padMapFor(cfg, padId) : null;
  const bits = source === "pad" ? live?.buttons ?? 0 : source === "keyboard" ? keyBits : 0;

  const binding = (action: RemapAction): string => {
    if (source === "keyboard") {
      const code = bindingOf(cfg.keyboard, action);
      return code ? keyLabel(code) : t.controller.unbound;
    }
    if (!padMap) return t.controller.unbound;
    const index = bindingOf(padMap, action);
    return index === undefined ? t.controller.unbound : padButtonLabel(Number(index), names, (n) => fill(t.controller.button, { n }));
  };

  const actionName = (a: RemapAction) => {
    const base = t.controller.actions[a];
    const label = a === "b1" || a === "b2" || a === "b3" ? labels[a] : undefined;
    return label ? `${base} · ${label}` : base;
  };

  const reset = () => {
    setListening(null);
    if (source === "keyboard") update((c) => ({ ...c, keyboard: DEFAULT_KEYBOARD }));
    else if (source === "pad" && padId)
      update((c) => {
        const next = { ...c.pads };
        delete next[padId];
        return { ...c, pads: next };
      });
    else {
      setTouch("auto");
      saveTouchPref(safeStorage(), "auto");
    }
  };

  return (
    <section className="wm-game-card wm-card" aria-labelledby="wm-controller-title">
      <h2 id="wm-controller-title" className="wm-h is-accent">
        {t.controller.title}
      </h2>
      <p className="wm-small" role="status">
        <span className={`wm-game-led${pads.length ? " is-on" : ""}`} aria-hidden="true" />{" "}
        {identity ? fill(t.controller.detected, { name: [identity.brand, identity.modelName].filter(Boolean).join(" ") }) : t.controller.none}
      </p>
      <Segmented
        label={t.controller.source}
        value={source}
        options={(["pad", "keyboard", "touch"] as const).map((s) => ({ value: s, label: t.controller.sources[s] }))}
        onChange={(s) => {
          setListening(null);
          setSource(s);
        }}
      />
      {source === "pad" && pads.length > 1 && (
        <select className="wm-input is-sm" aria-label={t.controller.sources.pad} value={padId ?? ""} onChange={(e) => setPadId(e.target.value)}>
          {pads.map((p) => (
            <option key={`${p.index}:${p.id}`} value={p.id}>
              {identify(p.id).modelName}
            </option>
          ))}
        </select>
      )}
      {source === "pad" && identity && live && (
        <div className="wm-game-pad">
          <ControllerModel model={identity.model} pad={live} label={identity.modelName} />
        </div>
      )}
      {source === "pad" && !padId && <p className="wm-dim wm-small">{t.controller.noPad}</p>}

      {source === "touch" ? (
        <div className="wm-game-stack">
          <Eyebrow>{t.controller.touch.label}</Eyebrow>
          <Segmented
            label={t.controller.touch.label}
            value={touch}
            options={(["auto", "on", "off"] as const).map((v) => ({ value: v, label: t.controller.touch[v] }))}
            onChange={(v) => {
              setTouch(v);
              saveTouchPref(safeStorage(), v);
            }}
          />
          <p className="wm-dim wm-small">{t.controller.touch.help}</p>
        </div>
      ) : (
        (source === "keyboard" || padId) && (
          <ul className="wm-game-binds" aria-label={t.controller.live}>
            {REMAP_ACTIONS.map((a) => (
              <li key={a} className={bits & BIT[a] ? "is-lit" : undefined}>
                <span className="wm-game-bind-name">{actionName(a)}</span>
                <span className="wm-mono wm-game-bind-key">{listening === a ? (source === "keyboard" ? t.controller.pressKey : t.controller.pressButton) : binding(a)}</span>
                {listening === a ? (
                  <Capsule size="sm" onClick={() => setListening(null)}>
                    {t.controller.cancel}
                  </Capsule>
                ) : (
                  <Capsule size="sm" aria-label={fill(t.controller.assignFor, { action: t.controller.actions[a] })} onClick={() => setListening(a)}>
                    {t.controller.assign}
                  </Capsule>
                )}
              </li>
            ))}
          </ul>
        )
      )}
      <div className="wm-row is-wrap">
        <Capsule size="sm" title={t.controller.resetTip} onClick={reset}>
          ↺ {t.controller.reset}
        </Capsule>
      </div>
      <p className="wm-dim wm-small">{t.controller.saved}</p>
      <p className="wm-dim wm-small">{t.controller.room}</p>
    </section>
  );
}
