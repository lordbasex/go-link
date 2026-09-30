// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// A skin drawn exactly as the apps draw it (SkinPad.swift / SkinPad.kt):
// the plastic, its decor, the picture in its bezel, the D-pad, the action
// buttons, Coin and the starts, and the menu capsule, as SVG elements.
import { useId } from "react";
import { t } from "../i18n";
import { inset, midX, midY, type Computed, type Orient, type Rect, type Screen } from "./layout";
import { buttonLabel, design, hex, menuStyle, palette, shapePath, type EditSkin } from "./model";

/** The go-link test card, roughly: a grey grid, color bars and grey steps. */
function TestCard({ r }: { r: Rect }) {
  const step = r.w / 16;
  const bars = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"];
  const bx = r.x + r.w * 0.19;
  const bw = r.w * 0.62;
  const rows: number[] = [];
  for (let y = r.y + step; y < r.y + r.h; y += step) rows.push(y);
  return (
    <g>
      <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="#6e6e6e" />
      {Array.from({ length: 15 }, (_, i) => (
        <line key={`v${i}`} x1={r.x + (i + 1) * step} y1={r.y} x2={r.x + (i + 1) * step} y2={r.y + r.h} stroke="#fff" strokeWidth={1} />
      ))}
      {rows.map((y) => (
        <line key={`h${y}`} x1={r.x} y1={y} x2={r.x + r.w} y2={y} stroke="#fff" strokeWidth={1} />
      ))}
      <rect x={bx} y={r.y + r.h * 0.18} width={bw} height={r.h * 0.64} fill="#000" />
      {bars.map((c, i) => (
        <rect key={c} x={bx + (i * bw) / 7} y={r.y + r.h * 0.26} width={bw / 7} height={r.h * 0.2} fill={c} />
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={`g${i}`} x={bx + (i * bw) / 8} y={r.y + r.h * 0.48} width={bw / 8} height={r.h * 0.08} fill={`rgb(${i * 36},${i * 36},${i * 36})`} />
      ))}
      <text x={r.x + r.w / 2} y={r.y + r.h * 0.74} fill="#f2a33a" fontSize={r.h * 0.1} fontWeight={700} textAnchor="middle" fontFamily="ui-monospace, Menlo, monospace">
        GO-LINK
      </text>
    </g>
  );
}

/** The seven round buttons of the room's menu, as outline symbols (the apps show real icons). */
const MENU_ICONS = ["M-3,-4a3,3 0 0 1 6,0v4a3,3 0 0 1-6,0zM-5,1a5,5 0 0 0 10,0", "M-5,-2h3l4,-3v10l-4,-3h-3zM4,-2a3,3 0 0 1 0,4", "M-3,-4v8M3,-4v8", "M-5,-4h10v6h-6l-4,3z", "M-2,-1a2.5,2.5 0 1 0 0.1,0M-6,6a4,4 0 0 1 8,0M3,-2a2,2 0 1 0 0.1,0M3,6a3,3 0 0 1 3,-3", "M-6,-2h12a3,3 0 0 1 0,6h-12a3,3 0 0 1 0,-6zM-3,0v2M-4,1h2", "M0,-3a3,3 0 1 0 0.1,0M0,-6v2M0,4v2M-6,0h2M4,0h2"];

export function SkinPhone({
  skin,
  orient,
  dev,
  layout: l,
  held,
  picture,
  background,
}: {
  skin: EditSkin;
  orient: Orient;
  dev: Screen;
  layout: Computed;
  held: boolean;
  /** A picture shown in the screen instead of the test card (never saved). */
  picture: string | null;
  /** The skin's own background picture for this orientation, if opened. */
  background: string | null;
}) {
  const uid = useId().replace(/:/g, "");
  const id = (name: string) => `${uid}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;
  const s = skin;
  const sh = s.shell ?? {};
  const center = hex(sh.center, "#8a8c94");
  const edge = hex(sh.edge, "#3c3d44");
  const rim = hex(sh.rim, "#d8d9de");
  const gloss = typeof sh.gloss === "number" ? sh.gloss : 0.3;
  const grain = typeof sh.grain === "number" ? sh.grain : 0.06;
  const p = palette(s);
  const ds = design(s);
  const m = menuStyle(s);
  const w = ds.well;
  const decor = s.decor[orient];
  const bezel = inset(l.screen, -8, -8);

  // D-pad geometry in Kenney's 128-unit square.
  const dp = l.dpad;
  const u = (dp.w * 0.86) / 128;
  const ox = dp.x + dp.w * 0.07;
  const oy = dp.y + dp.w * 0.07;
  const P = (x: number, y: number) => `${ox + x * u},${oy + y * u}`;
  const A = ds.dpadArm * 128;
  const lo = 64 - A / 2;
  const hi = 64 + A / 2;
  const cr = ds.dpadRadius * A;
  const e = 6;
  const facePts = [[e, lo + e], [lo + e, lo + e], [lo + e, e], [hi - e, e], [hi - e, lo + e], [128 - e, lo + e], [128 - e, hi - e], [hi - e, hi - e], [hi - e, 128 - e], [lo + e, 128 - e], [lo + e, hi - e], [e, hi - e]]
    .map(([x, y]) => P(x!, y!))
    .join(" ");
  const hw = Math.min(5, A / 2 - e - 2);

  // The menu capsule, as the apps draw it (7 buttons), shrunk to fit its box.
  const n = 7;
  const bs = l.menuButton;
  const gap = 6 * (bs / 44);
  const len = n * bs + (n - 1) * gap + 12 * (bs / 44);
  const thick = bs + 12 * (bs / 44);
  const fitK = Math.min(1, l.menu.w / (l.menuVertical ? thick : len), l.menu.h / (l.menuVertical ? len : thick));
  const cw = (l.menuVertical ? thick : len) * fitK;
  const ch = (l.menuVertical ? len : thick) * fitK;
  const mx = midX(l.menu) - cw / 2;
  const my = midY(l.menu) - ch / 2;

  const pill = (r: Rect, text: string, mine: boolean, on: boolean, key: string) => {
    const k = on ? 0.95 : 1;
    const ins = r.h * (5 / 64);
    const grow = w ? r.h * w.size : 0;
    return (
      <g key={key}>
        {w && <rect x={r.x - grow} y={r.y - grow} width={r.w + 2 * grow} height={r.h + 2 * grow} rx={r.h / 2 + grow} fill={url("wellFill")} stroke={url("wellEdge")} strokeWidth={1.5} />}
        <g transform={`translate(${midX(r)} ${midY(r)}) scale(${k})`} filter={url("drop")}>
          <rect x={-r.w / 2} y={-r.h / 2} width={r.w} height={r.h} rx={r.h / 2} fill={url("ring")} />
          <rect x={-r.w / 2 + ins} y={-r.h / 2 + ins} width={r.w - 2 * ins} height={r.h - 2 * ins} rx={r.h / 2 - ins} fill={on ? url("held") : p.face} stroke={mine ? "#f2a33a" : p.outline} strokeWidth={mine ? 1.5 : 1} />
          {ds.dome > 0 && <rect x={-r.w / 2 + ins} y={-r.h / 2 + ins} width={r.w - 2 * ins} height={r.h - 2 * ins} rx={r.h / 2 - ins} fill={url(on ? "domeHeld" : "dome")} />}
          <text y={r.h * 0.13} fill={p.label} fontSize={r.h * 0.36} fontWeight={700} textAnchor="middle" fontFamily="ui-rounded, system-ui, sans-serif">
            {text}
          </text>
        </g>
      </g>
    );
  };

  return (
    <svg width={dev.w} height={dev.h} viewBox={`0 0 ${dev.w} ${dev.h}`} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <radialGradient id={id("shell")} cx={dev.w / 2} cy={dev.h * 0.45} r={Math.max(dev.w, dev.h) * 0.62} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={center} />
          <stop offset=".55" stopColor={center} />
          <stop offset="1" stopColor={edge} />
        </radialGradient>
        <linearGradient id={id("gloss")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={gloss} />
          <stop offset=".12" stopColor="#fff" stopOpacity={gloss / 6} />
          <stop offset=".85" stopColor="#000" stopOpacity={0} />
          <stop offset="1" stopColor="#000" stopOpacity={0.3} />
        </linearGradient>
        <filter id={id("grain")} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves={2} seed={7} />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope={Math.min(1, grain * 2.2) * 0.35} />
          </feComponentTransfer>
        </filter>
        <filter id={id("soft")}>
          <feGaussianBlur stdDeviation=".8" />
        </filter>
        <pattern id={id("dots")} width="9" height="9" patternUnits="userSpaceOnUse">
          <circle cx="4.5" cy="4.5" r="1.7" fill="#000" />
        </pattern>
        <linearGradient id={id("ring")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.ringTop} />
          <stop offset="1" stopColor={p.ringBottom} />
        </linearGradient>
        <linearGradient id={id("held")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.heldTop} />
          <stop offset="1" stopColor={p.heldBottom} />
        </linearGradient>
        <filter id={id("drop")} x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy={held ? 1 : 5} stdDeviation={held ? 1.5 : 4} floodOpacity={0.42} />
        </filter>
        <linearGradient id={id("wellFill")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={w ? w.color : "#000"} stopOpacity={w ? 0.55 * w.depth : 0} />
          <stop offset="1" stopColor={w ? w.color : "#000"} stopOpacity={w ? 0.18 * w.depth : 0} />
        </linearGradient>
        <linearGradient id={id("wellEdge")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity={w ? 0.45 * w.depth : 0} />
          <stop offset="1" stopColor="#fff" stopOpacity={w ? 0.3 * w.depth : 0} />
        </linearGradient>
        <linearGradient id={id("dome")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0.5 * ds.dome} />
          <stop offset=".45" stopColor="#fff" stopOpacity={0} />
          <stop offset=".75" stopColor="#000" stopOpacity={0} />
          <stop offset="1" stopColor="#000" stopOpacity={0.22 * ds.dome} />
        </linearGradient>
        <linearGradient id={id("domeHeld")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity={0.22 * ds.dome} />
          <stop offset=".6" stopColor="#000" stopOpacity={0} />
          <stop offset="1" stopColor="#fff" stopOpacity={0.14 * ds.dome} />
        </linearGradient>
        {decor.map((d, i) =>
          d.shape === "grill" ? (
            <clipPath key={i} id={id(`grill${i}`)}>
              <rect x={d.x * dev.w} y={d.y * dev.h} width={d.w * dev.w} height={d.h * dev.h} rx={d.radius} />
            </clipPath>
          ) : null,
        )}
      </defs>

      {/* The plastic, or the skin's own picture. */}
      {background ? (
        <image href={background} x={0} y={0} width={dev.w} height={dev.h} preserveAspectRatio="xMidYMid slice" />
      ) : (
        <rect width={dev.w} height={dev.h} fill={url("shell")} />
      )}
      <g filter={url("soft")}>
        {decor.map((d, i) =>
          d.shape === "grill" ? (
            <rect key={i} x={d.x * dev.w} y={d.y * dev.h} width={d.w * dev.w} height={d.h * dev.h} fill={url("dots")} opacity={d.opacity} clipPath={url(`grill${i}`)} />
          ) : (
            <rect key={i} x={d.x * dev.w} y={d.y * dev.h} width={d.w * dev.w} height={d.h * dev.h} rx={d.radius} fill={hex(d.fill, "#ffffff")} fillOpacity={d.opacity} stroke="#fff" strokeOpacity={d.stroke} strokeWidth={1.2} />
          ),
        )}
        {s.rings !== false &&
          [l.leftRing, l.rightRing].map((r, i) => (
            <ellipse key={i} cx={midX(r)} cy={midY(r)} rx={r.w / 2} ry={r.h / 2} fill="#fff" fillOpacity={0.06} stroke="#fff" strokeOpacity={0.22} strokeWidth={1.5} />
          ))}
      </g>
      {s.screws !== false &&
        [[30, 30], [dev.w - 30, 30], [30, dev.h - 30], [dev.w - 30, dev.h - 30]].map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <circle cx={x} cy={y} r={6} fill="#fff" fillOpacity={0.18} stroke="#000" strokeOpacity={0.25} />
            <line x1={x! - 4} y1={y} x2={x! + 4} y2={y} stroke="#000" strokeOpacity={0.35} strokeWidth={1.4} />
          </g>
        ))}
      {grain > 0 && <rect width={dev.w} height={dev.h} filter={url("grain")} />}
      <rect width={dev.w} height={dev.h} fill={url("gloss")} />
      <rect x={2} y={2} width={dev.w - 4} height={dev.h - 4} rx={50} fill="none" stroke={rim} strokeOpacity={0.9} strokeWidth={4} />
      <rect x={9} y={9} width={dev.w - 18} height={dev.h - 18} rx={44} fill="none" stroke="#fff" strokeOpacity={0.12} strokeWidth={2} />

      {/* The bezel and the picture. */}
      <rect x={bezel.x} y={bezel.y} width={bezel.w} height={bezel.h} rx={18} fill={hex(s.screen.bezel, "#07080c")} filter={url("drop")} />
      {picture ? (
        <image href={picture} x={l.screen.x} y={l.screen.y} width={l.screen.w} height={l.screen.h} preserveAspectRatio="none" />
      ) : (
        <svg x={l.screen.x} y={l.screen.y} width={l.screen.w} height={l.screen.h} viewBox={`${l.screen.x} ${l.screen.y} ${l.screen.w} ${l.screen.h}`}>
          <TestCard r={l.screen} />
        </svg>
      )}
      {l.label && s.screen.label ? (
        <text x={l.label.x} y={l.label.y + 3.5} fill="#fff" fillOpacity={0.45} fontSize={10} fontWeight={700} letterSpacing={3} textAnchor="middle" fontFamily="ui-monospace, Menlo, monospace">
          {s.screen.label}
        </text>
      ) : null}

      {/* The room's header. */}
      <text x={l.header.x + 14} y={l.header.y + l.header.h / 2 + 6} fill="#c4cad6" fontSize={18}>
        ✕
      </text>
      {orient === "portrait" && (
        <>
          <text x={l.header.x + 50} y={l.header.y + l.header.h / 2 - 1} fill="#e9ecf2" fontSize={16} fontWeight={600}>
            {t.skinEditor.sampleRoom}
          </text>
          <text x={l.header.x + 50} y={l.header.y + l.header.h / 2 + 14} fill="#e9ecf2" fillOpacity={0.7} fontSize={11}>
            P1
          </text>
        </>
      )}

      {/* D-pad: a hollow (or the plain dark well), the cross by the skin's arm and corners, its marks. */}
      {w ? (
        <path d={shapePath("circle", midX(dp), midY(dp), dp.w)} fill={url("wellFill")} stroke={url("wellEdge")} strokeWidth={1.5} />
      ) : (
        <circle cx={midX(dp)} cy={midY(dp)} r={dp.w / 2} fill="#000" fillOpacity={0.2} stroke="#fff" strokeOpacity={0.12} strokeWidth={2} />
      )}
      <g transform={held ? `translate(${midX(dp)} ${midY(dp)}) skewY(-2) scale(0.97 1) translate(${-midX(dp)} ${-midY(dp)})` : undefined}>
        <g filter={url("drop")}>
          <rect x={ox + lo * u} y={oy} width={A * u} height={128 * u} rx={cr * u} fill={url("ring")} />
          <rect x={ox} y={oy + lo * u} width={128 * u} height={A * u} rx={cr * u} fill={url("ring")} />
        </g>
        <polygon points={facePts} fill={p.face} />
        {held && <rect x={ox + (hi - e) * u} y={oy + (lo + e) * u} width={(128 - e - (hi - e)) * u} height={(A - 2 * e) * u} fill={url("held")} />}
        {ds.dome > 0 && <polygon points={facePts} fill={url("dome")} />}
        <polygon points={facePts} fill="none" stroke={p.outline} />
        {ds.dpadMarks === "arrows" && (
          <>
            <circle cx={ox + 64 * u} cy={oy + 64 * u} r={3 * u} fill={p.mark} />
            {[[[64, 19], [64 + hw, 27], [64 - hw, 27]], [[64, 109], [64 + hw, 101], [64 - hw, 101]], [[19, 64], [27, 64 - hw], [27, 64 + hw]], [[109, 64], [101, 64 - hw], [101, 64 + hw]]].map((tri, i) => (
              <polygon key={i} points={tri.map(([x, y]) => P(x!, y!)).join(" ")} fill={p.mark} />
            ))}
          </>
        )}
        {ds.dpadMarks === "lines" &&
          [[[64, 16], [64, 34]], [[64, 94], [64, 112]], [[16, 64], [34, 64]], [[94, 64], [112, 64]]].map(([a, b], i) => (
            <line key={i} x1={ox + a![0]! * u} y1={oy + a![1]! * u} x2={ox + b![0]! * u} y2={oy + b![1]! * u} stroke={p.mark} strokeWidth={4 * u} strokeLinecap="round" />
          ))}
        {ds.dpadMarks === "dots" &&
          [[64, 64], [64, 24], [64, 104], [24, 64], [104, 64]].map(([x, y], i) => <circle key={i} cx={ox + x! * u} cy={oy + y! * u} r={3.5 * u} fill={p.mark} />)}
      </g>

      {/* Action buttons: the skin's shape, ring and labels, a hollow and a dome. */}
      {l.faces.map((f, i) => {
        const on = held && i === 0;
        const size = f.w;
        const cx = midX(f);
        const cy = midY(f);
        const innerSize = size * (1 - 2 * ds.ring);
        const text = buttonLabel(ds, i + 1);
        return (
          <g key={i}>
            {w && <path d={shapePath(ds.shape, cx, cy, size * (1 + 2 * w.size))} fill={url("wellFill")} stroke={url("wellEdge")} strokeWidth={1.5} />}
            <g transform={`translate(${cx} ${cy}) scale(${on ? 0.93 : 1}) translate(${-cx} ${-cy})`} filter={url("drop")}>
              <path d={shapePath(ds.shape, cx, cy, size)} fill={url("ring")} />
              <path d={shapePath(ds.shape, cx, cy, innerSize)} fill={on ? url("held") : p.face} stroke={p.outline} />
              {ds.dome > 0 && <path d={shapePath(ds.shape, cx, cy, innerSize)} fill={url(on ? "domeHeld" : "dome")} />}
              {text && (
                <text x={cx} y={cy + size * 0.13 + (on ? 1 : 0)} fill={on ? p.litLabel : p.label} fontSize={size * 0.36} fontWeight={700} textAnchor="middle" fontFamily="ui-rounded, system-ui, sans-serif">
                  {text}
                </text>
              )}
            </g>
          </g>
        );
      })}

      {/* Coin and the starts. */}
      {pill(l.coin, t.touch.coin, false, false, "coin")}
      {l.starts.map((r, i) => pill(r, t.touch.startPlayer(i + 1), i === 0, held && i === 0, `start${i}`))}

      {/* The room's menu capsule. */}
      <rect x={mx} y={my} width={cw} height={ch} rx={Math.min(cw, ch) / 2} fill={m.fill} fillOpacity={m.fillOpacity} stroke={m.border} strokeOpacity={m.borderOpacity} />
      {MENU_ICONS.map((d, i) => {
        const on = i === 1 || i === 5;
        const step = (bs + gap) * fitK;
        const c0 = (6 * (bs / 44) + bs / 2) * fitK;
        const cx = l.menuVertical ? mx + cw / 2 : mx + c0 + i * step;
        const cy = l.menuVertical ? my + c0 + i * step : my + ch / 2;
        const scale = (bs * fitK) / 26;
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={(bs / 2) * fitK * 0.92} fill={on ? m.activeButton : m.button} stroke={on ? m.active : m.icon} strokeOpacity={on ? 0.5 : 0.18} />
            <path d={d} transform={`translate(${cx} ${cy}) scale(${scale})`} fill="none" stroke={on ? m.active : m.icon} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        );
      })}

      {/* The playable area. */}
      <rect x={l.area.x} y={l.area.y} width={l.area.w} height={l.area.h} fill="none" stroke="#fff" strokeOpacity={0.25} strokeDasharray="4 4" />
    </svg>
  );
}
