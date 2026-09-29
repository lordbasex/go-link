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

const MIC_BASE: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

/**
 * Opens the microphone the first time it is needed and keeps it open;
 * talking is switched with track.enabled, which is instant. Echo
 * cancellation matters: the game plays through the same speakers.
 * A new deviceId ("" = the system's default) opens that microphone and
 * replaces the stream; the caller swaps the new track into the sender
 * (replaceTrack), so the connection is not renegotiated. A device that
 * cannot be opened falls back to the default.
 */
export function useMicrophone(
  wanted: boolean,
  talking: boolean,
  deviceId = "",
): { stream: MediaStream | null; state: MicState } {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<MicState>("off");
  // The device the current stream was opened for, and a request in flight.
  const openedFor = useRef<string | null>(null);
  const busy = useRef(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!wanted || state === "denied" || busy.current) return;
    if (stream && openedFor.current === deviceId) return;
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) {
      setState("denied");
      return;
    }
    busy.current = true;
    if (!stream) setState("starting");
    const want = deviceId;
    const open = (id: string) =>
      md.getUserMedia({ audio: id ? { ...MIC_BASE, deviceId: { exact: id } } : MIC_BASE });
    open(want)
      .catch((err: unknown) => (want ? open("") : Promise.reject(err)))
      .then(
        (s) => {
          openedFor.current = want;
          setStream(s);
          setState("on");
        },
        () => {
          openedFor.current = want;
          if (!stream) setState("denied");
        },
      )
      .finally(() => {
        busy.current = false;
        setRetry((n) => n + 1); // the device may have changed meanwhile
      });
  }, [wanted, stream, state, deviceId, retry]);

  useEffect(() => {
    stream?.getAudioTracks().forEach((t) => (t.enabled = talking));
  }, [stream, talking]);

  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);
  return { stream, state };
}

/**
 * The level (0..1) of a microphone track while the person tests it, even
 * with the microphone muted: it measures an enabled copy of the track,
 * which never reaches the room.
 */
export function useMicTest(track: MediaStreamTrack | null, active: boolean): number | null {
  const [copy, setCopy] = useState<MediaStream | null>(null);
  useEffect(() => {
    if (!active || !track || typeof MediaStream === "undefined") {
      setCopy(null);
      return;
    }
    const clone = track.clone();
    clone.enabled = true;
    setCopy(new MediaStream([clone]));
    return () => clone.stop();
  }, [track, active]);
  const levels = useAudioLevels({ test: copy }, active && copy !== null);
  return copy ? (levels.test ?? 0) : null;
}
