// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { Button, type Pad } from "@go-link/shared";
import "./controllers.css";

// A pair of Switch Joy-Con side by side, in the same outline style as
// ControllerArt: the left one with its stick and four direction buttons,
// the right one with A B X Y and its stick. Parts light up while pressed.

export function JoyConPair({ pad, label }: { pad: Pad; label: string }) {
  const on = (b: number) => (pad.buttons & b ? " is-on" : "");
  const part = (b: number) => `ca-part${on(b)}`;
  const round = (x: number, y: number, bit: number, text = "") => (
    <g>
      <circle cx={x} cy={y} r={9} className={part(bit)} />
      {text && (
        <text x={x} y={y + 3.5} className="ca-label">
          {text}
        </text>
      )}
    </g>
  );
  const stick = (x: number, y: number) => (
    <g>
      <circle cx={x} cy={y} r={17} className="ca-line" />
      <circle cx={x} cy={y} r={11} className="ca-part" />
    </g>
  );
  return (
    <svg viewBox="0 0 360 230" role="img" aria-label={label} className="ca ca-joycon">
      {/* Left Joy-Con: rounded on the outside, flat where it meets the other. */}
      <path d="M176 16 H146 A34 34 0 0 0 112 50 V182 A34 34 0 0 0 146 216 H176 Z" className="ca-body jc-left" />
      <path d="M122 30 Q134 18 152 16" className={`ca-bumper${on(Button.B5)}`} />
      <rect x={156} y={30} width={12} height={4} rx={2} className={part(Button.Coin)} />
      {stick(144, 64)}
      {round(144, 108, Button.Up)}
      {round(128, 124, Button.Left)}
      {round(160, 124, Button.Right)}
      {round(144, 140, Button.Down)}
      <rect x={150} y={176} width={12} height={12} rx={3} className={part(Button.Capture)} />

      {/* Right Joy-Con. */}
      <path d="M184 16 H214 A34 34 0 0 1 248 50 V182 A34 34 0 0 1 214 216 H184 Z" className="ca-body jc-right" />
      <path d="M238 30 Q226 18 208 16" className={`ca-bumper${on(Button.B6)}`} />
      <rect x={192} y={26} width={12} height={4} rx={2} className={part(Button.Start)} />
      <rect x={196} y={22} width={4} height={12} rx={2} className={part(Button.Start)} />
      {round(216, 48, Button.B4, "X")}
      {round(200, 64, Button.B3, "Y")}
      {round(232, 64, Button.B2, "A")}
      {round(216, 80, Button.B1, "B")}
      {stick(216, 128)}
      <circle cx={204} cy={182} r={7} className={part(Button.Home)} />
    </svg>
  );
}
