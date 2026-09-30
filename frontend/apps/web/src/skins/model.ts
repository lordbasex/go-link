// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// A skin file as the editor holds it (format 1, docs/skins/README.md), with
// the apps' defaults for its colors and shapes, and its checks.
import type { LayoutJson, Orient } from "./layout";

export interface DecorJson {
  shape: "rect" | "grill";
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  fill: string;
  opacity: number;
  stroke: number;
}

/** A skin file. Loose on purpose: unknown keys travel along untouched. */
export interface SkinJson {
  format: number;
  id: string;
  name: Record<string, string>;
  author?: string;
  shell?: { center?: string; edge?: string; rim?: string; gloss?: number; grain?: number };
  controls?: string;
  screen?: { bezel?: string; label?: string };
  style?: { menu?: Record<string, unknown>; controls?: Record<string, unknown> };
  background?: Partial<Record<Orient, string>>;
  rings?: boolean;
  screws?: boolean;
  decor?: Partial<Record<Orient, DecorJson[]>>;
  layout?: Partial<Record<Orient, LayoutJson>>;
  [key: string]: unknown;
}

/** A skin the editor works on: both layouts and both decor lists present. */
export interface EditSkin extends SkinJson {
  layout: Record<Orient, LayoutJson>;
  decor: Record<Orient, DecorJson[]>;
  screen: { bezel?: string; label?: string };
}

export const ORIENTS: readonly Orient[] = ["portrait", "landscape"];
export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
export const round = (v: number) => Math.round(v * 100) / 100;

/** "#rrggbb" (or "rrggbb") as "#rrggbb", else the fallback. */
export function hex(c: unknown, fallback: string): string;
export function hex(c: unknown): string | undefined;
export function hex(c: unknown, fallback?: string): string | undefined {
  return typeof c === "string" && /^#?[0-9a-fA-F]{6}$/.test(c) ? (c[0] === "#" ? c : "#" + c) : fallback;
}

/** The color with each channel scaled by k. */
export function darker(c: string, k: number): string {
  const v = parseInt(hex(c, "#888888").slice(1), 16);
  const ch = (s: number) => Math.round(((v >> s) & 255) * k);
  return "#" + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("");
}

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/**
 * Fills what the editor needs (both layouts, both decor lists, the screen)
 * from `base`, and turns anything that is not a number where a number goes
 * into a safe one, so a hand-made file never breaks the drawing.
 */
export function complete(skin: SkinJson, base: SkinJson | undefined): EditSkin {
  const s = clone(skin) as EditSkin;
  const layout = (s.layout ?? {}) as Partial<Record<Orient, LayoutJson>>;
  for (const o of ORIENTS) if (!layout[o] && base?.layout?.[o]) layout[o] = clone(base.layout[o]!);
  s.layout = layout as Record<Orient, LayoutJson>;
  const decor = (s.decor ?? {}) as Partial<Record<Orient, DecorJson[]>>;
  s.decor = { portrait: decor.portrait ?? [], landscape: decor.landscape ?? [] };
  s.screen = s.screen ?? { bezel: "#07080c", label: "" };
  s.name = s.name && typeof s.name === "object" ? s.name : { en: s.id };
  for (const o of ORIENTS) {
    s.decor[o] = (Array.isArray(s.decor[o]) ? s.decor[o] : [])
      .filter((d) => d && typeof d === "object")
      .map((d) => ({
        ...d,
        shape: d.shape === "grill" ? "grill" : "rect",
        x: num(d.x, 0),
        y: num(d.y, 0),
        w: num(d.w, 0.1),
        h: num(d.h, 0.1),
        radius: num(d.radius, 8),
        opacity: num(d.opacity, 0.08),
        stroke: num(d.stroke, 0.16),
        fill: hex(d.fill, "#ffffff"),
      }));
    const lay = s.layout[o] as Record<string, unknown> | undefined;
    if (!lay) continue;
    for (const k of Object.keys(lay)) {
      const b = lay[k] as Record<string, unknown> | null;
      if (b && typeof b === "object") for (const f of ["x", "y", "w", "h", "size"]) if (f in b) b[f] = num(b[f], f === "w" || f === "h" ? 10 : 0);
    }
  }
  if (s.shell) for (const f of ["gloss", "grain"] as const) if (f in s.shell) s.shell[f] = num(s.shell[f], 0);
  return s;
}

const TONES = {
  dark: { ringTop: "#333341", ringBottom: "#1e1e23", face: "#222229", outline: "#323240", mark: "#4a4a5c", label: "#f3f0ff" },
  light: { ringTop: "#ffffff", ringBottom: "#d8e6e9", face: "#e5eef0", outline: "#cedde0", mark: "#ffffff", label: "#2a2a33" },
};
export const PALETTE_KEYS = ["ringTop", "ringBottom", "face", "outline", "mark", "label"] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];
export type Palette = Record<PaletteKey | "heldTop" | "heldBottom" | "litLabel", string>;

/** The controls' colors: the tone's, or the skin's own. */
export function palette(s: SkinJson): Palette {
  const t = TONES[s.controls === "light" ? "light" : "dark"];
  const c = s.style?.controls ?? {};
  const pick = (k: PaletteKey) => hex(c[k], t[k]);
  const face = pick("face");
  const label = pick("label");
  const lit = hex(c.lit);
  return {
    ringTop: pick("ringTop"),
    ringBottom: pick("ringBottom"),
    face,
    outline: pick("outline"),
    mark: pick("mark"),
    label,
    heldTop: lit ?? darker(face, 0.74),
    heldBottom: lit ? darker(lit, 0.7) : darker(face, 0.9),
    litLabel: hex(c.litLabel, label),
  };
}

export interface MenuStyle {
  fill: string;
  fillOpacity: number;
  border: string;
  borderOpacity: number;
  button: string;
  icon: string;
  active: string;
  activeButton: string;
}

export function menuStyle(s: SkinJson): MenuStyle {
  const m = s.style?.menu ?? {};
  return {
    fill: hex(m.fill, "#08090e"),
    fillOpacity: num(m.fillOpacity, 0.55),
    border: hex(m.border, "#ffffff"),
    borderOpacity: num(m.borderOpacity, 0.14),
    button: hex(m.button, "#161a23"),
    icon: hex(m.icon, "#c4cad6"),
    active: hex(m.active, "#f2a33a"),
    activeButton: hex(m.activeButton, "#2a1d0c"),
  };
}

export type ButtonShape = "circle" | "rounded" | "hexagon" | "diamond";
export type ButtonLabels = "numbers" | "letters" | "none";
export type DpadMarks = "arrows" | "lines" | "dots" | "none";
export const SHAPES: readonly ButtonShape[] = ["circle", "rounded", "hexagon", "diamond"];
export const LABELS: readonly ButtonLabels[] = ["numbers", "letters", "none"];
export const MARKS: readonly DpadMarks[] = ["arrows", "lines", "dots", "none"];

export interface Design {
  shape: ButtonShape;
  ring: number;
  labels: ButtonLabels;
  dome: number;
  well: { size: number; depth: number; color: string } | null;
  dpadArm: number;
  dpadRadius: number;
  dpadMarks: DpadMarks;
}

/** The controls' shapes and depth (style.controls), with the apps' defaults and limits. */
export function design(s: SkinJson): Design {
  const c = s.style?.controls ?? {};
  const lim = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : d);
  const one = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
  const pad = (c.dpad && typeof c.dpad === "object" ? c.dpad : {}) as Record<string, unknown>;
  const w = c.well && typeof c.well === "object" ? (c.well as Record<string, unknown>) : null;
  return {
    shape: one(c.shape, SHAPES, "circle"),
    ring: lim(c.ring, 6 / 64, 0, 0.25),
    labels: one(c.labels, LABELS, "numbers"),
    dome: lim(c.dome, 0, 0, 1),
    well: w ? { size: lim(w.size, 0.14, 0, 0.5), depth: lim(w.depth, 0.6, 0, 1), color: hex(w.color, "#000000") } : null,
    dpadArm: lim(pad.arm, 50 / 128, 0.25, 0.6),
    dpadRadius: lim(pad.radius, 6 / 50, 0, 0.5),
    dpadMarks: one(pad.marks, MARKS, "arrows"),
  };
}

/** Button 1-6 as the skin labels it. */
export function buttonLabel(d: Design, n: number): string {
  return d.labels === "numbers" ? String(n) : d.labels === "letters" ? String.fromCharCode(64 + n) : "";
}

/** A button shape of `size` centered on (cx, cy), as an SVG path (the apps draw the same shapes). */
export function shapePath(shape: ButtonShape, cx: number, cy: number, size: number): string {
  const r = size / 2;
  if (shape === "rounded") {
    const c = size * 0.28;
    const x = cx - r;
    const y = cy - r;
    return `M${x + c},${y}H${x + size - c}A${c},${c} 0 0 1 ${x + size},${y + c}V${y + size - c}A${c},${c} 0 0 1 ${x + size - c},${y + size}H${x + c}A${c},${c} 0 0 1 ${x},${y + size - c}V${y + c}A${c},${c} 0 0 1 ${x + c},${y}Z`;
  }
  if (shape === "hexagon") {
    const pts = [0, 1, 2, 3, 4, 5].map((i) => {
      const a = ((-90 + 60 * i) * Math.PI) / 180;
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    });
    return `M${pts.join("L")}Z`;
  }
  if (shape === "diamond") return `M${cx},${cy - r}L${cx + r},${cy}L${cx},${cy + r}L${cx - r},${cy}Z`;
  return `M${cx - r},${cy}A${r},${r} 0 1 0 ${cx + r},${cy}A${r},${r} 0 1 0 ${cx - r},${cy}Z`;
}

/** The skin as its file: keys in the documented order, empty parts left out. */
export function serialize(skin: EditSkin): string {
  const s = clone(skin) as SkinJson;
  const decor = s.decor ?? {};
  for (const o of ORIENTS) if (decor[o] && !decor[o]!.length) delete decor[o];
  if (!Object.keys(decor).length) delete s.decor;
  if (s.style?.controls && !Object.keys(s.style.controls).length) delete s.style.controls;
  const order = ["format", "id", "name", "author", "shell", "controls", "screen", "style", "background", "rings", "screws", "decor", "layout"];
  const out: Record<string, unknown> = {};
  for (const k of order) if (s[k] !== undefined) out[k] = s[k];
  for (const k of Object.keys(s)) if (!(k in out)) out[k] = s[k];
  out.format = 1;
  return JSON.stringify(out, null, 2) + "\n";
}

/** The file's own rules (the apps refuse a file that breaks them), as data. */
export type FormatIssue =
  | { level: "error"; kind: "badId" }
  | { level: "warn"; kind: "builtinId"; id: string }
  | { level: "error"; kind: "noName" }
  | { level: "error"; kind: "badColor"; key: "center" | "edge" | "rim" };

export function validate(s: SkinJson, builtinIds: readonly string[]): FormatIssue[] {
  const out: FormatIssue[] = [];
  if (!/^[a-z0-9-]{1,40}$/.test(s.id || "") || s.id === "classic") out.push({ level: "error", kind: "badId" });
  if (builtinIds.includes(s.id)) out.push({ level: "warn", kind: "builtinId", id: s.id });
  if (!s.name || !s.name.en) out.push({ level: "error", kind: "noName" });
  for (const key of ["center", "edge", "rim"] as const) if (!hex(s.shell?.[key])) out.push({ level: "error", kind: "badColor", key });
  return out;
}

/** Where a skin file goes: skin.json next to its pictures, else skin-<id>.json. */
export function fileName(s: SkinJson): string {
  return s.background && Object.keys(s.background).length ? "skin.json" : `skin-${s.id || "my-skin"}.json`;
}
