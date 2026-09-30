// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The world the game plays in: the page's parts as rectangles in page
// coordinates (pixels from the page's top left), with their health. No DOM
// here: the host scans a page into these and applies the results back.

export type BodyKind =
  /** One word of text. */
  | "word"
  /** A button, link button or form control. */
  | "button"
  /** A picture: img, svg, canvas, video. */
  | "image"
  /** A painted box (background or border): a card, a chip, a header. */
  | "box"
  /**
   * A wide layout band (a header bar, a section's background, a page
   * wrapper): background, not a piece. Not a floor, not a target; it
   * crumbles by itself once nothing is left over it, and it never counts.
   */
  | "backdrop";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BodyInit extends Rect {
  kind: BodyKind;
  /** The nearest body that contains this one, or -1. */
  parent: number;
  /** A CSS color for its debris. */
  color: string;
}

export interface Body extends BodyInit {
  id: number;
  children: number[];
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Its share of the destruction count. */
  weight: number;
  /** Its top edge is a floor you can stand on (from above only). */
  platform: boolean;
  /** Bullets and blades stop on it. */
  solid: boolean;
}

/**
 * Health by kind: a word 12, a button or chip 30, a picture 45, and any box
 * (card, panel) 105 whatever its size. See DAMAGE in game.ts for the weapons:
 * a word takes three bullets or a bazooka's splash, a card three rockets,
 * and the landing's ~1000 pieces clear in about 5 to 8 minutes of play.
 */
export const HEALTH: Record<Exclude<BodyKind, "backdrop">, number> = { word: 12, button: 30, image: 45, box: 105 };

export function healthOf(kind: BodyKind, _w: number, _h: number): number {
  return kind === "backdrop" ? Infinity : HEALTH[kind];
}

/** Its share of the destruction count (backdrops never count). */
export function weightOf(kind: BodyKind): number {
  return kind === "backdrop" ? 0 : kind === "word" ? 1 : kind === "button" ? 3 : 4;
}
