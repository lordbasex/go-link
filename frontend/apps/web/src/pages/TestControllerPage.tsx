// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_CONTROLS,
  EMPTY_PAD,
  INPUT_ACTIONS,
  gamepadName,
  keyboardButtons,
  padBits,
  padMapFor,
  readGamepad,
  type Pad,
} from "@go-link/shared";
import { t } from "../i18n";
import { ControllerIcon, GamepadIcon } from "../components/Icons";
import { TestPad } from "../components/TestPad";
import { TouchPad } from "../components/TouchPad";
import { HeroTile, PageHero } from "../components/ui/PageHero";
import { useInputConfig } from "../signal/useInputConfig";

/** Samples kept for the average input-to-screen time. */
const LATENCY_SAMPLES = 20;

interface PadInfo {
  index: number;
  name: string;
  pad: Pad;
}

/** Joins pads: every button of either, the sticks of the first that moves. */
function merge(a: Pad, b: Pad): Pad {
  return {
    buttons: a.buttons | b.buttons,
    axes: a.axes.map((v, i) => (v !== 0 ? v : b.axes[i]!)) as Pad["axes"],
  };
}

/**
 * Measures the time from an input event to the next frame the browser
 * draws: the page's own share of the delay, with no device or network.
 */
function useFrameLatency() {
  const [last, setLast] = useState<number | null>(null);
  const [avg, setAvg] = useState<number | null>(null);
  const samples = useRef<number[]>([]);
  const measure = (eventTime: number) => {
    requestAnimationFrame(() => {
      const ms = Math.max(0, performance.now() - eventTime);
      samples.current = [...samples.current, ms].slice(-LATENCY_SAMPLES);
      setLast(ms);
      setAvg(samples.current.reduce((s, v) => s + v, 0) / samples.current.length);
    });
  };
  return { last, avg, measure };
}

/**
 * /test-controller: the test pattern's controller, drawn by the browser
 * alone. The keyboard, the on-screen gamepad and any gamepad (Bluetooth or
 * USB, through the Gamepad API) light it up, with each gamepad's name and
 * the input-to-screen time. Nothing is sent anywhere.
 */
export function TestControllerPage() {
  const { input } = useInputConfig();
  const [keys, setKeys] = useState(0);
  const [touch, setTouch] = useState(0);
  const [touchOn, setTouchOn] = useState(false);
  const [pads, setPads] = useState<PadInfo[]>([]);
  const latency = useFrameLatency();
  const measure = useRef(latency.measure);
  measure.current = latency.measure;

  // The keyboard, with this browser's key map (the one rooms use).
  useEffect(() => {
    const held = new Set<string>();
    const update = (e: KeyboardEvent, down: boolean) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (down) {
        if (e.repeat) return;
        held.add(e.code);
      } else held.delete(e.code);
      const bits = keyboardButtons(held, input.keyboard);
      setKeys(bits);
      if (down && bits) {
        e.preventDefault();
        measure.current(e.timeStamp);
      }
    };
    const down = (e: KeyboardEvent) => update(e, true);
    const up = (e: KeyboardEvent) => update(e, false);
    const blur = () => {
      held.clear();
      setKeys(0);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [input.keyboard]);

  // Gamepads: read on every frame, like a room does.
  useEffect(() => {
    if (!navigator.getGamepads) return;
    let frame = 0;
    const stamps = new Map<number, number>();
    const prev = new Map<number, number>();
    const poll = () => {
      const list: PadInfo[] = [];
      for (const gp of navigator.getGamepads()) {
        if (!gp || !gp.connected) continue;
        const pad = readGamepad(gp, padBits(padMapFor(input, gp.id)));
        list.push({ index: gp.index, name: gamepadName(gp), pad });
        const was = prev.get(gp.index) ?? 0;
        // A new press: the time since the pad reported it is the delay.
        if (pad.buttons & ~was && gp.timestamp && gp.timestamp !== stamps.get(gp.index)) measure.current(gp.timestamp);
        stamps.set(gp.index, gp.timestamp);
        prev.set(gp.index, pad.buttons);
      }
      setPads((cur) =>
        cur.length === list.length && cur.every((c, i) => c.index === list[i]!.index && c.pad.buttons === list[i]!.pad.buttons && c.pad.axes.every((a, j) => a === list[i]!.pad.axes[j]))
          ? cur
          : list,
      );
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, [input]);

  const touchPrev = useRef(0);
  const onTouch = (bits: number) => {
    if (bits & ~touchPrev.current) measure.current(performance.now());
    touchPrev.current = bits;
    setTouch(bits);
  };

  let pad: Pad = { ...EMPTY_PAD, buttons: keys | touch };
  for (const p of pads) pad = merge(pad, p.pad);
  const pressed = INPUT_ACTIONS.filter((a) => a.id !== "pause" && (pad.buttons & a.bit) !== 0).map((a) => t.remap.actions[a.id]);
  const sources = [
    keys ? t.testController.keyboard : "",
    touch ? t.testController.touch : "",
    ...pads.filter((p) => p.pad.buttons || p.pad.axes.some((a) => a)).map((p) => t.testController.gamepad(p.index + 1, p.name)),
  ].filter(Boolean);
  const fmt = (ms: number | null) => (ms === null ? "—" : `${ms.toFixed(1)} ms`);

  return (
    <div className="page test-controller-page">
      <PageHero
        tile={
          <HeroTile>
            <ControllerIcon size={30} />
          </HeroTile>
        }
        eyebrow={t.testController.eyebrow}
        title={t.testController.title}
        subtitle={t.testController.intro}
      />
      <div className="page-body test-controller-body">
        <div className="test-controller-stage">
          <TestPad pad={pad} players={pads.slice(0, 4).map(() => true)} />
          {touchOn && <TouchPad controls={DEFAULT_CONTROLS} onChange={onTouch} starts={4} />}
        </div>
        <div className="test-controller-info">
          <section className="card stack-sm" aria-labelledby="tc-pressed">
            <h2 className="card-title" id="tc-pressed">
              {t.testController.pressed}
            </h2>
            <p className="test-controller-pressed" aria-live="polite">
              {pressed.length ? pressed.join(" · ") : t.testController.none}
            </p>
            {sources.length > 0 && (
              <p className="small muted">
                {t.testController.source}: {sources.join(" · ")}
              </p>
            )}
          </section>
          <section className="card stack-sm" aria-labelledby="tc-latency">
            <h2 className="card-title" id="tc-latency">
              {t.testController.latency}
            </h2>
            <p className="test-controller-latency mono">
              {latency.last === null ? t.testController.latencyNone : `${fmt(latency.last)} · ⌀ ${fmt(latency.avg)}`}
            </p>
            <p className="small muted">{t.testController.latencyHint}</p>
          </section>
          <section className="card stack-sm" aria-labelledby="tc-pads">
            <h2 className="card-title" id="tc-pads">
              <GamepadIcon size={18} /> {t.testController.source}
            </h2>
            {pads.length === 0 ? (
              <p className="small muted">{t.testController.noGamepad}</p>
            ) : (
              <ul className="test-controller-pads">
                {pads.map((p) => (
                  <li key={p.index}>{t.testController.gamepad(p.index + 1, p.name)}</li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className={`button button-secondary${touchOn ? " is-on" : ""}`}
              aria-pressed={touchOn}
              onClick={() => {
                setTouchOn((v) => !v);
                onTouch(0);
              }}
            >
              {touchOn ? t.testController.hideTouch : t.testController.showTouch}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
