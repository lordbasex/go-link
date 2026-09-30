// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { Button, type Pad } from "@go-link/shared";
import { JoyConPair } from "./JoyConPair";
import type { ControllerModelId } from "./controllerModels";
import "./controllers.css";

type Point = [number, number];

/**
 * One controller's drawing (viewBox 400 x 280): our own vector outline of
 * the real controller, with no logos. The shoulder paths are drawn for the
 * left side and mirrored for the right.
 */
interface Drawing {
  body: string;
  /** Seams and other thin lines. */
  lines: string[];
  touchpad?: string;
  l2: string;
  l1: string;
  lstick: Point;
  rstick: Point;
  dpad: Point;
  face: Point;
  faceGap: number;
  faceR: number;
  /** Top, left, right, bottom. */
  faceLabels: [string, string, string, string];
  /** Select-like and Start-like buttons, and how they look. */
  select?: Point;
  start?: Point;
  selectShape: "minus" | "pill" | "circle";
  startShape: "plus" | "pill" | "circle";
  home: Point;
  homeR: number;
  homeRing?: boolean;
  capture?: Point;
  share?: Point;
  mute?: Point;
  speaker?: Point;
  grips?: boolean;
  shoulderLabels: [string, string, string, string]; // L2, L1, R1, R2
}

const SWITCH_PRO: Drawing = {
  body: "M92 54 C128 40 272 40 308 54 C344 66 362 100 373 152 C386 216 380 256 352 264 C328 270 307 252 293 224 C281 201 263 189 241 189 L159 189 C137 189 119 201 107 224 C93 252 72 270 48 264 C20 256 14 216 27 152 C38 100 56 66 92 54 Z",
  lines: ["M104 206 C 118 176, 138 156, 162 146", "M296 206 C 282 176, 262 156, 238 146"],
  l2: "M70 58 C80 40 104 30 136 30 C144 30 148 34 147 40 L 144 44 C114 44 92 52 80 66 Z",
  l1: "M60 80 C68 60 88 48 120 44 L 146 43 L 146 50 C118 51 96 58 82 72 C76 78 72 84 70 90 Z",
  lstick: [112, 100], rstick: [250, 152], dpad: [150, 150], face: [290, 98], faceGap: 21, faceR: 10.5,
  faceLabels: ["X", "Y", "A", "B"],
  select: [166, 68], start: [234, 68], selectShape: "minus", startShape: "plus",
  home: [224, 100], homeR: 7, homeRing: true, capture: [176, 100],
  shoulderLabels: ["ZL", "L", "R", "ZR"],
};

const DUALSENSE: Drawing = {
  body: "M74 72 C94 46 152 40 200 40 C248 40 306 46 326 72 C350 102 368 156 381 216 C389 254 377 274 352 272 C331 270 316 248 302 226 C289 206 270 198 246 201 L154 201 C130 198 111 206 98 226 C84 248 69 270 48 272 C23 274 11 254 19 216 C32 156 50 102 74 72 Z",
  lines: ["M139 56 L136 116", "M261 56 L264 116"],
  touchpad: "M143 52 L257 52 L253 116 C253 122 249 126 243 126 L157 126 C151 126 147 122 147 116 Z",
  l2: "M78 54 C90 36 112 28 136 28 C142 28 144 32 143 38 L 141 44 C116 44 98 50 88 62 Z",
  l1: "M66 78 C74 60 94 50 124 48 L 139 48 L 139 55 C114 56 94 62 82 76 C77 81 74 86 72 92 Z",
  lstick: [157, 162], rstick: [243, 162], dpad: [96, 112], face: [304, 112], faceGap: 22, faceR: 11,
  faceLabels: ["△", "□", "○", "✕"],
  select: [122, 66], start: [278, 66], selectShape: "pill", startShape: "pill",
  home: [200, 178], homeR: 8, mute: [200, 196], speaker: [200, 150],
  shoulderLabels: ["L2", "L1", "R1", "R2"],
};

const DUALSHOCK4: Drawing = {
  body: "M76 66 C98 48 150 46 200 46 C250 46 302 48 324 66 C348 88 364 140 376 200 C384 244 372 266 348 264 C328 262 314 242 302 222 C290 204 272 196 248 198 L152 198 C128 196 110 204 98 222 C86 242 72 262 52 264 C28 266 16 244 24 200 C36 140 52 88 76 66 Z",
  lines: ["M146 56 L254 56"],
  touchpad: "M150 58 L250 58 L248 112 C248 118 244 122 238 122 L162 122 C156 122 152 118 152 112 Z",
  l2: "M80 50 C92 34 112 28 132 28 C138 28 140 32 139 38 L 137 44 C114 44 98 50 90 60 Z",
  l1: "M68 74 C76 58 94 50 120 50 L 140 50 L 140 57 C114 58 96 64 84 76 C79 81 76 86 74 92 Z",
  lstick: [152, 160], rstick: [248, 160], dpad: [98, 108], face: [302, 108], faceGap: 21, faceR: 10.5,
  faceLabels: ["△", "□", "○", "✕"],
  select: [134, 68], start: [266, 68], selectShape: "pill", startShape: "pill",
  home: [200, 162], homeR: 8,
  shoulderLabels: ["L2", "L1", "R1", "R2"],
};

const XBOX: Drawing = {
  body: "M98 60 C132 46 268 46 302 60 C338 74 358 112 370 166 C382 224 370 258 343 261 C319 263 304 242 290 216 C277 194 259 187 237 189 L163 189 C141 187 123 194 110 216 C96 242 81 263 57 261 C30 258 18 224 30 166 C42 112 62 74 98 60 Z",
  lines: ["M106 214 C 118 186, 136 170, 158 164", "M294 214 C 282 186, 264 170, 242 164"],
  l2: "M84 52 C96 36 118 30 140 30 C146 30 148 34 147 40 L 145 46 C120 46 102 52 94 62 Z",
  l1: "M68 82 C76 64 96 54 126 50 L 150 50 L 150 57 C122 58 100 64 86 76 C80 82 76 88 74 94 Z",
  lstick: [124, 110], rstick: [246, 158], dpad: [158, 158], face: [280, 108], faceGap: 21, faceR: 10.5,
  faceLabels: ["Y", "X", "B", "A"],
  select: [174, 110], start: [226, 110], selectShape: "circle", startShape: "circle",
  home: [200, 80], homeR: 14, homeRing: true, share: [200, 128], grips: true,
  shoulderLabels: ["LT", "LB", "RB", "RT"],
};

const XBOX360: Drawing = { ...XBOX, share: undefined, homeR: 16, select: [168, 112], start: [232, 112], lines: [] };

const EIGHTBITDO: Drawing = {
  body: "M110 70 C150 60 250 60 290 70 C336 80 364 108 372 150 C380 196 364 226 334 226 C312 226 296 212 280 196 C268 184 250 180 230 180 L170 180 C150 180 132 184 120 196 C104 212 88 226 66 226 C36 226 20 196 28 150 C36 108 64 80 110 70 Z",
  lines: [],
  l2: "M92 64 C104 50 124 46 146 46 C152 46 154 50 153 55 L 151 60 C126 60 110 64 100 72 Z",
  l1: "M74 88 C84 72 104 64 132 62 L 156 62 L 156 69 C128 70 106 76 92 88 C87 92 84 96 82 100 Z",
  lstick: [150, 158], rstick: [250, 158], dpad: [104, 118], face: [296, 118], faceGap: 21, faceR: 10.5,
  faceLabels: ["X", "Y", "A", "B"],
  select: [180, 112], start: [220, 112], selectShape: "minus", startShape: "plus",
  home: [200, 136], homeR: 6,
  shoulderLabels: ["L2", "L1", "R1", "R2"],
};

const GENERIC: Drawing = { ...DUALSHOCK4, touchpad: undefined, lines: [], faceLabels: ["4", "3", "2", "1"], selectShape: "minus", startShape: "plus", select: [170, 90], start: [230, 90], home: [200, 130] };

const DRAWINGS: Record<Exclude<ControllerModelId, "joycon">, Drawing> = {
  switchpro: SWITCH_PRO,
  dualsense: DUALSENSE,
  dualshock4: DUALSHOCK4,
  xboxseries: XBOX,
  xbox360: XBOX360,
  eightbitdo: EIGHTBITDO,
  generic: GENERIC,
};

/** The left side's path mirrored onto the right (x → 400 - x). */
function mirror(d: string): string {
  return d.replace(/(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g, (_m, x: string, y: string) => `${400 - Number(x)} ${y}`);
}

/**
 * The controller's faithful drawing, lit while pressed: buttons, the
 * D-pad, bumpers, the triggers (filled to how far they are pulled), the
 * sticks (moved by their axes) and the small buttons.
 */
export function ControllerModel({ model, pad, triggers = [0, 0], label }: { model: ControllerModelId; pad: Pad; triggers?: [number, number]; label: string }) {
  if (model === "joycon") return <JoyConPair pad={pad} label={label} />;
  const d = DRAWINGS[model];
  const on = (b: number) => (pad.buttons & b ? " is-on" : "");
  const part = (b: number) => `cm-part${on(b)}`;
  const [fx, fy] = d.face;
  const g = d.faceGap;
  const face: [number, number, number, string][] = [
    [fx, fy - g, Button.B4, d.faceLabels[0]],
    [fx - g, fy, Button.B3, d.faceLabels[1]],
    [fx + g, fy, Button.B2, d.faceLabels[2]],
    [fx, fy + g, Button.B1, d.faceLabels[3]],
  ];
  const [dx, dy] = d.dpad;
  const stick = ([x, y]: Point, ax: number, ay: number, click: number) => (
    <g>
      <circle cx={x} cy={y} r={24} className="cm-line" />
      <circle cx={x} cy={y} r={18} className="cm-part" />
      <circle cx={x + (ax / 127) * 7} cy={y + (ay / 127) * 7} r={13} className={`cm-part${on(click)}${ax || ay ? " is-moved" : ""}`} />
    </g>
  );
  const small = (p: Point | undefined, shape: string, bit: number) => {
    if (!p) return null;
    const [x, y] = p;
    if (shape === "minus") return <rect x={x - 7} y={y - 2.5} width={14} height={5} rx={2} className={part(bit)} />;
    if (shape === "plus") return <path d={`M${x - 7} ${y - 2.5}h4.5v-4.5h5v4.5h4.5v5h-4.5v4.5h-5v-4.5h-4.5z`} className={part(bit)} />;
    if (shape === "circle") return <circle cx={x} cy={y} r={6} className={part(bit)} />;
    return <rect x={x - 4} y={y - 7} width={8} height={14} rx={4} className={part(bit)} transform={`rotate(${bit === Button.Coin ? -25 : 25} ${x} ${y})`} />;
  };
  // A trigger fills from the top as it is pulled (clipped to its shape).
  const trigger = (path: string, value: number, bit: number, id: string) => (
    <g>
      <clipPath id={id}>
        <path d={path} />
      </clipPath>
      <path d={path} className="cm-part" />
      <rect x={0} y={0} width={400} height={28 + 16 * Math.min(1, Math.max(value, pad.buttons & bit ? 1 : 0))} className="cm-fill" clipPath={`url(#${id})`} />
    </g>
  );
  const uid = `cm-${model}`;
  return (
    <svg viewBox="0 0 400 280" role="img" aria-label={label} className={`cm cm-${model}`}>
      {trigger(d.l2, triggers[0], Button.L2, `${uid}-l2`)}
      {trigger(mirror(d.l2), triggers[1], Button.R2, `${uid}-r2`)}
      <path d={d.body} className="cm-body" />
      <path d={d.l1} className={part(Button.B5)} />
      <path d={mirror(d.l1)} className={part(Button.B6)} />
      {d.lines.map((l, i) => (
        <path key={i} d={l} className="cm-line" />
      ))}
      {d.grips &&
        [1, -1].flatMap((sx) =>
          Array.from({ length: 14 }, (_, i) => {
            const x = sx > 0 ? 70 + (i % 3) * 7 + Math.floor(i / 3) * 4 : 330 - (i % 3) * 7 - Math.floor(i / 3) * 4;
            const y = 190 + Math.floor(i / 3) * 9 + (i % 3) * 3;
            return <circle key={`${sx}-${i}`} cx={x} cy={y} r={1.2} className="cm-dot" />;
          }),
        )}
      {d.speaker && Array.from({ length: 7 }, (_, i) => <circle key={i} cx={d.speaker![0] + (i - 3) * 6} cy={d.speaker![1] + Math.abs(i - 3) * 1.2} r={1.3} className="cm-dot" />)}
      {d.touchpad && <path d={d.touchpad} className={part(Button.Capture)} />}
      <text x={96} y={24} className="cm-label is-faint">
        {d.shoulderLabels[0]}
      </text>
      <text x={304} y={24} className="cm-label is-faint">
        {d.shoulderLabels[3]}
      </text>
      {/* D-pad: four arms around a center. */}
      <path d={`M${dx - 8} ${dy - 8}h16v16h-16z`} className="cm-part" />
      <rect x={dx - 8} y={dy - 26} width={16} height={18} rx={2} className={part(Button.Up)} />
      <rect x={dx - 8} y={dy + 8} width={16} height={18} rx={2} className={part(Button.Down)} />
      <rect x={dx - 26} y={dy - 8} width={18} height={16} rx={2} className={part(Button.Left)} />
      <rect x={dx + 8} y={dy - 8} width={18} height={16} rx={2} className={part(Button.Right)} />
      {face.map(([x, y, bit, text]) => (
        <g key={bit}>
          <circle cx={x} cy={y} r={d.faceR} className={part(bit)} />
          <text x={x} y={y + 4} className="cm-label">
            {text}
          </text>
        </g>
      ))}
      {stick(d.lstick, pad.axes[0], pad.axes[1], Button.L3)}
      {stick(d.rstick, pad.axes[2], pad.axes[3], Button.R3)}
      {small(d.select, d.selectShape, Button.Coin)}
      {small(d.start, d.startShape, Button.Start)}
      {d.share && <rect x={d.share[0] - 6} y={d.share[1] - 3.5} width={12} height={7} rx={3.5} className={part(Button.Capture)} />}
      {d.capture && <rect x={d.capture[0] - 6} y={d.capture[1] - 6} width={12} height={12} rx={2} className={part(Button.Capture)} />}
      {d.homeRing && <circle cx={d.home[0]} cy={d.home[1]} r={d.homeR + 4} className="cm-line" />}
      <circle cx={d.home[0]} cy={d.home[1]} r={d.homeR} className={part(Button.Home)} />
      {d.mute && <rect x={d.mute[0] - 9} y={d.mute[1] - 3} width={18} height={6} rx={3} className="cm-part" />}
    </svg>
  );
}
