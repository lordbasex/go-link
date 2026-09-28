// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useRef, useState } from "react";

/**
 * Measures the loudness (0..1) of several audio streams with Web Audio.
 * It only runs while active, because an AudioContext needs a user
 * gesture to start. Remote WebRTC audio must also be playing in an
 * <audio> element for Chrome to feed it to Web Audio.
 */
export function useAudioLevels(
  streams: Record<string, MediaStream | null | undefined>,
  active: boolean,
): Record<string, number> {
  const [levels, setLevels] = useState<Record<string, number>>({});
  const ctxRef = useRef<AudioContext | null>(null);
  const key = Object.entries(streams)
    .map(([k, s]) => `${k}:${s?.id ?? ""}`)
    .join(",");

  useEffect(() => {
    if (!active || typeof AudioContext === "undefined") return;
    const ctx = (ctxRef.current ??= new AudioContext());
    void ctx.resume().catch(() => undefined);
    const analysers: [string, AnalyserNode, MediaStreamAudioSourceNode][] = [];
    for (const [name, stream] of Object.entries(streams)) {
      if (!stream || stream.getAudioTracks().length === 0) continue;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analysers.push([name, analyser, source]);
    }
    const buf = new Float32Array(512);
    let last: Record<string, number> = {};
    const timer = setInterval(() => {
      const next: Record<string, number> = {};
      for (const [name, analyser] of analysers) {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        // RMS scaled so normal speech reaches ~0.5-1.
        next[name] = Math.min(1, Math.sqrt(sum / buf.length) * 6);
      }
      const changed =
        Object.keys(next).some(
          (k) => Math.abs((next[k] ?? 0) - (last[k] ?? 0)) > 0.03,
        ) || Object.keys(next).length !== Object.keys(last).length;
      if (changed) {
        last = next;
        setLevels(next);
      }
    }, 120);
    return () => {
      clearInterval(timer);
      analysers.forEach(([, analyser, source]) => {
        source.disconnect();
        analyser.disconnect();
      });
    };
    // streams is summarized by key
  }, [key, active]);

  useEffect(
    () => () => void ctxRef.current?.close().catch(() => undefined),
    [],
  );
  return levels;
}

export type MicState = "off" | "starting" | "on" | "denied";

/**
 * Opens the microphone the first time it is needed and keeps it open;
 * talking is switched with track.enabled, which is instant. Echo
 * cancellation matters: the game plays through the same speakers.
 */
export function useMicrophone(
  wanted: boolean,
  talking: boolean,
): { stream: MediaStream | null; state: MicState } {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<MicState>("off");

  useEffect(() => {
    if (!wanted || stream || state === "starting" || state === "denied") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("denied");
      return;
    }
    setState("starting");
    navigator.mediaDevices
      .getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      })
      .then((s) => {
        setStream(s);
        setState("on");
      })
      .catch(() => setState("denied"));
  }, [wanted, stream, state]);

  useEffect(() => {
    stream?.getAudioTracks().forEach((t) => (t.enabled = talking));
  }, [stream, talking]);

  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);
  return { stream, state };
}
