// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useId, useRef, useState } from "react";
import {
  formatBytes,
  parseRecordingEvent,
  type DownloadProgress,
  type RecordingDownload,
  type RecordingEvent,
  type RecordingInfo,
  type RecordingTrack,
} from "@go-link/shared";
import { t } from "../i18n";
import { useSignal } from "../signal/SignalProvider";
import { formatDuration } from "./device/HistoryTab";
import { DownloadIcon } from "./Icons";
import { canMakeMp4, Mp4Unsupported, webmToMp4 } from "./toMp4";

/** "Video · Game · Voice P1": the tracks of a recording. */
export function trackNames(tracks: readonly RecordingTrack[]): string {
  return tracks
    .map((tr) =>
      tr === "video"
        ? t.rec.track.video
        : tr === "game"
          ? t.rec.track.game
          : t.rec.track.voice(Number(tr.slice(-1))),
    )
    .join(" · ");
}

/** 3 m 05 s style remaining time. */
function formatLeft(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "–";
  const s = Math.ceil(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

/** Saves bytes as a file in the browser's downloads. */
function saveFile(parts: BlobPart[], name: string, type: string): void {
  const url = URL.createObjectURL(new Blob(parts, { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog rec-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className="dialog-title">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

/** Duration, size, tracks and where it lives on the device. */
export function RecordingFacts({ rec }: { rec: RecordingInfo }) {
  return (
    <dl className="rec-facts">
      <dt>{t.rec.duration}</dt>
      <dd>{formatDuration(rec.durationMs)}</dd>
      <dt>{t.rec.size}</dt>
      <dd>{`${formatBytes(rec.size)} · WebM`}</dd>
      <dt>{t.rec.tracks}</dt>
      <dd>{trackNames(rec.tracks)}</dd>
      <dt>{t.rec.onDevice}</dt>
      <dd className="mono small">{`~/go-link/rec/${rec.id}`}</dd>
    </dl>
  );
}

type Phase =
  | { kind: "running"; progress: DownloadProgress | null }
  | { kind: "converting"; fraction: number }
  | { kind: "done"; mp4: boolean; note: string }
  | { kind: "cancelled" }
  | { kind: "failed"; error: string };

/**
 * Downloads a recording from the device over WebRTC, in parts the browser
 * asks for, with live progress, a cancel button and a SHA-256 check. Then
 * the browser itself turns it into an MP4 (see toMp4.ts) so it can be sent
 * by chat apps and played on phones; where it cannot, the original WebM is
 * saved.
 */
export function DownloadDialog({ rec, onClose }: { rec: RecordingInfo; onClose: () => void }) {
  const { hostLink } = useSignal();
  const [phase, setPhase] = useState<Phase>({ kind: "running", progress: null });
  const [attempt, setAttempt] = useState(0);
  const current = useRef<RecordingDownload | null>(null);
  const converting = useRef<AbortController | null>(null);
  const original = useRef<{ parts: BlobPart[]; name: string } | null>(null);

  useEffect(() => {
    const stream = hostLink?.stream;
    setPhase({ kind: "running", progress: null });
    original.current = null;
    let d: RecordingDownload;
    try {
      if (!stream) throw new Error("no device link");
      d = stream.download(rec.id, (p) => setPhase({ kind: "running", progress: p }));
    } catch (e) {
      setPhase({ kind: "failed", error: e instanceof Error ? e.message : String(e) });
      return;
    }
    current.current = d;
    let live = true;
    const abort = new AbortController();
    converting.current = abort;
    void d.result.then(async (r) => {
      if (!live) return;
      if (!r.ok) {
        setPhase(r.cancelled ? { kind: "cancelled" } : { kind: "failed", error: r.error });
        return;
      }
      const name = r.name || rec.file;
      const parts = r.parts as BlobPart[];
      original.current = { parts, name };
      const saveOriginal = (note: string) => {
        saveFile(parts, name, "video/webm");
        setPhase({ kind: "done", mp4: false, note });
      };
      if (!canMakeMp4()) {
        saveOriginal(t.rec.webmOnly);
        return;
      }
      setPhase({ kind: "converting", fraction: 0 });
      try {
        const webm = new Uint8Array(await new Blob(parts).arrayBuffer());
        const mp4 = await webmToMp4(webm, (fraction) => live && setPhase({ kind: "converting", fraction }), abort.signal);
        if (!live) return;
        saveFile([mp4], name.replace(/\.webm$/i, "") + ".mp4", "video/mp4");
        setPhase({ kind: "done", mp4: true, note: "" });
      } catch (e) {
        if (!live) return;
        if (abort.signal.aborted) setPhase({ kind: "cancelled" });
        else if (e instanceof Mp4Unsupported) saveOriginal(t.rec.webmOnly);
        else saveOriginal(t.rec.mp4Failed(e instanceof Error ? e.message : String(e)));
      }
    });
    return () => {
      live = false;
      d.cancel();
      abort.abort();
    };
  }, [hostLink, rec.id, rec.file, attempt]);

  const cancel = () => {
    current.current?.cancel();
    converting.current?.abort();
  };
  const busy = phase.kind === "running" || phase.kind === "converting";
  const p = phase.kind === "running" ? phase.progress : null;
  const size = p?.size || rec.size;
  const got = phase.kind === "running" ? (p?.received ?? 0) : size;
  const pct =
    phase.kind === "converting"
      ? Math.floor(phase.fraction * 100)
      : size
        ? Math.min(100, Math.floor((got * 100) / size))
        : 0;
  const chunks = (n: number) => Math.ceil(n / (60 * 1024)).toLocaleString();
  const title =
    phase.kind === "done"
      ? t.rec.downloadDone
      : phase.kind === "cancelled"
        ? t.rec.downloadCancelled
        : phase.kind === "failed"
          ? t.rec.downloadFailed
          : phase.kind === "converting"
            ? t.rec.preparing
            : t.rec.downloadTitle;
  const fileName =
    phase.kind === "converting" || (phase.kind === "done" && phase.mp4)
      ? rec.file.replace(/\.webm$/i, "") + ".mp4"
      : rec.file;

  return (
    <Modal title={title} onClose={() => (busy ? cancel() : onClose())}>
      <div className="rec-file">
        <span className="rec-file-icon" aria-hidden="true">
          <DownloadIcon />
        </span>
        <span className="mono small">{fileName}</span>
      </div>
      <div
        className={`rec-bar${phase.kind === "converting" ? " is-converting" : ""}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={title}
      >
        <i style={{ width: `${phase.kind === "cancelled" ? 0 : pct}%` }} />
      </div>
      <div className="rec-bar-text small">
        <span>
          {phase.kind === "failed"
            ? phase.error
            : phase.kind === "cancelled"
              ? ""
              : phase.kind === "converting"
                ? t.rec.preparingPct(pct)
                : t.rec.progress(formatBytes(got), formatBytes(size), pct)}
        </span>
        <span>
          {p && p.rate > 0 ? t.rec.speed(formatBytes(p.rate), formatLeft((size - got) / p.rate)) : ""}
        </span>
      </div>
      <div className="rec-tiles">
        <div>
          <span>{t.rec.parts}</span>
          <b className="mono">{phase.kind === "cancelled" ? "–" : `${chunks(got)} / ${chunks(size)}`}</b>
        </div>
        <div>
          <span>{t.rec.check}</span>
          <b>{phase.kind === "running" ? t.rec.checkAtEnd : phase.kind === "cancelled" || phase.kind === "failed" ? "–" : t.rec.checkOk}</b>
        </div>
        <div>
          <span>{t.rec.format}</span>
          <b>
            {phase.kind === "done"
              ? phase.mp4
                ? "MP4 · H.264 + AAC"
                : "WebM"
              : phase.kind === "converting"
                ? t.rec.formatPreparing
                : "–"}
          </b>
        </div>
      </div>
      {phase.kind === "done" && phase.note ? (
        <p className="notice small">{phase.note}</p>
      ) : (
        <p className="small muted">{phase.kind === "converting" ? t.rec.preparingHint : t.rec.downloadHint}</p>
      )}
      <div className="dialog-actions">
        {busy ? (
          <button type="button" className="button button-danger" onClick={cancel}>
            {t.rec.cancel}
          </button>
        ) : (
          <>
            {phase.kind === "done" && phase.mp4 && original.current && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => original.current && saveFile(original.current.parts, original.current.name, "video/webm")}
              >
                {t.rec.original}
              </button>
            )}
            {phase.kind !== "done" && (
              <button type="button" className="button button-secondary" onClick={() => setAttempt((n) => n + 1)}>
                {t.rec.retry}
              </button>
            )}
            <button type="button" className="button button-primary" onClick={onClose}>
              {t.rec.close}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

/**
 * Listens to the linked device: when a recording ends (stopped, paused,
 * room closed, a limit) it offers to download it; when one was lost it
 * says why. Mounted once for the whole site.
 */
export function RecordingNotices() {
  const { onDeviceMessage } = useSignal();
  const [event, setEvent] = useState<RecordingEvent | null>(null);
  const [downloading, setDownloading] = useState<RecordingInfo | null>(null);
  useEffect(() => onDeviceMessage((msg) => {
    const ev = parseRecordingEvent(msg);
    if (ev) setEvent(ev);
  }), [onDeviceMessage]);

  if (downloading) return <DownloadDialog rec={downloading} onClose={() => setDownloading(null)} />;
  if (!event) return null;
  const close = () => setEvent(null);
  if (event.type === "recording_error")
    return (
      <Modal title={t.rec.errorTitle} onClose={close}>
        <p className="muted">{`${t.rec.reason[event.reason]} ${event.error}`}</p>
        <div className="dialog-actions">
          <button type="button" className="button button-primary" onClick={close}>
            {t.rec.close}
          </button>
        </div>
      </Modal>
    );
  return (
    <Modal title={t.rec.savedTitle} onClose={close}>
      <p className="muted">{t.rec.savedText(t.rec.reason[event.reason])}</p>
      <RecordingFacts rec={event.recording} />
      <div className="dialog-actions">
        <button type="button" className="button button-secondary" onClick={close}>
          {t.rec.later}
        </button>
        <button
          type="button"
          className="button button-primary"
          onClick={() => {
            setDownloading(event.recording);
            setEvent(null);
          }}
        >
          {t.rec.downloadNow}
        </button>
      </div>
    </Modal>
  );
}
