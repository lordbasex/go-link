// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useState } from "react";
import { VIDEO_QUALITIES, type VideoQuality } from "@go-link/shared";
import { t } from "../../i18n";
import { useSignal } from "../../signal/SignalProvider";
import { Select } from "../ui/Select";
import { videoQualityText } from "../StreamInfo";

/**
 * The device's video quality for game rooms, like its window's Settings:
 * High and Normal send the game at twice its size, Saver at its own. The
 * running rooms show the quality they really use: "Saver (CPU)" when the
 * computer could not keep up with twice the size.
 */
export function VideoQualityCard() {
  const { linkedDevice, sendToDevice, onDeviceMessage } = useSignal();
  const status = linkedDevice.status;
  const [error, setError] = useState("");
  useEffect(
    () =>
      onDeviceMessage((msg) => {
        const m = msg as { type?: string; ok?: boolean };
        if (m.type === "video_quality_result") setError(m.ok ? "" : t.video.error);
      }),
    [onDeviceMessage],
  );
  // Devices older than this setting never send it.
  if (!status?.videoQuality) return null;
  const running = status.rooms.filter((r) => r.video && (r.state === "live" || r.state === "paused"));
  const fellBack = running.some((r) => r.video?.fallback === "cpu");
  return (
    <div className="card dash-card stack-sm">
      <h2 className="card-title" id="video-quality-title">
        {t.video.title}
      </h2>
      <p className="small muted">{t.video.text}</p>
      <div className="audio-field">
        <label htmlFor="video-quality" id="video-quality-label" className="audio-label">
          {t.video.label}
        </label>
        <Select<VideoQuality>
          id="video-quality"
          labelId="video-quality-label"
          value={status.videoQuality}
          onChange={(quality) => sendToDevice({ type: "set_video_quality", quality })}
          options={VIDEO_QUALITIES.map((q) => ({ value: q, label: t.video.qualities[q], detail: t.video.detail[q] }))}
        />
      </div>
      {running.length > 0 && (
        <dl className="dash-facts" aria-label={t.video.rooms}>
          {running.map((r) => (
            <div key={r.id} className="dash-fact-row">
              <dt>{r.name}</dt>
              <dd className={`mono${r.video?.fallback ? " is-warn" : ""}`}>
                {videoQualityText(r.video!.quality, r.video!.fallback)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {fellBack && <p className="small faint">{t.video.fallback}</p>}
      {error && (
        <p className="form-error small" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
