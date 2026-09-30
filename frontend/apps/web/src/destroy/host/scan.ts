// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Turns a page (already split into words) into the game's bodies: every
// word, picture, button and painted box, with page coordinates, its nearest
// body around it, and a color for its debris. Empty wrappers are skipped:
// they draw nothing, so there is nothing to break.

import type { BodyInit, BodyKind } from "../engine/types";
import { WORD_CLASS } from "./atomize";

const IMAGE = new Set(["IMG", "SVG", "CANVAS", "VIDEO", "PICTURE", "svg"]);
const BUTTON = new Set(["BUTTON", "INPUT", "SELECT", "TEXTAREA"]);
const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "BR", "WBR", "SOURCE", "TEMPLATE", "HEAD", "META", "LINK"]);

export interface Scan {
  bodies: BodyInit[];
  /** The element of each body, by body id. */
  nodes: Element[];
}

const transparent = (c: string) => !c || c === "transparent" || /rgba\([^)]*,\s*0\)$/.test(c) || /rgba?\(.*\/\s*0\)$/.test(c);

function kindOf(el: Element, cs: CSSStyleDeclaration): BodyKind | null {
  if (el.classList.contains(WORD_CLASS)) return "word";
  if (IMAGE.has(el.tagName)) return "image";
  if (BUTTON.has(el.tagName) || el.getAttribute("role") === "button" || (el.tagName === "A" && el.classList.contains("button"))) return "button";
  // A real box: a background, a shadow, or a border on at least two sides.
  // A lone underline or divider (one side) is decoration, not a piece: its
  // top edge would be an invisible floor.
  const side = (w: string, c: string, s: string) => parseFloat(w) > 0 && !transparent(c) && s !== "none";
  const sides = [side(cs.borderTopWidth, cs.borderTopColor, cs.borderTopStyle), side(cs.borderRightWidth, cs.borderRightColor, cs.borderRightStyle), side(cs.borderBottomWidth, cs.borderBottomColor, cs.borderBottomStyle), side(cs.borderLeftWidth, cs.borderLeftColor, cs.borderLeftStyle)].filter(Boolean).length;
  const painted = !transparent(cs.backgroundColor) || (cs.backgroundImage && cs.backgroundImage !== "none") || sides >= 2 || (cs.boxShadow && cs.boxShadow !== "none");
  return painted ? "box" : null;
}

function colorOf(kind: BodyKind, cs: CSSStyleDeclaration): string {
  if (kind === "word") return cs.color;
  if (!transparent(cs.backgroundColor)) return cs.backgroundColor;
  if (!transparent(cs.borderTopColor) && parseFloat(cs.borderTopWidth) > 0) return cs.borderTopColor;
  return cs.color || "#888";
}

/**
 * Scans `root`'s visible parts. `origin` is where `root`'s box sits in page
 * coordinates minus its client rect, so bodies come out in page coordinates.
 */
export function scan(root: Element, offset: { x: number; y: number }, viewport: { w: number; h: number }): Scan {
  const bodies: BodyInit[] = [];
  const nodes: Element[] = [];
  const idOf = new Map<Element, number>();
  const all = root.querySelectorAll("*");
  for (const el of all) {
    if (SKIP.has(el.tagName)) continue;
    // The game's own interface is never a piece (it may sit inside a root).
    if (el.closest("[data-destroy-ui]:not(.dz-stage)")) continue;
    // Inside a picture, only the picture counts.
    if (el.parentElement?.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) === 0) continue;
    // Seen for real: not hidden by an ancestor (opacity, visibility), not
    // off the page sideways, and not mostly clipped by a scrolling or
    // clipping container (a screen-reader-only text, a strip scrolled away).
    const seen = (el as Element & { checkVisibility?: (o: object) => boolean }).checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true;
    if (!seen || r.right < 0 || r.left > viewport.w || visibleShare(el, r) < 0.3) continue;
    let kind = kindOf(el, cs);
    if (!kind) continue;
    // A wide painted band (a header bar, a section's background, a page
    // wrapper) is layout, not a piece: the player falls through it.
    if (kind === "box" && r.width > viewport.w * 0.7) kind = "backdrop";
    // A small painted box is a chip or a badge: as tough as a button.
    else if (kind === "box" && r.height <= 48 && r.width <= 260) kind = "button";
    let parent = -1;
    for (let p = el.parentElement; p && p !== root.parentElement; p = p.parentElement) {
      const id = idOf.get(p);
      if (id !== undefined) {
        parent = id;
        break;
      }
    }
    const id = bodies.length;
    idOf.set(el, id);
    bodies.push({ x: r.left + offset.x, y: r.top + offset.y, w: r.width, h: r.height, kind, parent, color: colorOf(kind, cs) });
    nodes.push(el);
  }
  return { bodies, nodes };
}

/** The share of an element's box left visible by the containers that clip it. */
function visibleShare(el: Element, r: DOMRect): number {
  let l = r.left;
  let t = r.top;
  let rr = r.right;
  let b = r.bottom;
  for (let a = el.parentElement; a && a !== el.ownerDocument.body; a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (cs.overflowX === "visible" && cs.overflowY === "visible" && cs.clipPath === "none" && cs.clip === "auto") continue;
    const ar = a.getBoundingClientRect();
    l = Math.max(l, ar.left);
    t = Math.max(t, ar.top);
    rr = Math.min(rr, ar.right);
    b = Math.min(b, ar.bottom);
  }
  const area = Math.max(0, rr - l) * Math.max(0, b - t);
  return area / Math.max(1, r.width * r.height);
}
