// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

/**
 * A chart as a PNG that explains itself: the title, what it covers (room,
 * game id, time span) and the legend around the drawing, in the colors the
 * page shows. The SVG is copied with its computed styles written into it
 * as presentation attributes (fill, stroke…; the CSP forbids inline
 * styles), since an image drawn on a canvas sees none of the page's CSS.
 */

export interface ChartPicture {
  title: string;
  lines: string[]; // under the title: the room, the game id, the span
  legend: { label: string; color: string; dashed?: boolean }[];
}

const STYLE_PROPS = ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linejoin", "opacity", "font-family", "font-size", "font-weight"];
const SCALE = 2;
const MARGIN = 28;

/** A CSS color (a variable included) as the page resolves it. */
export function resolveColor(color: string, within: Element): string {
  const probe = document.createElement("span");
  probe.style.color = color;
  within.appendChild(probe);
  const out = getComputedStyle(probe).color;
  probe.remove();
  return out;
}

function inlineStyles(from: Element, to: Element) {
  const cs = getComputedStyle(from);
  to.removeAttribute("style");
  to.removeAttribute("class");
  for (const p of STYLE_PROPS) {
    const v = cs.getPropertyValue(p);
    if (v) to.setAttribute(p, v);
  }
  for (let i = 0; i < from.children.length; i++) inlineStyles(from.children[i]!, to.children[i]!);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("the chart did not render"));
    img.src = url;
  });
}

/** Draws the chart and its words on a canvas and returns it as a PNG. */
export async function chartPng(svg: SVGSVGElement, pic: ChartPicture): Promise<Blob> {
  const box = svg.getBoundingClientRect();
  const w = Math.max(640, Math.round(box.width));
  const h = Math.round(box.height);
  const copy = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, copy);
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(w * SCALE));
  copy.setAttribute("height", String(h * SCALE));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml" }));

  const page = getComputedStyle(svg.closest(".netreport-chart, .dialog") ?? document.body);
  const bg = page.backgroundColor && page.backgroundColor !== "rgba(0, 0, 0, 0)" ? page.backgroundColor : getComputedStyle(document.body).backgroundColor;
  const text = getComputedStyle(svg.closest(".tchart") ?? document.body).color;
  const font = getComputedStyle(document.body).fontFamily;

  const headH = 30 + pic.lines.length * 20 + 12;
  const legendRows = Math.ceil(pic.legend.length / 3);
  const legendH = legendRows * 22 + 10;
  const canvas = document.createElement("canvas");
  canvas.width = (w + MARGIN * 2) * SCALE;
  canvas.height = (headH + h + legendH + MARGIN * 2) * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = text;
  ctx.font = `600 18px ${font}`;
  ctx.fillText(pic.title, MARGIN, MARGIN + 18);
  ctx.globalAlpha = 0.7;
  ctx.font = `13px ${font}`;
  pic.lines.forEach((l, i) => ctx.fillText(l, MARGIN, MARGIN + 42 + i * 20));
  ctx.globalAlpha = 1;

  try {
    const img = await loadImage(url);
    ctx.drawImage(img, MARGIN, MARGIN + headH, w, h);
  } finally {
    URL.revokeObjectURL(url);
  }

  const colW = w / 3;
  ctx.font = `13px ${font}`;
  pic.legend.forEach((l, i) => {
    const lx = MARGIN + (i % 3) * colW;
    const ly = MARGIN + headH + h + 18 + Math.floor(i / 3) * 22;
    ctx.strokeStyle = l.color;
    ctx.lineWidth = 3;
    ctx.setLineDash(l.dashed ? [5, 4] : []);
    ctx.beginPath();
    ctx.moveTo(lx, ly - 4);
    ctx.lineTo(lx + 18, ly - 4);
    ctx.stroke();
    ctx.fillStyle = text;
    ctx.fillText(l.label, lx + 26, ly);
  });

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no picture"))), "image/png"));
}

/** Saves a PNG with a file name. */
export function savePng(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Puts a PNG on the clipboard; false where the browser does not allow it. */
export async function copyPng(blob: Blob): Promise<boolean> {
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}
