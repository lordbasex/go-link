// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// What an animation looks like: Willy playing it in a loop, with a line on
// the move, shown while an animation of the prompt dialog is hovered or
// focused (T-29). Willy's sheet is the one play mode uses.

import { useEffect, useRef, useState } from "react";
import { frameOf, loadPlaySprites, drawFrame, type Sheet } from "../../play/sprites";

/** Willy's own animation that shows a preset name best; null when he has nothing like it. */
export const WILLY_EXAMPLE: Record<string, string | null> = {
  idle: "idle",
  walk: "run",
  run: "run",
  jump: "jump",
  land: "jump",
  turn: "turn",
  double_jump: "jump",
  jetpack: "jump",
  climb: null,
  climb_crate: null,
  crouch: "crouch",
  crawl: "crawl",
  shoot: "machine_gun",
  knife: "knife",
  jump_kick: "jump_kick",
  grenade: null,
  special: "bazooka",
  hit: null,
  death: null,
  thumbs_up: "thumbs_up",
  victory: "thumbs_up",
  yawn: "yawn",
  melee: "knife",
  worried: null,
  follow: "run",
  thanks: "thumbs_up",
  attack: "knife",
};

let willy: Promise<Sheet | null> | null = null;
function loadWilly(): Promise<Sheet | null> {
  willy ??= loadPlaySprites(`${import.meta.env.BASE_URL ?? "/"}destroy`.replace(/\/\/+/g, "/"))
    .then((s) => s.heroes[0] ?? null)
    .catch(() => null);
  return willy;
}

const H = 44 * 3;

export function AnimPreview({ name, frames, text, labels }: { name: string; frames: number; text: string; labels: { example: string; shownWith: (n: string) => string; none: string; frames: (n: number) => string } }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [sheet, setSheet] = useState<Sheet | null | undefined>(undefined);
  const example = WILLY_EXAMPLE[name] ?? null;
  const anim = example && sheet?.anims[example]?.frames.length ? example : null;

  useEffect(() => {
    let live = true;
    void loadWilly().then((s) => live && setSheet(s));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !sheet || !anim) return;
    const ref = sheet.frames[sheet.anims.idle?.frames[0] ?? ""];
    const start = performance.now();
    let id = 0;
    const draw = (now: number) => {
      // a one-shot animation plays again after a short rest
      const def = sheet.anims[anim]!;
      const len = def.loop ? Infinity : Math.ceil((def.frames.length / def.fps) * 60) + 30;
      const f = Math.floor(((now - start) / 1000) * 60);
      const box = frameOf(sheet, anim, Number.isFinite(len) ? f % len : f);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = false;
      if (box) drawFrame(ctx, sheet, box, ref, c.width / 2, c.height - 6, H, false);
      id = requestAnimationFrame(draw);
    };
    id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [sheet, anim]);

  return (
    <span className="wm-anim-pop" role="tooltip">
      {anim ? <canvas ref={canvas} width={200} height={H + 12} aria-hidden="true" /> : sheet !== undefined && <span className="wm-anim-none">{labels.none}</span>}
      <strong className="wm-mono">
        {name} · {labels.frames(frames)}
      </strong>
      <span>{text}</span>
      {anim && <span className="wm-dim">{anim === name ? labels.example : labels.shownWith(anim)}</span>}
    </span>
  );
}
