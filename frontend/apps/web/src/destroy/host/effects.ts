// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// What damage looks like on the page copy: bullet holes punched with a CSS
// mask, a broken part hidden (its space kept, so nothing reflows) and a few
// real pieces of it (clipped copies) tumbling down.

import type { Body } from "../engine/types";

const MAX_HOLES = 10;
const MAX_CHUNKS = 48;

interface Chunk {
  el: HTMLElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  vr: number;
  life: number;
}

export class Effects {
  private holes = new WeakMap<Element, string[]>();
  private chunks: Chunk[] = [];

  constructor(
    private layer: HTMLElement,
    private reduced: boolean,
    private rand: () => number = Math.random,
  ) {}

  /** A bullet hole at a page point on a body's element. */
  hole(el: Element, b: Body, x: number, y: number): void {
    // Only the page copy is ever touched.
    if (b.kind === "word" || !this.layer.contains(el)) return;
    const list = this.holes.get(el) ?? [];
    const r = 3 + this.rand() * 4;
    list.push(`radial-gradient(circle at ${Math.round(x - b.x)}px ${Math.round(y - b.y)}px, transparent ${r.toFixed(1)}px, #000 ${(r + 1).toFixed(1)}px)`);
    if (list.length > MAX_HOLES) list.shift();
    this.holes.set(el, list);
    const s = (el as HTMLElement).style;
    const mask = list.join(", ");
    s.setProperty("mask-image", mask);
    s.setProperty("-webkit-mask-image", mask);
    s.setProperty("mask-composite", "intersect");
    s.setProperty("-webkit-mask-composite", "source-in");
  }

  /** A part breaks: hidden in place, a few pieces of it fall. */
  shatter(el: Element, b: Body, withChunks: boolean): void {
    if (!this.layer.contains(el)) return;
    const html = el as HTMLElement;
    if (withChunks && !this.reduced && b.kind !== "word" && b.kind !== "backdrop" && b.w * b.h < 260000 && this.chunks.length < MAX_CHUNKS) this.chunksOf(html, b);
    html.style.visibility = "hidden";
  }

  private chunksOf(el: HTMLElement, b: Body): void {
    // Cut the box in a jittered grid of pieces (2 × 2 to 3 × 2).
    const cols = b.w > 200 ? 3 : 2;
    const rows = 2;
    const jx = (i: number) => (i === 0 ? 0 : i === cols ? 100 : (i / cols) * 100 + (this.rand() - 0.5) * 18);
    const jy = (j: number) => (j === 0 ? 0 : j === rows ? 100 : (j / rows) * 100 + (this.rand() - 0.5) * 18);
    const xs = Array.from({ length: cols + 1 }, (_, i) => jx(i));
    const ys = Array.from({ length: rows + 1 }, (_, j) => jy(j));
    const rect = el.getBoundingClientRect();
    const layerRect = this.layer.getBoundingClientRect();
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        if (this.chunks.length >= MAX_CHUNKS) return;
        const piece = el.cloneNode(true) as HTMLElement;
        piece.removeAttribute("id");
        const s = piece.style;
        s.position = "absolute";
        s.left = `${rect.left - layerRect.left}px`;
        s.top = `${rect.top - layerRect.top}px`;
        s.width = `${rect.width}px`;
        s.height = `${rect.height}px`;
        s.margin = "0";
        s.boxSizing = "border-box";
        s.visibility = "visible";
        s.pointerEvents = "none";
        s.clipPath = `polygon(${xs[i]}% ${ys[j]}%, ${xs[i + 1]}% ${ys[j]}%, ${xs[i + 1]}% ${ys[j + 1]}%, ${xs[i]}% ${ys[j + 1]}%)`;
        s.willChange = "transform";
        this.layer.appendChild(piece);
        const cx = ((xs[i]! + xs[i + 1]!) / 200 - 0.5) * 2;
        this.chunks.push({ el: piece, x: 0, y: 0, vx: cx * (120 + this.rand() * 160), vy: -180 - this.rand() * 220, r: 0, vr: (this.rand() - 0.5) * 360, life: 1.4 + this.rand() * 0.5 });
      }
  }

  /** Moves the falling pieces; call every frame. */
  update(dt: number): void {
    for (const c of this.chunks) {
      c.vy += 1700 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.r += c.vr * dt;
      c.life -= dt;
      c.el.style.transform = `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px) rotate(${c.r.toFixed(1)}deg)`;
      c.el.style.opacity = String(Math.max(0, Math.min(1, c.life / 0.4)));
      if (c.life <= 0) c.el.remove();
    }
    this.chunks = this.chunks.filter((c) => c.life > 0);
  }
}
