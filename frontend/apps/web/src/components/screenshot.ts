// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

/** "The Simpsons (4 Players)" -> "the-simpsons-4-players". */
export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "go-link"
  );
}

/** 2026-09-28-2130 in local time. */
export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Saves the picture on screen as a PNG in the browser's downloads. Only
 * the browser takes part: the frame comes from the <video> element. The
 * arcade picture is scaled by whole steps without smoothing (crisp pixels)
 * and stretched to the game's display aspect.
 */
export function saveScreenshot(video: HTMLVideoElement, name: string, aspect: number | null): boolean {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return false;
  const scale = Math.max(1, Math.floor(1280 / Math.max(w, h * (aspect ?? w / h))));
  const height = h * scale;
  const width = Math.round(aspect ? height * aspect : w * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(video, 0, 0, width, height);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(name)}-${stamp()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, "image/png");
  return true;
}
