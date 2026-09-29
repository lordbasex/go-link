// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { Button, startOf, type Pad } from "@go-link/shared";
import { t } from "../i18n";

// The gamepad of the device's test pattern (pkg/testpattern drawPad),
// drawn in the browser: the same layout and lamps, lit while pressed, with
// no device involved. Colors come from the --tc-* tokens (the test card
// looks the same in both themes).

const W = 480;
const H = 240;
const at = (fx: number, fy: number): [number, number] => [fx * W, fy * H];
const U = H / 8; // layout unit, as on the device

function Label({ x, y, on, text, size = 13 }: { x: number; y: number; on: boolean; text: string; size?: number }) {
  return (
    <text x={x} y={y} className={on ? "tc-text is-on" : "tc-text"} fontSize={size} textAnchor="middle" dominantBaseline="central">
      {text}
    </text>
  );
}

/**
 * The test card's controller. pad is the union of every input (keyboard,
 * gamepads, on-screen gamepad); players lights the player lamps.
 */
export function TestPad({ pad, players = [] }: { pad: Pad; players?: readonly boolean[] }) {
  const on = (bit: number) => (pad.buttons & bit) !== 0;
  const sw = 2 * U;
  const sh = U;
  const arm = U + U / 3;
  const [dx, dy] = at(0.17, 0.5);
  const [fx, fy] = at(0.83, 0.5);
  const off = U + U / 2;
  const fr = (U * 2) / 3 + 1;
  return (
    <svg className="test-pad" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.testController.padLabel}>
      <rect className="tc-box" x={0} y={0} width={W} height={H} rx={14} />
      {/* Shoulders: ZL L … R ZR. */}
      {(
        [
          [0.09, Button.L2, "ZL"],
          [0.23, Button.B5, "L"],
          [0.77, Button.B6, "R"],
          [0.91, Button.R2, "ZR"],
        ] as const
      ).map(([f, bit, label]) => {
        const [x, y] = at(f, 0.08);
        return (
          <g key={label}>
            <rect className={on(bit) ? "tc-lamp is-on" : "tc-lamp"} x={x - sw / 2} y={y} width={sw} height={sh} rx={4} />
            <Label x={x} y={y + sh / 2} on={on(bit)} text={label} />
          </g>
        );
      })}
      {/* Player lamps 1 to 4: lit while that player plays or its start is held. */}
      <g>
        {[0, 1, 2, 3].map((i) => {
          const [x, y] = at(0.38 + i * 0.08, 0.08);
          const lit = !!players[i] || on(startOf(i + 1));
          return (
            <g key={i}>
              <rect className={lit ? "tc-lamp is-on" : "tc-lamp"} x={x - U / 2} y={y} width={U} height={sh} rx={3} />
              <Label x={x} y={y + sh / 2} on={lit} text={String(i + 1)} />
            </g>
          );
        })}
      </g>
      {/* D-pad. */}
      <rect className="tc-line" x={dx - arm / 2} y={dy - arm / 2} width={arm} height={arm} />
      {(
        [
          [Button.Up, dx - arm / 2, dy - (arm * 3) / 2],
          [Button.Down, dx - arm / 2, dy + arm / 2],
          [Button.Left, dx - (arm * 3) / 2, dy - arm / 2],
          [Button.Right, dx + arm / 2, dy - arm / 2],
        ] as const
      ).map(([bit, x, y]) => (
        <rect key={bit} className={on(bit) ? "tc-lamp is-on" : "tc-lamp"} x={x} y={y} width={arm} height={arm} rx={3} />
      ))}
      {/* Face buttons, Nintendo layout: X top, Y left, A right, B bottom. */}
      {(
        [
          [fx, fy - off, Button.B4, "X"],
          [fx - off, fy, Button.B3, "Y"],
          [fx + off, fy, Button.B2, "A"],
          [fx, fy + off, Button.B1, "B"],
        ] as const
      ).map(([x, y, bit, label]) => (
        <g key={label}>
          <circle className={on(bit) ? "tc-lamp is-on" : "tc-lamp"} cx={x} cy={y} r={fr} />
          <Label x={x} y={y} on={on(bit)} text={label} size={14} />
        </g>
      ))}
      {/* Minus (coin), plus (start), capture and home. */}
      {(
        [
          [0.4, 0.36, Button.Coin, "−"],
          [0.6, 0.36, Button.Start, "+"],
        ] as const
      ).map(([px, py, bit, label]) => {
        const [x, y] = at(px, py);
        return (
          <g key={label}>
            <circle className={on(bit) ? "tc-lamp is-on" : "tc-lamp"} cx={x} cy={y} r={U / 2 + 1} />
            <Label x={x} y={y} on={on(bit)} text={label} size={16} />
          </g>
        );
      })}
      {(() => {
        const [cx, cy] = at(0.44, 0.55);
        const [hx, hy] = at(0.56, 0.55);
        return (
          <>
            <rect className={on(Button.Capture) ? "tc-lamp is-on" : "tc-lamp"} x={cx - U / 2} y={cy - U / 2} width={U} height={U} rx={3} />
            <circle className={on(Button.Home) ? "tc-lamp is-on" : "tc-lamp"} cx={hx} cy={hy} r={U / 2 + 1} />
          </>
        );
      })()}
      {/* Sticks: a ring and a dot at the stick's position. */}
      {(
        [
          [0.33, 0, Button.L3],
          [0.67, 2, Button.R3],
        ] as const
      ).map(([f, ax, click]) => {
        const [sx, sy] = at(f, 0.8);
        const ring = U + U / 4;
        const ox = ((pad.axes[ax] ?? 0) * (ring - U / 3)) / 127;
        const oy = ((pad.axes[ax + 1] ?? 0) * (ring - U / 3)) / 127;
        const lit = on(click) || ox !== 0 || oy !== 0;
        return (
          <g key={ax}>
            <circle className="tc-ring" cx={sx} cy={sy} r={ring} />
            <circle className={lit ? "tc-lamp is-on" : "tc-lamp"} cx={sx + ox} cy={sy + oy} r={U / 2} />
          </g>
        );
      })}
    </svg>
  );
}
