// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The game's canvas: fixed over the window, drawing the hero, the people to
// rescue, bullets, rockets, blasts and debris at their page positions minus
// the scroll. The page itself (the copy) is DOM underneath.

import { drawAnim, type Atlas } from "../assets/atlas";
import type { CivilianKind } from "../engine/civilian";
import type { EnemyKind } from "../engine/enemy";
import { BAR_TIME, type Game } from "../engine/game";
import { JET_FUEL } from "../engine/player";

/** How tall each villain is drawn, as a share of the hero. */
const FOE_SIZE: Record<EnemyKind, number> = { robot: 1.02, blonde: 0.95, alien: 1 };
/** How tall each character is drawn, as a share of the hero. */
const NPC_SIZE: Record<CivilianKind, number> = { woman: 0.95, child: 0.74, baby: 0.5, elder: 0.9 };

export interface Palette {
  accent: string;
  danger: string;
  ok: string;
  text: string;
  bg: string;
}

export function readPalette(el: Element): Palette {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return { accent: v("--color-accent", "#f2a33a"), danger: v("--color-p3", "#e0627a"), ok: v("--color-ok", "#7ee2a8"), text: v("--color-text", "#e9ecf2"), bg: v("--color-bg", "#0e1016") };
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  /** The hero's height on screen, in CSS pixels. */
  heroHeight = 76;

  constructor(
    doc: Document,
    z: number,
    private player: Atlas,
    private npcs: Atlas,
    private pal: Palette,
    /** Each villain's atlas in its color variants. */
    private foes: Partial<Record<EnemyKind, Atlas[]>> = {},
  ) {
    const c = doc.createElement("canvas");
    c.className = "dz-canvas";
    c.setAttribute("data-destroy-ui", "");
    c.setAttribute("aria-hidden", "true");
    c.style.position = "fixed";
    c.style.inset = "0";
    c.style.width = "100vw";
    c.style.height = "100dvh";
    c.style.zIndex = String(z);
    c.style.pointerEvents = "none";
    doc.body.appendChild(c);
    this.canvas = c;
    this.ctx = c.getContext("2d")!;
    this.resize();
  }

  resize(): void {
    const win = this.canvas.ownerDocument.defaultView!;
    this.dpr = Math.min(2, win.devicePixelRatio || 1);
    this.canvas.width = Math.round(win.innerWidth * this.dpr);
    this.canvas.height = Math.round(win.innerHeight * this.dpr);
    this.heroHeight = win.innerWidth < 700 ? 58 : 76;
  }

  dispose(): void {
    this.canvas.remove();
  }

  /** The hero's drawing scale (atlas pixels to page pixels). */
  heroScale(): number {
    return this.scaleFor(this.player, "idle", this.heroHeight);
  }

  private scaleFor(atlas: Atlas, idleAnim: string, height: number): number {
    const first = atlas.anims[idleAnim]?.frames[0];
    const f = first ? atlas.frames[first] : undefined;
    return f ? height / f.h : 0.6;
  }

  draw(g: Game, scrollX: number, scrollY: number, shake: { x: number; y: number }, rescuable: number, now: number): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, (-scrollX + shake.x) * this.dpr, (-scrollY + shake.y) * this.dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const top = scrollY - 200;
    const bottom = scrollY + h / this.dpr + 200;

    // Blasts.
    for (const f of g.flashes) {
      const k = f.life / 0.35;
      const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * (1.2 - k * 0.4));
      grad.addColorStop(0, `rgba(255, 245, 214, ${0.9 * k})`);
      grad.addColorStop(0.35, `rgba(242, 163, 58, ${0.7 * k})`);
      grad.addColorStop(1, "rgba(224, 98, 122, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Bullets.
    ctx.lineCap = "round";
    for (const t of g.tracers) {
      ctx.strokeStyle = this.pal.accent;
      ctx.globalAlpha = Math.max(0, t.life / 0.06);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(t.x0, t.y0);
      ctx.lineTo(t.x1, t.y1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Rockets.
    for (const r of g.rockets) {
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(Math.atan2(r.dy, r.dx));
      ctx.fillStyle = "#6b7a3a";
      ctx.fillRect(-12, -4, 24, 8);
      ctx.fillStyle = this.pal.danger;
      ctx.fillRect(10, -4, 4, 8);
      ctx.fillStyle = this.pal.accent;
      ctx.fillRect(-22, -3, 8, 6);
      ctx.restore();
    }
    // Debris.
    for (const p of g.particles.list) {
      if (p.y < top || p.y > bottom) continue;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / (p.max * 0.5)));
      ctx.fillStyle = p.color;
      if (p.spark) ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    // The people to rescue: worried with a pulsing HELP! bubble while they
    // wait; once rescued they cheer, then a beam of light lifts them away.
    const npcScale = this.scaleFor(this.npcs, "woman_idle", this.heroHeight);
    g.civilians.forEach((c, i) => {
      if (c.state === "gone" || c.m.y < top || c.m.y - 100 > bottom) return;
      const { anim, t } = c.pose();
      const s = npcScale * NPC_SIZE[c.kind];
      const tall = this.heroHeight * NPC_SIZE[c.kind];
      const lift = c.lift;
      if (lift > 0 || c.state === "cheering") this.beam(ctx, c.m.x, c.m.y, scrollY, lift, c.state === "cheering" ? Math.min(1, c.t / 0.8) : 1);
      const y = c.m.y - lift * lift * (c.m.y - scrollY + 80);
      drawAnim(ctx, this.npcs, anim, t, c.m.x, y, s, -1, undefined, c.state === "trapped" ? 0.55 : 1 - lift * 0.6);
      const headY = y - tall - 14;
      if (c.state === "trapped" || c.state === "waiting") this.bubble(ctx, c.m.x, headY, this.help, this.pal.danger, now, true);
      if (rescuable === i) this.bubble(ctx, c.m.x, headY - 30, "E / 1", this.pal.ok, 0);
      if (c.state === "evacuating") this.floatText(ctx, c.m.x, c.m.y - tall - 20 - lift * 40, "+1", this.pal.ok, 1 - lift);
    });
    // The Lag gang: a flash and "!" before they shoot, a health bar while hurt,
    // and once defeated they lie there a moment and fade.
    for (const e of g.enemies) {
      if (e.m.y < top || e.m.y - 100 > bottom) continue;
      const atlas = this.foes[e.kind]?.[e.variant] ?? this.foes[e.kind]?.[0];
      if (!atlas) continue;
      const p = e.pose();
      const fading = e.state === "defeated" ? Math.max(0, 1 - Math.max(0, e.t - 1.2) / 0.8) : 1;
      if (fading <= 0) continue;
      const flash = g.time - e.hurtAt < 0.12 ? 0.55 : 1;
      const scale = this.scaleFor(atlas, "idle", this.heroHeight * FOE_SIZE[e.kind]);
      // Angry ones glow red: the same frame drawn a few pixels around, tinted, behind.
      if (e.angry && e.alive) {
        ctx.save();
        ctx.filter = "brightness(0) saturate(100%) invert(38%) sepia(94%) saturate(2400%) hue-rotate(330deg)";
        for (const [ox, oy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) drawAnim(ctx, atlas, p.anim, p.t, e.m.x + ox!, e.m.y + oy!, scale, e.face, p.frame, 0.9);
        ctx.restore();
      }
      drawAnim(ctx, atlas, p.anim, p.t, e.m.x, e.m.y, scale, e.face, p.frame, fading * flash);
      const head = e.m.y - this.heroHeight * FOE_SIZE[e.kind] - 10;
      if (e.angry && e.alive) this.angryFace(ctx, e.m.x + e.face * 16, head + 6);
      if (e.state === "aim") this.bubble(ctx, e.m.x, head - 8, "!", this.pal.danger, now);
      if (e.alive && g.time - e.hurtAt < BAR_TIME) {
        const k = e.hp / e.maxHp;
        this.capsule(ctx, e.m.x - 26, head, 52, 6, k, k > 0.6 ? this.pal.ok : k > 0.3 ? this.pal.accent : this.pal.danger, 1);
      }
    }
    // Their shots: slow glowing balls.
    for (const s of g.foeShots) {
      const color = s.kind === "alien" ? "#d45cff" : s.kind === "robot" ? "#ff9a3c" : "#ffe45c";
      const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 10);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.35, color);
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    // Health packs: a small heart that bobs.
    for (const pk of g.pickups) this.heart(ctx, pk.m.x, pk.m.y - 10 + Math.sin(now * 5) * 2, 9, this.pal.danger);
    // The hero, and the jetpack's fuel under him while it is not full; he
    // blinks while he cannot be hurt after losing a life.
    const pose = g.player.pose();
    const hm = g.player.m;
    const blink = g.time < g.invulnerableUntil && Math.floor(now * 12) % 2 === 0 ? 0.3 : 1;
    drawAnim(ctx, this.player, pose.anim, pose.t, hm.x, hm.y, this.scaleFor(this.player, "idle", this.heroHeight), pose.face, pose.frame, blink);
    if (g.player.fuel < JET_FUEL - 0.01) {
      const k = g.player.fuel / JET_FUEL;
      this.capsule(ctx, hm.x - 22, hm.y + 6, 44, 6, k, k > 0.3 ? this.pal.accent : this.pal.danger, 1);
    }
    // Health bars over the pieces hit lately: green, then amber, then red.
    for (const [id, bar] of g.bars) {
      const b = g.world.bodies[id]!;
      if (b.y + b.h < top || b.y > bottom) continue;
      const age = g.time - bar.at;
      const alpha = age > BAR_TIME - 0.5 ? Math.max(0, (BAR_TIME - age) / 0.5) : 1;
      const w = Math.max(28, Math.min(80, b.w));
      const k = bar.shown;
      this.capsule(ctx, b.x + b.w / 2 - w / 2, b.y - 10, w, 6, k, k > 0.6 ? this.pal.ok : k > 0.3 ? this.pal.accent : this.pal.danger, alpha);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.radar(g, scrollX, scrollY);
  }

  /**
   * Arrows on the window's edge toward what is out of sight, each with its
   * kind (a head: someone to rescue, a brick: the nearest part left, a
   * skull: a villain) and how far it is, in its own color.
   */
  private radar(g: Game, scrollX: number, scrollY: number): void {
    const ctx = this.ctx;
    const vw = this.canvas.width / this.dpr;
    const vh = this.canvas.height / this.dpr;
    const cx = scrollX + vw / 2;
    const cy = scrollY + vh / 2;
    const off = (x: number, y: number) => x < scrollX || x > scrollX + vw || y < scrollY + 110 || y > scrollY + vh;
    type Kind = "person" | "part" | "foe";
    const targets: { x: number; y: number; kind: Kind }[] = [];
    const m = g.player.m;
    let best: { x: number; y: number; d: number } | null = null;
    for (const b of g.world.bodies) {
      if (!b.alive || b.kind === "backdrop") continue;
      const x = b.x + b.w / 2;
      const y = b.y + b.h / 2;
      if (!off(x, y)) {
        best = null;
        break;
      }
      const d = Math.hypot(x - m.x, y - m.y);
      if (!best || d < best.d) best = { x, y, d };
    }
    if (best) targets.push({ x: best.x, y: best.y, kind: "part" });
    for (const c of g.civilians) if ((c.state === "trapped" || c.state === "waiting") && off(c.m.x, c.m.y - 20)) targets.push({ x: c.m.x, y: c.m.y - 20, kind: "person" });
    for (const e of g.enemies) if (e.alive && off(e.m.x, e.m.y - 30)) targets.push({ x: e.m.x, y: e.m.y - 30, kind: "foe" });
    const color: Record<Kind, string> = { person: this.pal.ok, part: this.pal.accent, foe: this.pal.danger };
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Arrows that land on the same spot of the edge become one, with a count.
    const drawn: { x: number; y: number; a: number; n: number; kind: Kind; d: number }[] = [];
    for (const t of targets) {
      const a = Math.atan2(t.y - cy, t.x - cx);
      const ix = vw / 2 - 34;
      const iy = vh / 2 - 34;
      const k = Math.min(ix / Math.abs(Math.cos(a) || 1e-6), iy / Math.abs(Math.sin(a) || 1e-6));
      const x = vw / 2 + Math.cos(a) * k;
      const y = Math.max(124, vh / 2 + Math.sin(a) * k);
      const d = Math.hypot(t.x - m.x, t.y - m.y);
      const same = drawn.find((o) => o.kind === t.kind && Math.hypot(o.x - x, o.y - y) < 60);
      if (same) {
        same.n++;
        same.d = Math.min(same.d, d);
        continue;
      }
      drawn.push({ x, y, a, n: 1, kind: t.kind, d });
    }
    for (const o of drawn) {
      const c = color[o.kind];
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.a);
      ctx.fillStyle = c;
      ctx.strokeStyle = this.pal.bg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(26, 0);
      ctx.lineTo(10, -9);
      ctx.lineTo(10, 9);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.restore();
      // The badge: a round icon, the count and the distance (in metres, 40 px each).
      ctx.fillStyle = this.pal.bg;
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(o.x, o.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      this.icon(ctx, o.kind, o.x, o.y, c);
      ctx.font = "700 10px 'JetBrains Mono', ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = `${o.n > 1 ? `${o.n}× ` : ""}${Math.round(o.d / 40)} m`;
      const tw = ctx.measureText(label).width + 10;
      const ly = o.y + (o.y > vh - 60 ? -24 : 24);
      ctx.fillStyle = this.pal.bg;
      ctx.beginPath();
      ctx.roundRect(o.x - tw / 2, ly - 8, tw, 16, 8);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.fillText(label, o.x, ly + 1);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** The radar's small pictures: a head, a brick, a skull. */
  private icon(ctx: CanvasRenderingContext2D, kind: "person" | "part" | "foe", x: number, y: number, color: string): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    if (kind === "person") {
      ctx.arc(x, y - 3, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(x - 6, y + 2, 12, 5, 3);
      ctx.fill();
    } else if (kind === "part") {
      ctx.fillRect(x - 7, y - 5, 14, 10);
      ctx.fillStyle = this.pal.bg;
      ctx.fillRect(x - 7, y - 1, 14, 1.5);
      ctx.fillRect(x - 1, y - 5, 1.5, 4);
      ctx.fillRect(x - 4, y + 0.5, 1.5, 4.5);
      ctx.fillRect(x + 3, y + 0.5, 1.5, 4.5);
    } else {
      ctx.arc(x, y - 2, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 3.5, y + 2, 7, 4);
      ctx.fillStyle = this.pal.bg;
      ctx.fillRect(x - 4, y - 3, 3, 3);
      ctx.fillRect(x + 1, y - 3, 3, 3);
      ctx.fillRect(x - 1, y + 3, 2, 3);
    }
  }

  /** A small angry face over a villain chasing the hero. */
  private angryFace(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = this.pal.danger;
    ctx.strokeStyle = this.pal.bg;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
    ctx.strokeStyle = this.pal.bg;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 4);
    ctx.lineTo(x - 1.5, y - 2);
    ctx.moveTo(x + 5, y - 4);
    ctx.lineTo(x + 1.5, y - 2);
    ctx.moveTo(x - 3.5, y + 4);
    ctx.quadraticCurveTo(x, y + 1, x + 3.5, y + 4);
    ctx.stroke();
  }

  private heart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
    ctx.fillStyle = color;
    ctx.strokeStyle = this.pal.bg;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + r);
    ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.4, x, y - r * 0.5);
    ctx.bezierCurveTo(x + r * 0.6, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r);
    ctx.stroke();
    ctx.fill();
  }

  /** A small capsule bar filled to `k` (0-1). */
  private capsule(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number, color: string, alpha: number): void {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.pal.bg;
    ctx.beginPath();
    ctx.roundRect(x - 1, y - 1, w + 2, h + 2, (h + 2) / 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(h, w * Math.max(0, Math.min(1, k))), h, h / 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** The evacuation beam: a soft column of light from the top of the window, with sparkles. */
  private beam(ctx: CanvasRenderingContext2D, x: number, footY: number, scrollY: number, lift: number, grow: number): void {
    const top = scrollY - 20;
    const w = 34 * grow;
    const grad = ctx.createLinearGradient(x - w, 0, x + w, 0);
    grad.addColorStop(0, "rgba(126, 226, 168, 0)");
    grad.addColorStop(0.5, `rgba(214, 255, 232, ${0.55 * (1 - lift * 0.5)})`);
    grad.addColorStop(1, "rgba(126, 226, 168, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(x - w, top, w * 2, footY - top);
    ctx.fillStyle = "#ffffff";
    for (let k = 0; k < 6; k++) {
      const sy = footY - ((performance.now() / 6 + k * 70) % Math.max(80, footY - top));
      ctx.globalAlpha = 0.8 * grow;
      ctx.fillRect(x + Math.sin(k * 2.3 + sy / 30) * w * 0.6, sy, 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  private floatText(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, alpha: number): void {
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.font = "700 16px 'JetBrains Mono', ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.globalAlpha = 1;
  }

  /** The civilians' call for help, in the page's language. */
  help = "HELP!";

  private bubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, now: number, pulse = false): void {
    const bob = now ? Math.sin(now * 6) * 3 : 0;
    if (pulse) {
      const k = 0.5 + 0.5 * Math.sin(now * 5);
      ctx.save();
      ctx.globalAlpha = 0.35 * k;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x - 34 - k * 4, y - 15 + bob - k * 2, 68 + k * 8, 28 + k * 4, 14);
      ctx.fill();
      ctx.restore();
    }
    ctx.font = "700 12px 'JetBrains Mono', ui-monospace, monospace";
    const w = ctx.measureText(text).width + 14;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 11 + bob, w, 20, 10);
    ctx.fill();
    ctx.fillStyle = this.pal.bg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y - 1 + bob);
  }
}
