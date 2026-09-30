// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The stage: an inert copy of the page to destroy, laid exactly over the
// real one (which is hidden, not removed, so its size and scroll stay).
// Everything breaks on the copy; leaving removes it and shows the real page
// again at once, untouched.

export interface Stage {
  /** Holds the copy and the falling chunks; page coordinates inside. */
  layer: HTMLElement;
  /** The copy of the page. */
  copy: HTMLElement;
  /** Where the copy's top left is in page coordinates. */
  origin: { x: number; y: number };
  /** Empty sky above the page so the hero starts above its first part. */
  sky: number;
  width: number;
  height: number;
  restore(): void;
}

/** The layers' z order (below the game canvas and its buttons). */
export const STAGE_Z = 2147483000;

export function buildStage(root: HTMLElement, opts: { sky: number }): Stage {
  const doc = root.ownerDocument;
  const win = doc.defaultView!;
  const rect = root.getBoundingClientRect();
  const origin = { x: rect.left + win.scrollX, y: rect.top + win.scrollY + opts.sky };
  const layer = doc.createElement("div");
  layer.className = "dz-stage";
  layer.setAttribute("data-destroy-ui", "");
  layer.setAttribute("aria-hidden", "true");
  layer.style.position = "absolute";
  layer.style.left = "0";
  layer.style.top = "0";
  layer.style.width = `${Math.max(doc.documentElement.scrollWidth, rect.width)}px`;
  layer.style.height = `${origin.y + rect.height + 40}px`;
  layer.style.zIndex = String(STAGE_Z);
  layer.style.pointerEvents = "none";
  layer.style.overflow = "hidden";

  const copy = root.cloneNode(true) as HTMLElement;
  copy.removeAttribute("id");
  copy.setAttribute("inert", "");
  const cs = win.getComputedStyle(root);
  copy.style.position = "absolute";
  copy.style.left = `${origin.x}px`;
  copy.style.top = `${origin.y}px`;
  copy.style.width = `${rect.width}px`;
  copy.style.minHeight = `${rect.height}px`;
  copy.style.display = cs.display;
  copy.style.flexDirection = cs.flexDirection;
  copy.style.margin = "0";
  layer.appendChild(copy);
  doc.body.appendChild(layer);

  // Pixels a copy can't carry: canvases are copied frame as it is now.
  const srcCanvases = root.querySelectorAll("canvas");
  copy.querySelectorAll("canvas").forEach((c, i) => {
    const src = srcCanvases[i];
    if (!src) return;
    try {
      c.width = src.width;
      c.height = src.height;
      c.getContext("2d")?.drawImage(src, 0, 0);
    } catch {
      // a canvas without 2D content (WebGL) stays blank
    }
  });
  // Sticky parts stay in place and fixed ones (bars, toasts) are not part of the page.
  for (const el of copy.querySelectorAll<HTMLElement>("*")) {
    const pos = win.getComputedStyle(el).position;
    if (pos === "sticky") {
      el.style.position = "relative";
      el.style.top = "auto";
    } else if (pos === "fixed") el.style.display = "none";
  }

  const prevVisibility = root.style.visibility;
  root.style.visibility = "hidden";
  return {
    layer,
    copy,
    origin,
    sky: opts.sky,
    width: Math.max(doc.documentElement.clientWidth, rect.width),
    height: origin.y + rect.height,
    restore() {
      layer.remove();
      root.style.visibility = prevVisibility;
    },
  };
}
