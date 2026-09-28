// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Small SVG charts for the device dashboard. No chart library: the paths
// are computed here and drawn with plain SVG.
import { useId } from "react";

type Point = [number, number];

/**
 * Maps values to points: y from max (top) to 0 (bottom). With slots, each
 * value takes one of that many places ending at the right edge, so a
 * history that is still filling up grows from "now" to the left.
 */
export function toPoints(
  values: readonly number[],
  w: number,
  h: number,
  max: number,
  slots?: number,
): Point[] {
  const n = values.length;
  const places = Math.max(slots ?? n, n, 2);
  return values.map((v, i) => [
    w - ((n - 1 - i) / (places - 1)) * w,
    h - (Math.min(Math.max(v, 0), max) / max) * (h - 2) - 1,
  ]);
}

/** A smooth line through the points (horizontal-tangent cubic curves). */
export function smoothPath(p: readonly Point[]): string {
  if (p.length === 0) return "";
  let d = `M${p[0]![0].toFixed(1)},${p[0]![1].toFixed(1)}`;
  for (let i = 1; i < p.length; i++) {
    const [x0, y0] = p[i - 1]!;
    const [x1, y1] = p[i]!;
    const mx = ((x0 + x1) / 2).toFixed(1);
    d += ` C${mx},${y0.toFixed(1)} ${mx},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

function areaPath(p: readonly Point[], w: number, h: number): string {
  return p.length
    ? `${smoothPath(p)} L${w},${h} L${p[0]![0].toFixed(1)},${h} Z`
    : "";
}

export interface Series {
  values: readonly number[];
  /** A CSS color (a token variable works). */
  color: string;
}

/** Large area chart with a grid, an optional dashed average and a pulsing dot on the latest value. */
export function AreaChart({
  series,
  max = 100,
  height = 260,
  average,
  label,
  slots,
}: {
  series: Series[];
  max?: number;
  height?: number;
  average?: number;
  label: string;
  slots?: number;
}) {
  const id = useId().replace(/:/g, "");
  const W = 800;
  const H = height;
  const lines = series.map((s) => ({
    ...s,
    p: toPoints(s.values, W, H, max, slots),
  }));
  const first = lines[0]?.p;
  const lastY = first && first.length ? first[first.length - 1]![1] : null;
  return (
    <svg
      className="dash-chart"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      style={{ height }}
    >
      <defs>
        {lines.map((s, i) => (
          <linearGradient
            key={i}
            id={`${id}-g${i}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0" stopColor={s.color} stopOpacity={0.36} />
            <stop offset="1" stopColor={s.color} stopOpacity={0} />
          </linearGradient>
        ))}
      </defs>
      <g className="dash-grid">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1="0"
            x2={W}
            y1={Math.min(Math.max(f * H, 1), H - 1)}
            y2={Math.min(Math.max(f * H, 1), H - 1)}
          />
        ))}
      </g>
      {average !== undefined && lines.length > 0 && (
        <line
          x1="0"
          x2={W}
          y1={H - (Math.min(average, max) / max) * (H - 2) - 1}
          y2={H - (Math.min(average, max) / max) * (H - 2) - 1}
          stroke={lines[0]!.color}
          strokeOpacity={0.5}
          strokeDasharray="4 6"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {lines.map((s, i) => (
        <g key={i}>
          <path d={areaPath(s.p, W, H)} fill={`url(#${id}-g${i})`} />
          <path
            d={smoothPath(s.p)}
            fill="none"
            stroke={s.color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
      {lastY !== null && (
        <>
          <circle
            className="dash-pulse"
            cx={W - 4}
            cy={lastY}
            r={5}
            fill={lines[0]!.color}
          />
          <circle
            cx={W - 4}
            cy={lastY}
            r={4.5}
            fill={lines[0]!.color}
            stroke="var(--color-surface)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  );
}

/** A tiny trend line, optionally filled, for the figure tiles. */
export function Sparkline({
  values,
  color,
  max,
  fill = true,
  dashed = false,
  height = 38,
}: {
  values: readonly number[];
  color: string;
  max: number;
  fill?: boolean;
  dashed?: boolean;
  height?: number;
}) {
  const W = 200;
  const p = toPoints(
    values.length ? values : [0],
    W,
    height,
    Math.max(max, 1e-9),
  );
  return (
    <svg
      className="dash-spark"
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ height }}
    >
      {fill && (
        <path d={areaPath(p, W, height)} fill={color} fillOpacity={0.14} />
      )}
      <path
        d={smoothPath(p)}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeDasharray={dashed ? "5 4" : undefined}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** A ring gauge: fraction 0..1 of the circle, with an optional second, thin slice. */
export function Ring({
  fraction,
  color,
  center,
  caption,
  size = 148,
  slice,
}: {
  fraction: number;
  color: string;
  center: string;
  caption?: string;
  size?: number;
  slice?: { fraction: number; color: string };
}) {
  const r = 64;
  const c = 2 * Math.PI * r;
  const f = Math.min(Math.max(fraction, 0), 1);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      className="dash-ring"
      aria-hidden="true"
    >
      <circle
        cx="80"
        cy="80"
        r={r}
        fill="none"
        stroke="var(--color-divider)"
        strokeWidth="16"
      />
      <circle
        cx="80"
        cy="80"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="16"
        strokeLinecap="round"
        strokeDasharray={`${(f * c).toFixed(1)} ${c.toFixed(1)}`}
        transform="rotate(-90 80 80)"
      />
      {slice && slice.fraction > 0 && (
        <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke={slice.color}
          strokeWidth="16"
          strokeDasharray={`${Math.max(slice.fraction * c, 4).toFixed(1)} ${c.toFixed(1)}`}
          strokeDashoffset={(
            -(f * c) + Math.max(slice.fraction * c, 4)
          ).toFixed(1)}
          transform="rotate(-90 80 80)"
        />
      )}
      <text
        x="80"
        y={caption ? 82 : 90}
        textAnchor="middle"
        className="dash-ring-value"
      >
        {center}
      </text>
      {caption && (
        <text x="80" y="104" textAnchor="middle" className="dash-ring-caption">
          {caption}
        </text>
      )}
    </svg>
  );
}
