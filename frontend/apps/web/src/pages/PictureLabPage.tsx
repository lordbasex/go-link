// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useState } from "react";
import { renderStill } from "../picture/renderer";
import { PICTURE_BANDS, PICTURE_STYLES, type PictureBands } from "../picture/settings";
import { CARD_ASPECT, CARD_H, CARD_W, drawTestCard } from "../picture/testCard";

// /picture-lab (development builds only, never linked): renders a still
// picture in every style at 1920 x 1080 and 3840 x 2160 so a script can
// save the results and compare them. ?src= takes a same-origin path to an
// image (for example a file in public/lab/, which is not committed), or
// "testcard"; ?aspect= the display aspect (default 4/3); ?bands= the sides;
// ?up=2 enlarges the source 2x with nearest neighbour first and draws it as
// a device's 2x stream (averaged back to the source's pixels), unless
// &native=0 draws the enlarged frames as they are.

const SIZES: [number, number][] = [
  [1920, 1080],
  [3840, 2160],
];

export interface LabResult {
  style: string;
  bands: string;
  width: number;
  height: number;
  url: string;
}

/** A same-origin path, or null: the lab never loads other sites' files. */
export function labSource(raw: string | null, origin: string): string | null {
  if (!raw || raw === "testcard") return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  try {
    const url = new URL(raw, origin);
    return url.origin === origin ? url.pathname + url.search : null;
  } catch {
    return null;
  }
}

async function loadSource(path: string | null): Promise<HTMLCanvasElement | ImageBitmap> {
  if (path === null) {
    const c = document.createElement("canvas");
    c.width = CARD_W;
    c.height = CARD_H;
    const ctx = c.getContext("2d");
    if (ctx) drawTestCard(ctx, 1200, new Date(2026, 0, 1, 12, 34, 56));
    return c;
  }
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return createImageBitmap(await res.blob());
}

/** The picture enlarged 2x with nearest neighbour, like a device's 2x stream. */
function enlarge2x(src: HTMLCanvasElement | ImageBitmap): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width * 2;
  c.height = src.height * 2;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, c.width, c.height);
  }
  return c;
}

export function PictureLabPage() {
  const [results, setResults] = useState<LabResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const raw = q.get("src");
    const path = labSource(raw, window.location.origin);
    if (raw && raw !== "testcard" && path === null) {
      setError("src must be a same-origin path such as /lab/frame.png");
      setDone(true);
      return;
    }
    const aspectParam = q.get("aspect");
    const aspect = aspectParam
      ? aspectParam.includes("/")
        ? Number(aspectParam.split("/")[0]) / Number(aspectParam.split("/")[1])
        : Number(aspectParam)
      : CARD_ASPECT;
    const up = q.get("up") === "2";
    const averaged = q.get("native") !== "0";
    const bandsParam = q.get("bands");
    const bands: PictureBands[] =
      bandsParam === "all" ? [...PICTURE_BANDS] : (PICTURE_BANDS as readonly string[]).includes(bandsParam ?? "") ? [bandsParam as PictureBands] : ["black"];
    let cancelled = false;
    loadSource(path)
      .then((loaded) => {
        const source = up ? enlarge2x(loaded) : loaded;
        const native = up && averaged ? { w: loaded.width, h: loaded.height } : null;
        const out: LabResult[] = [];
        for (const [w, h] of SIZES)
          for (const b of bands)
            for (const style of PICTURE_STYLES) {
              const canvas = renderStill(source, { style, bands: b, aspect: aspect > 0 ? aspect : CARD_ASPECT, native }, w, h);
              if (!canvas) throw new Error("WebGL is not available");
              out.push({ style, bands: b, width: w, height: h, url: canvas.toDataURL("image/png") });
            }
        if (!cancelled) {
          setResults(out);
          (window as unknown as { __pictureLab?: LabResult[] }).__pictureLab = out;
        }
      })
      .catch((err: unknown) => !cancelled && setError(String(err)))
      .finally(() => !cancelled && setDone(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page">
      <div className="page-body stack-sm" data-lab-ready={done ? "true" : "false"}>
        <h1 className="page-title">Picture lab</h1>
        {error && <p role="alert">{error}</p>}
        <div className="picture-lab-grid">
          {results.map((r) => (
            <figure key={`${r.style}-${r.bands}-${r.width}`} data-style={r.style} data-bands={r.bands} data-size={`${r.width}x${r.height}`}>
              <img src={r.url} alt={`${r.style}, ${r.bands}, ${r.width} x ${r.height}`} width={r.width} height={r.height} />
              <figcaption className="small mono">
                {r.style} · {r.bands} · {r.width}×{r.height}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
