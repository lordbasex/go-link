// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useMemo, useRef, useState } from "react";
import { getLang } from "../../i18n";

/** One line of a time chart: a value per bucket, null where there is none. */
export interface TimeLine {
  key: string;
  label: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
}

/** A part of the time span to shade (a freeze). */
export interface TimeBand {
  from: number;
  to: number;
}

const W = 800;
const PAD = { left: 44, right: 8, top: 10, bottom: 22 };

/** A round top for the y axis: 1, 2 or 5 times a power of ten. */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Time ticks for a span: about five, on round minutes or hours. */
export function timeTicks(from: number, to: number, count = 5): number[] {
  const span = Math.max(to - from, 1);
  const steps = [1, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400].map((s) => s * 1000);
  const step = steps.find((s) => span / s <= count) ?? 86400000 * Math.ceil(span / 86400000 / count);
  const out: number[] = [];
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) out.push(t);
  return out;
}

function formatTick(t: number, span: number): string {
  const opts: Intl.DateTimeFormatOptions = span > 36 * 3600_000 ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" } : span > 600_000 ? { hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit", second: "2-digit" };
  return new Intl.DateTimeFormat(getLang(), opts).format(t);
}

/**
 * Lines over time with gaps where there is no sample, shaded bands (the
 * freezes), a y axis from 0 and a cursor that lists every line's value at
 * the bucket under the pointer.
 */
export function TimeChart({
  lines,
  from,
  step,
  unit,
  bands = [],
  height = 170,
  label,
  max,
}: {
  lines: TimeLine[];
  from: number;
  step: number;
  unit: string;
  bands?: TimeBand[];
  height?: number;
  label: string;
  max?: number;
}) {
  const n = Math.max(0, ...lines.map((l) => l.values.length));
  const to = from + Math.max(n - 1, 1) * step;
  const top = max ?? niceMax(Math.max(0, ...lines.flatMap((l) => l.values.filter((v): v is number => v !== null))) * 1.1);
  const H = height;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const xt = (t: number) => PAD.left + ((t - from) / Math.max(to - from, 1)) * plotW;
  const y = (v: number) => PAD.top + plotH - (Math.min(v, top) / top) * plotH;
  const paths = useMemo(
    () =>
      lines.map((l) => {
        let d = "";
        let pen = false;
        l.values.forEach((v, i) => {
          if (v === null) {
            pen = false;
            return;
          }
          d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
          pen = true;
        });
        return d;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, top, n, H],
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const ticks = timeTicks(from, to);
  const yTicks = [0, top / 2, top];
  const fmt = (v: number) => (v >= 100 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toString());

  return (
    <figure className="tchart">
      <svg
        ref={svgRef}
        className="tchart-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        style={{ height: H }}
        onPointerMove={(e) => {
          const r = svgRef.current?.getBoundingClientRect();
          if (!r || n < 1) return;
          const px = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(n - 1, Math.round(((px - PAD.left) / plotW) * (n - 1)))));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {bands.map((b, i) => (
          <rect key={i} className="tchart-band" x={xt(b.from)} y={PAD.top} width={Math.max(xt(b.to) - xt(b.from), 2)} height={plotH} />
        ))}
        {yTicks.map((v) => (
          <g key={v}>
            <line className="tchart-grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text className="tchart-axis" x={PAD.left - 6} y={y(v) + 4} textAnchor="end">
              {fmt(v)}
            </text>
          </g>
        ))}
        {ticks.map((t) => (
          <text key={t} className="tchart-axis" x={xt(t)} y={H - 6} textAnchor="middle">
            {formatTick(t, to - from)}
          </text>
        ))}
        {lines.map((l, i) => (
          <path key={l.key} d={paths[i]} className={`tchart-line${l.dashed ? " is-dashed" : ""}`} stroke={l.color} vectorEffect="non-scaling-stroke" />
        ))}
        {hover !== null && <line className="tchart-cursor" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} />}
      </svg>
      <figcaption className="tchart-legend small">
        {hover !== null && <span className="tchart-when mono">{formatTick(from + hover * step, 0)}</span>}
        {lines.map((l) => {
          const v = hover !== null ? l.values[hover] : null;
          return (
            <span key={l.key} className="tchart-key">
              <i style={{ background: l.color }} aria-hidden="true" />
              {l.label}
              {hover !== null && <b className="mono">{v === null || v === undefined ? "–" : `${fmt(v)} ${unit}`}</b>}
            </span>
          );
        })}
      </figcaption>
    </figure>
  );
}
