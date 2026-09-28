// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The go-link icon drawn over every exported video (never over
// screenshots). It sits in a corner, beats slowly like a heart, and jumps
// to another corner at random every 8 to 15 seconds, so cropping one
// corner does not remove it. It is drawn on the frame the converter
// already paints (to enlarge the picture), so it costs nothing extra.

type Corner = 0 | 1 | 2 | 3; // top left, top right, bottom right, bottom left

/** Which corner the mark is in at each moment: changes every 8-15 s, never to the same one. */
export function cornerPlan(durationUs: number, random: () => number = Math.random): { atUs: number; corner: Corner }[] {
  const plan: { atUs: number; corner: Corner }[] = [];
  let corner = Math.floor(random() * 4) as Corner;
  for (let at = 0; at <= durationUs; at += (8 + random() * 7) * 1e6) {
    plan.push({ atUs: at, corner });
    corner = ((corner + 1 + Math.floor(random() * 3)) % 4) as Corner;
  }
  return plan;
}

/**
 * A slow heartbeat: two soft beats ("lub-dub") and a long rest, every 3 s,
 * calm enough not to pull the eye from the game. Gives the scale of the
 * mark, 1 at rest and up to 1 + depth on a beat.
 */
export function heartbeat(timeUs: number, depth = 0.08): number {
  const period = 3e6;
  const t = (timeUs % period) / period;
  const beat = (center: number, width: number, height: number) => height * Math.exp(-(((t - center) / width) ** 2));
  return 1 + depth * Math.max(beat(0.12, 0.06, 1), beat(0.32, 0.06, 0.7));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("the logo did not load"));
    img.src = src;
  });
}

/**
 * Prepares the mark for a video of this size and length. The returned
 * function draws it on the frame at a time (microseconds).
 */
export async function createWatermark(
  width: number,
  height: number,
  durationUs: number,
): Promise<(ctx: OffscreenCanvasRenderingContext2D, timeUs: number) => void> {
  const logo = await loadImage(`${import.meta.env.BASE_URL}favicon.svg`);
  const size = Math.max(24, Math.round(height * 0.07));
  const margin = Math.round(height * 0.03); // also room for the beat
  const plan = cornerPlan(durationUs);
  return (ctx, timeUs) => {
    let corner: Corner = plan[0]?.corner ?? 2;
    for (const p of plan) if (p.atUs <= timeUs) corner = p.corner;
    const x = corner === 0 || corner === 3 ? margin : width - margin - size;
    const y = corner === 0 || corner === 1 ? margin : height - margin - size;
    const s = size * heartbeat(timeUs);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(logo, x + (size - s) / 2, y + (size - s) / 2, s, s);
    ctx.restore();
  };
}
