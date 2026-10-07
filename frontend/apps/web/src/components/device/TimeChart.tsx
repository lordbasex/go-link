// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { getLang } from "../../i18n";

/** One line of a time chart: a value per bucket, null where there is none. */
export interface TimeLine {
  key: string;
  label: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
}

/** A part of the time span to mark (a freeze). */
export interface TimeBand {
  from: number;
  to: number;
}

const W = 800;
const PAD = { left: 48, right: 8, top: 10, bottom: 22 };
/** A drag narrower than this (in chart units) is a click, not a zoom. */
const MIN_DRAG = 6;

/** A round top for the y axis: 1, 2 or 5 times a power of ten. */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Time ticks for a span: about six, on round seconds, minutes or hours. */
export function timeTicks(from: number, to: number, count = 6): number[] {
  const span = Math.max(to - from, 1);
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400].map((s) => s * 1000);
  const step = steps.find((s) => span / s <= count) ?? 86400000 * Math.ceil(span / 86400000 / count);
  const out: number[] = [];
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) out.push(t);
  return out;
}

/** A value on the y axis: 100000 reads 100k, 2500000 reads 2.5M. */
export function formatAxis(v: number): string {
  const short = (n: number) => (Math.round(n * 10) / 10).toString();
  if (v >= 1e6) return `${short(v / 1e6)}M`;
  if (v >= 1e4) return `${short(v / 1e3)}k`;
  return v >= 100 ? Math.round(v).toString() : short(v);
}

export function formatTick(t: number, span: number): string {
  const opts: Intl.DateTimeFormatOptions =
    span > 36 * 3600_000 ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" } : span > 600_000 ? { hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit", second: "2-digit" };
  return new Intl.DateTimeFormat(getLang(), opts).format(t);
}

/** What a chart hands out for a picture of itself (chartImage.ts). */
export interface TimeChartHandle {
  svg: () => SVGSVGElement | null;
}

/**
 * Lines over time with gaps where there is no sample, freezes marked under
 * the plot (and faintly over it), a y axis from 0 and a cursor that lists
 * every line's value at the bucket under the pointer. Dragging across the
 * plot picks a span to zoom into (onZoom); a double click goes back
 * (onReset).
 */
export const TimeChart = forwardRef<
  TimeChartHandle,
  {
    lines: TimeLine[];
    from: number;
    step: number;
    unit: string;
    bands?: TimeBand[];
    height?: number;
    label: string;
    max?: number;
    onZoom?: (from: number, to: number) => void;
    onReset?: () => void;
  }
>(function TimeChart({ lines, from, step, unit, bands = [], height = 170, label, max, onZoom, onReset }, ref) {
  const n = Math.max(0, ...lines.map((l) => l.values.length));
  const to = from + Math.max(n - 1, 1) * step;
  const top = max ?? niceMax(Math.max(0, ...lines.flatMap((l) => l.values.filter((v): v is number => v !== null))) * 1.1);
  const H = height;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const xt = (t: number) => PAD.left + ((t - from) / Math.max(to - from, 1)) * plotW;
  const tx = (px: number) => from + ((Math.max(PAD.left, Math.min(W - PAD.right, px)) - PAD.left) / plotW) * (to - from);
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
  useImperativeHandle(ref, () => ({ svg: () => svgRef.current }), []);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const ticks = timeTicks(from, to);
  const yTicks = [0, top / 2, top];
  const fmt = (v: number) => (v >= 100 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toString());
  const toChart = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    return r ? ((clientX - r.left) / r.width) * W : 0;
  };

  return (
    <figure className="tchart">
      <svg
        ref={svgRef}
        className={`tchart-svg${onZoom ? " can-zoom" : ""}`}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        style={{ height: H }}
        onPointerDown={(e) => {
          if (!onZoom || e.button !== 0 || e.pointerType === "touch") return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const px = toChart(e.clientX);
          setDrag({ a: px, b: px });
        }}
        onPointerMove={(e) => {
          const px = toChart(e.clientX);
          if (drag) setDrag({ ...drag, b: px });
          if (n < 1) return;
          setHover(Math.max(0, Math.min(n - 1, Math.round(((px - PAD.left) / plotW) * (n - 1)))));
        }}
        onPointerUp={() => {
          if (drag && Math.abs(drag.b - drag.a) >= MIN_DRAG && onZoom) {
            const a = tx(Math.min(drag.a, drag.b));
            const b = tx(Math.max(drag.a, drag.b));
            if (b - a >= 2 * step) onZoom(Math.round(a), Math.round(b));
          }
          setDrag(null);
        }}
        onPointerCancel={() => setDrag(null)}
        onDoubleClick={() => onReset?.()}
        onPointerLeave={() => !drag && setHover(null)}
      >
        {bands.map((b, i) => (
          <g key={i}>
            <rect className="tchart-band" x={xt(b.from)} y={PAD.top} width={Math.max(xt(b.to) - xt(b.from), 2)} height={plotH} />
            <rect className="tchart-band-mark" x={xt(b.from)} y={PAD.top + plotH - 4} width={Math.max(xt(b.to) - xt(b.from), 3)} height={4} />
          </g>
        ))}
        {yTicks.map((v) => (
          <g key={v}>
            <line className="tchart-grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text className="tchart-axis" x={PAD.left - 6} y={y(v) + 4} textAnchor="end">
              {formatAxis(v)}
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
        {drag && Math.abs(drag.b - drag.a) >= 1 && (
          <rect className="tchart-pick" x={Math.max(PAD.left, Math.min(drag.a, drag.b))} y={PAD.top} width={Math.min(Math.abs(drag.b - drag.a), W - PAD.right - Math.min(drag.a, drag.b))} height={plotH} />
        )}
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
});
