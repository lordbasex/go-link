// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useRef, useState } from "react";
import type { StreamVideo } from "@go-link/shared";
import { t } from "../i18n";
import { useRefreshRate } from "../picture/refreshRate";

/**
 * The stream's figures behind a small (i) button that never changes size:
 * the numbers move every second, so they open on demand instead of
 * resizing a chip over the video. The ring is orange on the TURN relay.
 */
export function StreamInfo({
  rttMs,
  sentFps,
  receivedFps,
  path,
  codec = null,
  picture,
  video = null,
}: {
  rttMs: number | null;
  sentFps: number | null;
  receivedFps: number | null;
  path: "direct" | "relay" | null;
  /** The video codec the browser decodes ("H.264", "VP8"). */
  codec?: string | null;
  /** How the picture is drawn ("Sharp · WebGL 2", or the browser's own). */
  picture?: string;
  /** The picture the device sends (stream_stats video). */
  video?: StreamVideo | null;
}) {
  const [open, setOpen] = useState(false);
  // The screen's refresh rate, measured only while the figures are open.
  const hz = useRefreshRate(open);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => (e.key === "Escape" || e.code === "Escape") && setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  const ms = rttMs === null ? "–" : rttMs < 1 ? "< 1 ms" : `${rttMs} ms`;
  const rows: [string, string][] = [
    [t.room.statsLatency, ms],
    [t.room.statsPath, path === "relay" ? t.room.statsRelay : path === "direct" ? t.room.statsDirect : "–"],
    [t.room.statsSent, sentFps === null ? "–" : `${sentFps.toFixed(1)} fps`],
    [t.room.statsReceived, receivedFps === null ? "–" : `${Math.round(receivedFps)} fps`],
    [t.picture.screen, hz === null ? "–" : t.picture.hz(hz)],
    ...(video ? videoRows(video) : []),
    ...(codec ? [[t.room.statsCodec, codec] as [string, string]] : []),
    ...(picture ? [[t.picture.renderer, picture] as [string, string]] : []),
  ];
  return (
    <div className={`video-stats stream-info${path === "relay" ? " is-relay" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="stream-info-button"
        aria-expanded={open}
        aria-label={t.room.statsButton}
        title={t.room.statsButton}
        onClick={() => setOpen(!open)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 7.5v.5" />
        </svg>
      </button>
      {open && (
        <div className="stream-info-panel" role="dialog" aria-label={t.room.statsButton}>
          <dl>
            {rows.map(([k, v]) => (
              <div key={k} className="stream-info-row">
                <dt>{k}</dt>
                <dd className="mono">{v}</dd>
              </div>
            ))}
          </dl>
          {path === "relay" && <p className="small muted">{t.room.relayHint}</p>}
        </div>
      )}
    </div>
  );
}

/** "768×448 (2× of 384×224)" and the quality in use, "Saver (CPU)" after a fallback. */
export function videoRows(v: StreamVideo): [string, string][] {
  const rows: [string, string][] = [
    [
      t.video.size,
      v.scale === 2 ? t.video.sizeScaled(v.width * 2, v.height * 2, v.width, v.height) : t.video.sizeNative(v.width, v.height),
    ],
  ];
  if (v.quality) rows.push([t.video.quality, videoQualityText(v.quality, v.fallback)]);
  return rows;
}

/** "High", or "Saver (CPU)" when the room could not keep up with 2x. */
export function videoQualityText(q: keyof typeof t.video.qualities, fallback?: string): string {
  return fallback === "cpu" ? t.video.withCpu(t.video.qualities[q]) : t.video.qualities[q];
}
