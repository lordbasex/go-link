// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Color science for the CPS-1 conversion:
//  - OKLab, a perceptual space, so "near" means "looks alike";
//  - every color the CPS-1 can show: a palette word 0xBRGB gives each
//    channel value * (B + 2) when B is not 0, else black
//    (src/vidhrdw/cps1_vidhrdw.c, cps1_build_palette). A low brightness
//    gives finer dark shades, so the set is richer than 4 bits per channel;
//  - a weighted k-means in OKLab with a deterministic start (no randomness:
//    the same sheets always give the same ROM).

/** An sRGB color, each channel 0-255. */
export type Rgb = [number, number, number];
/** An OKLab color [L, a, b]. */
export type Lab = [number, number, number];

/** A color the board can show, with the palette word that gives it. */
export interface BoardColor {
  word: number;
  rgb: Rgb;
  lab: Lab;
}

const lin = (c: number) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** sRGB [0-255] to OKLab [L, a, b]. */
export function toLab([r, g, b]: readonly number[]): Lab {
  const R = lin(r!);
  const G = lin(g!);
  const B = lin(b!);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Squared OKLab distance. */
export const dist2 = (p: readonly number[], q: readonly number[]): number => (p[0]! - q[0]!) ** 2 + (p[1]! - q[1]!) ** 2 + (p[2]! - q[2]!) ** 2;

/** OKLab distance x 100, the "delta E" reported in the journal (about 1 = just visible). */
export const deltaE = (p: readonly number[], q: readonly number[]): number => Math.sqrt(dist2(p, q)) * 100;

let CPS1: BoardColor[] | null = null;
/** Every distinct color the CPS-1 shows, with its cheapest palette word. */
export function cps1Colors(): BoardColor[] {
  if (CPS1) return CPS1;
  const seen = new Map<string, BoardColor>();
  for (let br = 15; br >= 1; br--) {
    const m = br + 2;
    for (let v = 0; v < 4096; v++) {
      const rgb: Rgb = [((v >> 8) & 15) * m, ((v >> 4) & 15) * m, (v & 15) * m];
      const key = rgb.join(",");
      if (!seen.has(key)) seen.set(key, { word: (br << 12) | v, rgb, lab: toLab(rgb) });
    }
  }
  CPS1 = [...seen.values()];
  return CPS1;
}

function nearest(list: BoardColor[], rgb: readonly number[]): BoardColor & { err: number } {
  const lab = toLab(rgb);
  let best = list[0]!;
  let bd = Infinity;
  for (const c of list) {
    const d = dist2(lab, c.lab);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return { ...best, err: Math.sqrt(bd) * 100 };
}

/** The nearest CPS-1 color to an sRGB color, with the error it costs. */
export function toCps1(rgb: readonly number[]): BoardColor & { err: number } {
  return nearest(cps1Colors(), rgb);
}

let FULL: BoardColor[] | null = null;
/**
 * The 4096 colors at full brightness (palette words 0xFRGB): every channel
 * a multiple of 17. These are the colors a Willy Maker palette stores
 * (docs/rom/art-spec.md), the same in the editor and in the ROM.
 */
export function fullBrightnessColors(): BoardColor[] {
  if (FULL) return FULL;
  FULL = [];
  for (let v = 0; v < 4096; v++) {
    const rgb: Rgb = [((v >> 8) & 15) * 17, ((v >> 4) & 15) * 17, (v & 15) * 17];
    FULL.push({ word: 0xf000 | v, rgb, lab: toLab(rgb) });
  }
  return FULL;
}

/**
 * The nearest full-brightness color (perceptually, unlike rounding each
 * channel). Only the 5 x 5 x 5 steps around the rounded color are compared,
 * 30 times faster than a full search; the tests check that it finds the
 * same color as the full search on 20,000 sampled colors.
 */
export function toBoardColor(rgb: readonly number[]): BoardColor & { err: number } {
  const all = fullBrightnessColors();
  const lab = toLab(rgb);
  const r0 = Math.round(rgb[0]! / 17);
  const g0 = Math.round(rgb[1]! / 17);
  const b0 = Math.round(rgb[2]! / 17);
  let best = all[0]!;
  let bd = Infinity;
  for (let r = Math.max(0, r0 - 2); r <= Math.min(15, r0 + 2); r++)
    for (let g = Math.max(0, g0 - 2); g <= Math.min(15, g0 + 2); g++)
      for (let b = Math.max(0, b0 - 2); b <= Math.min(15, b0 + 2); b++) {
        const c = all[(r << 8) | (g << 4) | b]!;
        const d = dist2(lab, c.lab);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
  return { ...best, err: Math.sqrt(bd) * 100 };
}

/** The nearest full-brightness color by a search over all 4096 (the reference for toBoardColor). */
export function toBoardColorExhaustive(rgb: readonly number[]): BoardColor & { err: number } {
  return nearest(fullBrightnessColors(), rgb);
}

/** "#RRGGBB" for an sRGB color. */
export function hexOf([r, g, b]: readonly number[]): string {
  return `#${[r!, g!, b!].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** An sRGB color from "#RRGGBB" (or "RRGGBB"); null when it is not one. */
export function rgbOf(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A point for k-means: an OKLab color and its weight. */
export interface WeightedLab {
  lab: Lab;
  w: number;
}

/**
 * Weighted k-means in OKLab. points: [{ lab, w }]. Deterministic start:
 * the heaviest point, then each next center is the point that maximizes
 * weight^0.5 x (distance to the nearest center)^2, so small but distinct
 * colors (a logo, sneakers, eyes) get a center of their own. `fixed`
 * centers (e.g. the outline black) never move.
 */
export function kmeans(points: readonly WeightedLab[], k: number, { fixed = [], iterations = 16 }: { fixed?: readonly Lab[]; iterations?: number } = {}): Lab[] {
  if (!points.length) return fixed.map((c) => c.slice() as Lab);
  const centers: Lab[] = fixed.map((c) => c.slice() as Lab);
  const nearestD = points.map((p) => (centers.length ? Math.min(...centers.map((c) => dist2(p.lab, c))) : Infinity));
  if (!centers.length) {
    let best = points[0]!;
    for (const p of points) if (p.w > best.w) best = p;
    centers.push(best.lab.slice() as Lab);
    points.forEach((p, i) => (nearestD[i] = dist2(p.lab, best.lab)));
  }
  while (centers.length < k) {
    let bi = -1;
    let bs = 0;
    points.forEach((p, i) => {
      const s = Math.sqrt(p.w) * nearestD[i]!;
      if (s > bs) {
        bs = s;
        bi = i;
      }
    });
    if (bi < 0) break; // fewer distinct colors than k
    const c = points[bi]!.lab.slice() as Lab;
    centers.push(c);
    points.forEach((p, i) => (nearestD[i] = Math.min(nearestD[i]!, dist2(p.lab, c))));
  }
  for (let it = 0; it < iterations; it++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (const p of points) {
      let bi = 0;
      let bd = Infinity;
      centers.forEach((c, i) => {
        const d = dist2(p.lab, c);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      const s = sum[bi]!;
      s[0]! += p.lab[0] * p.w;
      s[1]! += p.lab[1] * p.w;
      s[2]! += p.lab[2] * p.w;
      s[3]! += p.w;
    }
    centers.forEach((c, i) => {
      const s = sum[i]!;
      if (i < fixed.length || !s[3]) return;
      c[0] = s[0]! / s[3];
      c[1] = s[1]! / s[3];
      c[2] = s[2]! / s[3];
    });
  }
  return centers;
}

/** OKLab back to sRGB [0-255] (for picking the CPS-1 color of a center). */
export function fromLab([L, a, b]: readonly number[]): Rgb {
  const l = (L! + 0.3963377774 * a! + 0.2158037573 * b!) ** 3;
  const m = (L! - 0.1055613458 * a! - 0.0638541728 * b!) ** 3;
  const s = (L! - 0.0894841775 * a! - 1.291485548 * b!) ** 3;
  const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const B = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const g = (x: number) => {
    x = Math.max(0, Math.min(1, x));
    return Math.round((x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055) * 255);
  };
  return [g(R), g(G), g(B)];
}
