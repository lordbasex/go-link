// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { decodeVoices, type Mp4Gains, type Recording } from "./toMp4";

const RATE = 48000;
const VOICE_WINDOW_US = 2_000_000; // voices are decoded two seconds at a time
const AHEAD_US = 4_000_000; // and kept this far ahead of the picture

interface Props {
  rec: Recording;
  /** A blob: URL of the WebM (the <video> plays the picture and the game sound). */
  src: string;
  gains: Mp4Gains;
  onGains: (g: Mp4Gains) => void;
}

/**
 * Plays a downloaded recording before it becomes an MP4, with a volume for
 * the game and one for the voices, and a meter that warns when the mix
 * would clip. The <video> plays the picture and the game (its first sound
 * track); the voices are decoded a few seconds ahead with WebCodecs and
 * played next to it with Web Audio. Everything stays in the browser.
 */
export function RecordingPreview({ rec, src, gains, onGains }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audio = useRef<{ ctx: AudioContext; game: GainNode; voices: GainNode; analyser: AnalyserNode } | null>(null);
  const [peak, setPeak] = useState(0);
  const [clipAt, setClipAt] = useState(0);
  const [unplayable, setUnplayable] = useState(false);

  // The gains follow the sliders live.
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    a.game.gain.value = gains.game;
    a.voices.gain.value = gains.voices;
  }, [gains]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let epoch = 0; // bumped on seek and pause: late windows are dropped
    let nextUs = 0;
    let busy = false;
    let raf = 0;
    const playing: AudioBufferSourceNode[] = [];

    const ensureAudio = () => {
      if (audio.current) return audio.current;
      const ctx = new AudioContext({ sampleRate: RATE });
      const game = ctx.createGain();
      const voices = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx.createMediaElementSource(video).connect(game);
      game.connect(analyser);
      voices.connect(analyser);
      analyser.connect(ctx.destination);
      game.gain.value = gains.game;
      voices.gain.value = gains.voices;
      audio.current = { ctx, game, voices, analyser };
      return audio.current;
    };

    const stopVoices = () => {
      epoch++;
      for (const s of playing.splice(0)) {
        try {
          s.stop();
        } catch {
          // already over
        }
      }
      nextUs = Math.floor((video.currentTime * 1e6) / VOICE_WINDOW_US) * VOICE_WINDOW_US;
    };

    const pump = async () => {
      if (!rec.hasVoices || busy || video.paused) return;
      const a = ensureAudio();
      busy = true;
      const mine = epoch;
      try {
        while (mine === epoch && !video.paused && nextUs < rec.endUs && nextUs < video.currentTime * 1e6 + AHEAD_US) {
          const from = nextUs;
          const pcm = await decodeVoices(rec, from, from + VOICE_WINDOW_US);
          if (mine !== epoch) return;
          nextUs = from + VOICE_WINDOW_US;
          if (!pcm.some((v) => v !== 0)) continue; // nobody spoke
          const buf = a.ctx.createBuffer(1, pcm.length, RATE);
          buf.copyToChannel(pcm, 0);
          const node = a.ctx.createBufferSource();
          node.buffer = buf;
          node.connect(a.voices);
          const when = a.ctx.currentTime + (from / 1e6 - video.currentTime);
          if (when >= a.ctx.currentTime) node.start(when);
          else node.start(a.ctx.currentTime, a.ctx.currentTime - when);
          playing.push(node);
          node.onended = () => playing.splice(playing.indexOf(node) >>> 0, 1);
        }
      } finally {
        busy = false;
      }
    };

    // The meter: the loudest sample of the mix, a few times a second.
    const samples = new Float32Array(2048);
    let lastPaint = 0;
    const meter = (now: number) => {
      raf = requestAnimationFrame(meter);
      const a = audio.current;
      if (!a || now - lastPaint < 80) return;
      lastPaint = now;
      a.analyser.getFloatTimeDomainData(samples);
      let p = 0;
      for (const v of samples) p = Math.max(p, Math.abs(v));
      setPeak(p);
      if (p >= 0.99) setClipAt(Date.now());
    };

    const onPlay = () => {
      const a = ensureAudio();
      void a.ctx.resume();
      stopVoices();
      void pump();
    };
    const onStop = () => stopVoices();
    const tick = window.setInterval(() => void pump(), 500);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onStop);
    video.addEventListener("seeking", onStop);
    const onSeeked = () => void pump();
    video.addEventListener("seeked", onSeeked);
    raf = requestAnimationFrame(meter);
    return () => {
      window.clearInterval(tick);
      cancelAnimationFrame(raf);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onStop);
      video.removeEventListener("seeking", onStop);
      video.removeEventListener("seeked", onSeeked);
      stopVoices();
      void audio.current?.ctx.close();
      audio.current = null;
    };
    // gains are applied by the effect above; the graph is built once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec, src]);

  const clipping = Date.now() - clipAt < 1200;
  const slider = (key: keyof Mp4Gains, label: string, disabled = false) => (
    <label className={`rec-mix-row${disabled ? " is-off" : ""}`}>
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={300}
        step={5}
        value={Math.round(gains[key] * 100)}
        disabled={disabled}
        onChange={(e) => onGains({ ...gains, [key]: Number(e.target.value) / 100 })}
      />
      <b className="mono">{disabled ? "–" : `${Math.round(gains[key] * 100)} %`}</b>
    </label>
  );

  return (
    <div className="rec-preview">
      <video
        ref={videoRef}
        src={src}
        controls
        playsInline
        preload="auto"
        className="rec-preview-video"
        onError={() => setUnplayable(true)}
      />
      {unplayable && <p className="small muted">{t.rec.previewUnplayable}</p>}
      <div className="rec-mix" role="group" aria-label={t.rec.mixLabel}>
        {slider("game", t.rec.mixGame)}
        {slider("voices", rec.hasVoices ? t.rec.mixVoices : t.rec.mixNoVoices, !rec.hasVoices)}
        <div className={`rec-meter${clipping ? " is-clipping" : ""}`} aria-live="polite">
          <span className="rec-meter-bar">
            <i style={{ width: `${Math.min(100, peak * 100)}%` }} />
          </span>
          <span className="small">{clipping ? t.rec.clipping : t.rec.meter}</span>
        </div>
      </div>
    </div>
  );
}
