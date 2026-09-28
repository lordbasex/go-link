// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import type { ReactNode } from "react";
import { Button, type Pad } from "@go-link/shared";

/** The controller families we draw; anything else gets the generic pad. */
export type ControllerFamily = "playstation" | "nintendo" | "xbox" | "generic";

/** Tells the family from the browser's gamepad id (name and USB vendor). */
export function familyOf(id: string): ControllerFamily {
  if (/057e|nintendo|pro controller|joy-con/i.test(id)) return "nintendo";
  if (/054c|dualsense|dualshock|playstation/i.test(id)) return "playstation";
  if (/045e|xbox|xinput/i.test(id)) return "xbox";
  return "generic";
}

type Point = [number, number];

/**
 * Where each part sits on one family's drawing (viewBox 360 x 230). The
 * bodies are our own outline drawings, not copies of any artwork, and
 * carry no logos.
 */
interface Layout {
  body: string;
  dpad: Point;
  face: Point;
  /** Face button labels: top, left, right, bottom. */
  faceLabels: [string, string, string, string];
  leftStick: Point;
  rightStick: Point;
  /** Select-like (Coin) and Start-like buttons. */
  select: Point;
  start: Point;
  selectLabel: string;
  startLabel: string;
  home: Point;
  /** Capture, share or touchpad: a rect x, y, width, height. */
  capture: [number, number, number, number];
  shoulders: [string, string, string, string]; // L2, L1, R1, R2
}

// Wide body with long grips, a touchpad in the middle and both sticks low.
const PLAYSTATION: Layout = {
  body: "M78 44 C120 32 240 32 282 44 C314 52 334 84 344 132 C354 184 348 216 320 219 C298 221 284 200 270 178 C256 160 104 160 90 178 C76 200 62 221 40 219 C12 216 6 184 16 132 C26 84 46 52 78 44 Z",
  dpad: [92, 100],
  face: [268, 100],
  faceLabels: ["△", "□", "○", "✕"],
  leftStick: [136, 150],
  rightStick: [224, 150],
  select: [124, 62],
  start: [236, 62],
  selectLabel: "",
  startLabel: "",
  home: [180, 140],
  capture: [140, 50, 80, 50],
  shoulders: ["L2", "L1", "R1", "R2"],
};

// Fuller body with round grips; left stick high, D-pad low.
const NINTENDO: Layout = {
  body: "M84 42 C124 30 236 30 276 42 C312 52 332 82 342 128 C352 176 346 208 318 212 C294 215 280 198 266 180 C250 164 110 164 94 180 C80 198 66 215 42 212 C14 208 8 176 18 128 C28 82 48 52 84 42 Z",
  dpad: [140, 150],
  face: [266, 96],
  faceLabels: ["X", "Y", "A", "B"],
  leftStick: [96, 96],
  rightStick: [220, 150],
  select: [150, 66],
  start: [210, 66],
  selectLabel: "−",
  startLabel: "+",
  home: [200, 96],
  capture: [154, 90, 12, 12],
  shoulders: ["ZL", "L", "R", "ZR"],
};

// Rounded top that flows into angled grips; left stick high, D-pad low.
const XBOX: Layout = {
  body: "M92 40 C130 30 230 30 268 40 C306 50 330 84 340 132 C350 182 342 214 314 216 C292 218 278 198 262 176 C246 158 114 158 98 176 C82 198 68 218 46 216 C18 214 10 182 20 132 C30 84 54 50 92 40 Z",
  dpad: [140, 150],
  face: [266, 96],
  faceLabels: ["Y", "X", "B", "A"],
  leftStick: [96, 96],
  rightStick: [220, 150],
  select: [156, 92],
  start: [204, 92],
  selectLabel: "",
  startLabel: "",
  home: [180, 62],
  capture: [174, 108, 12, 8],
  shoulders: ["LT", "LB", "RB", "RT"],
};

// A plain pad for everything else.
const GENERIC: Layout = {
  ...PLAYSTATION,
  body: "M80 46 C124 36 236 36 280 46 C312 54 332 86 340 132 C348 180 340 210 314 212 C292 214 278 196 264 178 C250 162 110 162 96 178 C82 196 68 214 46 212 C20 210 12 180 20 132 C28 86 48 54 80 46 Z",
  faceLabels: ["4", "3", "2", "1"],
  selectLabel: "−",
  startLabel: "+",
  capture: [172, 90, 16, 10],
  shoulders: ["L2", "L1", "R1", "R2"],
};

const LAYOUTS: Record<ControllerFamily, Layout> = {
  playstation: PLAYSTATION,
  nintendo: NINTENDO,
  xbox: XBOX,
  generic: GENERIC,
};

/**
 * Outline drawing of a gamepad in the style of its family (PlayStation,
 * Switch Pro, Xbox or generic). Every button, the D-pad, the triggers and
 * the sticks fill with the accent color while pressed.
 */
export function ControllerArt({ family, pad, label }: { family: ControllerFamily; pad: Pad; label: string }) {
  const l = LAYOUTS[family];
  const on = (b: number) => (pad.buttons & b ? " is-on" : "");
  const part = (b: number) => `ca-part${on(b)}`;

  const [dx, dy] = l.dpad;
  const arm = 13; // half of the D-pad's width
  const dpadArm = (bit: number, x: number, y: number, w: number, h: number) => (
    <rect x={x} y={y} width={w} height={h} rx={3} className={part(bit)} />
  );

  const [fx, fy] = l.face;
  const gap = 20;
  const face: [number, number, number, string][] = [
    [fx, fy - gap, Button.B4, l.faceLabels[0]],
    [fx - gap, fy, Button.B3, l.faceLabels[1]],
    [fx + gap, fy, Button.B2, l.faceLabels[2]],
    [fx, fy + gap, Button.B1, l.faceLabels[3]],
  ];

  const stick = ([cx, cy]: Point, x: number, y: number, click: number): ReactNode => (
    <g>
      <circle cx={cx} cy={cy} r={21} className="ca-line" />
      <circle
        cx={cx + (x / 127) * 9}
        cy={cy + (y / 127) * 9}
        r={13}
        className={`ca-part${on(click)}${x || y ? " is-on" : ""}`}
      />
    </g>
  );

  const small = ([x, y]: Point, bit: number, text: string) => (
    <g>
      <rect x={x - 9} y={y - 5} width={18} height={10} rx={5} className={part(bit)} />
      {text && (
        <text x={x} y={y + 3.5} className="ca-label">
          {text}
        </text>
      )}
    </g>
  );

  const [s0, s1, s2, s3] = l.shoulders;
  const [cx, cy, cw, ch] = l.capture;
  return (
    <svg viewBox="0 0 360 230" role="img" aria-label={label} className={`ca ca-${family}`}>
      {/* Triggers behind the body, bumpers on its top edge. */}
      <rect x={56} y={10} width={58} height={18} rx={8} className={part(Button.L2)} />
      <rect x={246} y={10} width={58} height={18} rx={8} className={part(Button.R2)} />
      <text x={85} y={23} className="ca-label">
        {s0}
      </text>
      <text x={275} y={23} className="ca-label">
        {s3}
      </text>
      <path d={l.body} className="ca-body" />
      <path d="M70 46 Q96 34 128 34" className={`ca-bumper${on(Button.B5)}`} />
      <path d="M290 46 Q264 34 232 34" className={`ca-bumper${on(Button.B6)}`} />
      <text x={100} y={52} className="ca-label is-faint">
        {s1}
      </text>
      <text x={260} y={52} className="ca-label is-faint">
        {s2}
      </text>

      {/* D-pad: a cross of four arms. */}
      {dpadArm(Button.Up, dx - 7, dy - arm - 9, 14, 18)}
      {dpadArm(Button.Down, dx - 7, dy + arm - 9, 14, 18)}
      {dpadArm(Button.Left, dx - arm - 9, dy - 7, 18, 14)}
      {dpadArm(Button.Right, dx + arm - 9, dy - 7, 18, 14)}

      {face.map(([x, y, bit, text]) => (
        <g key={bit}>
          <circle cx={x} cy={y} r={10} className={part(bit)} />
          <text x={x} y={y + 3.5} className="ca-label">
            {text}
          </text>
        </g>
      ))}

      {small(l.select, Button.Coin, l.selectLabel)}
      {small(l.start, Button.Start, l.startLabel)}
      <rect x={cx} y={cy} width={cw} height={ch} rx={Math.min(cw, ch) / 4} className={part(Button.Capture)} />
      <circle cx={l.home[0]} cy={l.home[1]} r={family === "xbox" ? 10 : 7} className={part(Button.Home)} />

      {stick(l.leftStick, pad.axes[0], pad.axes[1], Button.L3)}
      {stick(l.rightStick, pad.axes[2], pad.axes[3], Button.R3)}
    </svg>
  );
}
