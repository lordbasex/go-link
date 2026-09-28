// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button, actionButtons, dpadBits, isFourWay, startOf, type GameControls } from "@go-link/shared";
import { t } from "../i18n";

interface TouchPadProps {
  controls: GameControls;
  /** Called with every change of the held buttons (0 = nothing held). */
  onChange: (buttons: number) => void;
  /** How many panel start buttons (1P, 2P...) to show, 1 to 4. */
  starts?: number;
  /** Your seats (1-4), to mark your own start button. */
  myPorts?: readonly number[];
}

const DIRECTIONS = [
  { bit: Button.Up, cls: "up" },
  { bit: Button.Down, cls: "down" },
  { bit: Button.Left, cls: "left" },
  { bit: Button.Right, cls: "right" },
] as const;

/**
 * On-screen gamepad for phones and tablets, drawn over the video: the
 * directions on the left, the game's action buttons on the right, Coin and
 * the start buttons of each player (1P, 2P...) above them. Several fingers work at once, and a finger can slide
 * from one button to the next, as on an arcade panel.
 */
export function TouchPad({ controls, onChange, starts = 1, myPorts = [] }: TouchPadProps) {
  const dpadRef = useRef<HTMLDivElement>(null);
  const dpad = useRef(0); // bits of the finger on the D-pad
  const fingers = useRef(new Map<number, number>()); // pointer -> button bit
  const [held, setHeld] = useState(0);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const fourWay = isFourWay(controls.control);
  const buttons = actionButtons(controls.buttons);

  const publish = () => {
    let bits = dpad.current;
    fingers.current.forEach((b) => (bits |= b));
    setHeld((prev) => {
      // A short buzz on each new press, where the phone can (Android).
      if (bits & ~prev) navigator.vibrate?.(8);
      return bits;
    });
    changeRef.current(bits);
  };

  // Let go of everything when the pad goes away.
  useEffect(() => () => changeRef.current(0), []);

  const readDpad = (e: ReactPointerEvent) => {
    const r = dpadRef.current!.getBoundingClientRect();
    const radius = r.width / 2;
    const dx = (e.clientX - (r.left + radius)) / radius;
    const dy = (e.clientY - (r.top + r.height / 2)) / radius;
    dpad.current = dpadBits(dx, dy, fourWay);
    publish();
  };

  const buttonAt = (x: number, y: number): number => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-bit]");
    return el ? Number(el.dataset.bit) : 0;
  };
  const pressAt = (e: ReactPointerEvent) => {
    const bit = buttonAt(e.clientX, e.clientY);
    if ((fingers.current.get(e.pointerId) ?? 0) === bit) return;
    if (bit) fingers.current.set(e.pointerId, bit);
    else fingers.current.delete(e.pointerId);
    publish();
  };
  const release = (e: ReactPointerEvent) => {
    if (fingers.current.delete(e.pointerId)) publish();
  };

  const buttonsProps = {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      pressAt(e);
    },
    onPointerMove: (e: ReactPointerEvent) => fingers.current.has(e.pointerId) && pressAt(e),
    onPointerUp: release,
    onPointerCancel: release,
    onLostPointerCapture: release,
  };

  const on = (bit: number) => (held & bit ? " is-on" : "");
  const cols = buttons.length <= 3 ? Math.max(buttons.length, 1) : buttons.length === 4 ? 2 : 3;

  return (
    // Pointer-only by nature: keyboard and gamepads are the accessible way to
    // play, so screen readers skip it.
    <div className="touchpad" aria-hidden="true" onContextMenu={(e) => e.preventDefault()}>
      <div className="touchpad-side touchpad-left" {...buttonsProps}>
        <span className={`touchpad-pill${on(Button.Coin)}`} data-bit={Button.Coin}>
          {t.touch.coin}
        </span>
        <div
          ref={dpadRef}
          className={`touchpad-dpad${fourWay ? " is-4way" : ""}`}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            readDpad(e);
          }}
          onPointerMove={(e) => {
            e.stopPropagation();
            if (e.currentTarget.hasPointerCapture(e.pointerId)) readDpad(e);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            dpad.current = 0;
            publish();
          }}
          onPointerCancel={() => {
            dpad.current = 0;
            publish();
          }}
        >
          {DIRECTIONS.map((d) => (
            <span key={d.cls} className={`touchpad-arrow touchpad-arrow-${d.cls}${on(d.bit)}`} />
          ))}
        </div>
      </div>
      <div className="touchpad-side touchpad-right" {...buttonsProps}>
        <div className="touchpad-starts">
          {Array.from({ length: Math.min(Math.max(starts, 1), 4) }, (_, i) => {
            const bit = startOf(i + 1);
            return (
              <span
                key={bit}
                className={`touchpad-pill${myPorts.includes(i + 1) ? " is-mine" : ""}${on(bit)}`}
                data-bit={bit}
              >
                {t.touch.startPlayer(i + 1)}
              </span>
            );
          })}
        </div>
        <div className="touchpad-buttons" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {buttons.map((bit, i) => (
            <span key={bit} className={`touchpad-button${on(bit)}`} data-bit={bit}>
              {i + 1}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
