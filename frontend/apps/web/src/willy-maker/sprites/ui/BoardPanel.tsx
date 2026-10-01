// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// What the board shows: the animation playing at 1x and 4x, the height on
// screen, the palette zones with their 15-color meters and the color error.

import { useEffect, useMemo, useRef } from "react";
import type { ScaledFrame } from "@go-link/cps1";
import type { DraftAnim, ZoneResult } from "../convert";
import { MAX_COLORS } from "../convert";
import { SCREEN_H } from "../presets";
import type { SpritesMessages } from "../../i18n/sprites.en";
import type { Lang } from "../../i18n";
import { fmt, num } from "../text";

export interface BoardPanelProps {
  t: SpritesMessages;
  lang: Lang;
  animName: string | null;
  anim: DraftAnim | null;
  /** Board pictures by frame id. */
  frames: ReadonlyMap<string, ScaledFrame>;
  height: number;
  /** The character's height in the sheet. */
  sourceHeight: number;
  zones: ZoneResult | null;
  swapColors: readonly string[];
  onToggleSwap(hex: string): void;
}

/** Over this many colors in a zone the art is painted, not pixel art: one note instead of merge hints. */
const PAINTED = 45;

/** One canvas box that fits every frame of the animation, feet on one point. */
function stageOf(list: ScaledFrame[]) {
  let left = 1;
  let right = 1;
  let top = 1;
  let bottom = 1;
  for (const f of list) {
    left = Math.max(left, f.px);
    right = Math.max(right, f.w - f.px);
    top = Math.max(top, f.py + 1);
    bottom = Math.max(bottom, f.h - f.py - 1);
  }
  return { w: left + right, h: top + bottom, left, top };
}

function AnimPreview({ list, fps, label }: { list: ScaledFrame[]; fps: number; label: string }) {
  const one = useRef<HTMLCanvasElement>(null);
  const four = useRef<HTMLCanvasElement>(null);
  const stage = useMemo(() => stageOf(list), [list]);

  useEffect(() => {
    const canvases = [one.current, four.current].filter((c): c is HTMLCanvasElement => !!c);
    for (const [i, c] of canvases.entries()) {
      c.width = stage.w;
      c.height = stage.h;
      c.style.width = `${stage.w * (i === 0 ? 1 : 4)}px`;
      c.style.height = `${stage.h * (i === 0 ? 1 : 4)}px`;
    }
    const ctxs = canvases.map((c) => c.getContext("2d")).filter((c): c is CanvasRenderingContext2D => !!c);
    if (!ctxs.length || !list.length || typeof ImageData === "undefined") return;
    let i = 0;
    const draw = () => {
      const f = list[i % list.length]!;
      const img = new ImageData(stage.w, stage.h);
      const ox = stage.left - f.px;
      const oy = stage.top - f.py - 1;
      for (let y = 0; y < f.h; y++) img.data.set(f.rgba.subarray(y * f.w * 4, (y + 1) * f.w * 4), ((oy + y) * stage.w + ox) * 4);
      for (const ctx of ctxs) ctx.putImageData(img, 0, 0);
      i++;
    };
    draw();
    if (list.length < 2) return;
    const timer = window.setInterval(draw, 1000 / Math.max(1, fps));
    return () => window.clearInterval(timer);
  }, [list, fps, stage]);

  return (
    <div className="wms-preview stage-tokens" role="img" aria-label={label}>
      <canvas ref={one} className="wms-px" />
      <canvas ref={four} className="wms-px" />
    </div>
  );
}

export function BoardPanel({ t, lang, animName, anim, frames, height, sourceHeight, zones, swapColors, onToggleSwap }: BoardPanelProps) {
  const list = useMemo(() => (anim?.frames ?? []).map((id) => frames.get(id)).filter((f): f is ScaledFrame => !!f), [anim, frames]);
  const pct = (height / SCREEN_H) * 100;
  const word = (d: number) => (d < 1 ? t.invisible : d < 2.5 ? t.subtle : t.visible);
  const ratio = sourceHeight ? height / sourceHeight : 1;
  return (
    <section className="wms-card wms-board" aria-labelledby="wms-board-title">
      <div className="wms-board-preview">
        <h3 className="wms-h" id="wms-board-title">
          {t.preview}
        </h3>
        {list.length ? <AnimPreview list={list} fps={anim?.fps ?? 10} label={fmt(t.previewLabel, { anim: animName ?? "" })} /> : <p className="wms-note">{t.previewEmpty}</p>}
        <p className="wms-mono wms-ok">{fmt(t.heightNote, { px: height, pct: num(pct, lang) })}</p>
        {ratio < 0.98 ? <p className="wms-note">{fmt(t.shrunk, { src: Math.round(sourceHeight) })}</p> : null}
        {ratio > 1.02 ? <p className="wms-warn">{fmt(t.enlarged, { src: Math.round(sourceHeight) })}</p> : null}
      </div>
      <div className="wms-zones">
        <h3 className="wms-h">{t.zones}</h3>
        {zones?.zones.some((z) => z.used > PAINTED) ? <p className="wms-alert">⚠ {fmt(t.painted, { n: Math.max(...zones.zones.map((z) => z.used)) })}</p> : null}
        {(zones?.zones ?? []).map((z) => {
          const name = fmt(t.zoneKind[z.kind], { n: z.index + 1 });
          return (
            <div key={z.index} className="wms-zone" data-level={z.level}>
              <div className="wms-zone-head">
                <span>{name}</span>
                <span className="wms-mono wms-zone-count">
                  {z.used} / {MAX_COLORS}
                </span>
              </div>
              <div className="wms-meter" aria-hidden="true">
                <span className="wms-meter-fill" ref={(el) => el?.style.setProperty("--fill", `${Math.min(100, (z.used / MAX_COLORS) * 100)}%`)} />
              </div>
              <div className="wms-swatches">
                {z.palette.map((hex) => {
                  const on = swapColors.includes(hex);
                  return (
                    <button
                      key={hex}
                      type="button"
                      className={`wms-swatch${on ? " is-swap" : ""}`}
                      ref={(el) => el?.style.setProperty("--sw", hex)}
                      aria-pressed={on}
                      aria-label={fmt(on ? t.swapOn : t.swapOff, { hex })}
                      data-tip={hex}
                      onClick={() => onToggleSwap(hex)}
                    />
                  );
                })}
              </div>
              {z.level === "over" && z.closest && z.used <= PAINTED ? <p className="wms-alert">⚠ {fmt(t.zoneOver, { zone: name, n: z.used, a: z.closest.a, b: z.closest.b, d: num(z.closest.deltaE, lang) })}</p> : null}
            </div>
          );
        })}
        {zones ? (
          <>
            <p className="wms-note">{t.zoneSwap}</p>
            <p className="wms-note">{fmt(t.snapNote, { snap: num(zones.snapMeanDeltaE, lang), word: word(zones.snapMeanDeltaE) })}</p>
            <p className="wms-note">{fmt(t.fitNote, { mean: num(zones.meanDeltaE, lang), max: num(zones.maxDeltaE, lang) })}</p>
          </>
        ) : null}
      </div>
    </section>
  );
}
