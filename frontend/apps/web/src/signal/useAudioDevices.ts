// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useCallback, useEffect, useRef, useState } from "react";

/** The microphone and the output this browser uses in rooms. */
export const AUDIO_IN_KEY = "go-link.audio-in";
export const AUDIO_OUT_KEY = "go-link.audio-out";
/** How long the "device disconnected" notice stays. */
const NOTICE_MS = 6000;

export interface AudioDevice {
  /** deviceId; empty while the browser hides devices (no permission yet). */
  id: string;
  /** The device's name; empty until the microphone is allowed. */
  label: string;
}

/** A remembered choice: the id plus its name, to name it once it is gone. "" = system default. */
interface Choice {
  id: string;
  label: string;
}

export interface DeviceNotice {
  kind: "in" | "out";
  name: string;
}

export interface AudioDevices {
  inputs: AudioDevice[];
  outputs: AudioDevice[];
  /** The microphone to open ("" = the system's default). */
  micId: string;
  /** Where room sound plays ("" = the system's default). */
  outId: string;
  setMic: (id: string) => void;
  setOut: (id: string) => void;
  /** Whether this browser can send sound to a chosen output. */
  outputSupported: boolean;
  /** Firefox lists outputs only after the person picks one in its own dialog. */
  canPickOutput: boolean;
  pickOutput: () => void;
  /** Reads the devices again (after the microphone is allowed, names appear). */
  refresh: () => void;
  notice: DeviceNotice | null;
}

type SinkTarget = { setSinkId?: (id: string) => Promise<void> };
type PickOutput = (opts?: { deviceId?: string }) => Promise<MediaDeviceInfo>;

/** True where an <audio>/<video> element can play on a chosen output (not iPhone/iPad or desktop Safari). */
export function outputSupported(): boolean {
  return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
}

/** iPhone and iPad (iPadOS reports itself as a Mac with a touch screen). */
export function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1);
}

/** Sends a media element or an AudioContext to an output ("" = default). Quiet where unsupported. */
export function applySink(target: unknown, id: string): void {
  const el = target as SinkTarget | null;
  if (!el || typeof el.setSinkId !== "function" || !outputSupported()) return;
  try {
    void el.setSinkId(id).catch(() => undefined);
  } catch {
    // an output that vanished between the choice and now: the default plays
  }
}

/**
 * A short two-note tone on the chosen output, to check where the sound
 * goes. Web Audio plays it through an <audio> element when only media
 * elements can choose their output.
 */
export async function playTestTone(sinkId: string): Promise<void> {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  try {
    await ctx.resume();
    let out: AudioNode = ctx.destination;
    let el: HTMLAudioElement | null = null;
    if (sinkId && outputSupported()) {
      const ctxSink = ctx as unknown as SinkTarget;
      if (typeof ctxSink.setSinkId === "function") {
        await ctxSink.setSinkId(sinkId).catch(() => undefined);
      } else if (typeof ctx.createMediaStreamDestination === "function") {
        const dest = ctx.createMediaStreamDestination();
        el = new Audio();
        el.srcObject = dest.stream;
        await (el as unknown as SinkTarget).setSinkId?.(sinkId).catch(() => undefined);
        await el.play().catch(() => undefined);
        out = dest;
      }
    }
    const start = ctx.currentTime + 0.05;
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t0 = start + i * 0.22;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.2, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      osc.connect(gain).connect(out);
      osc.start(t0);
      osc.stop(t0 + 0.21);
    });
    await new Promise((r) => setTimeout(r, 800));
    el?.pause();
  } finally {
    void ctx.close().catch(() => undefined);
  }
}

function readChoice(key: string): Choice {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { id: "", label: "" };
    const v = JSON.parse(raw) as Partial<Choice>;
    return { id: typeof v.id === "string" ? v.id : "", label: typeof v.label === "string" ? v.label : "" };
  } catch {
    return { id: "", label: "" };
  }
}

function writeChoice(key: string, c: Choice): void {
  try {
    if (c.id) localStorage.setItem(key, JSON.stringify(c));
    else localStorage.removeItem(key);
  } catch {
    // storage disabled: the choice lasts for this page only
  }
}

/** Devices of one kind, without the browser's own "default" and "communications" aliases. */
function listOf(all: MediaDeviceInfo[], kind: MediaDeviceKind): AudioDevice[] {
  return all
    .filter((d) => d.kind === kind && d.deviceId !== "default" && d.deviceId !== "communications")
    .map((d) => ({ id: d.deviceId, label: d.label }));
}

/** Whether the browser showed real devices (it hides them until the microphone is allowed). */
function known(list: AudioDevice[]): boolean {
  return list.some((d) => d.id !== "");
}

/**
 * The room's microphone and output choices. They are remembered per
 * browser; a chosen device that disconnects sends the sound back to the
 * default, with a notice naming it. A remembered device that is simply
 * not plugged in when the room opens is skipped without forgetting it.
 */
export function useAudioDevices(): AudioDevices {
  const [inputs, setInputs] = useState<AudioDevice[]>([]);
  const [outputs, setOutputs] = useState<AudioDevice[]>([]);
  const [mic, setMicChoice] = useState<Choice>(() => readChoice(AUDIO_IN_KEY));
  const [out, setOutChoice] = useState<Choice>(() => readChoice(AUDIO_OUT_KEY));
  const [notice, setNotice] = useState<DeviceNotice | null>(null);
  const choices = useRef({ mic, out });
  choices.current = { mic, out };
  // The devices seen by the last reading, to tell "unplugged now" from "never here".
  const seen = useRef<Set<string>>(new Set());

  const read = useCallback(async (fromChange: boolean) => {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.enumerateDevices) return;
    let all: MediaDeviceInfo[];
    try {
      all = await md.enumerateDevices();
    } catch {
      return;
    }
    const ins = listOf(all, "audioinput");
    const outs = listOf(all, "audiooutput");
    setInputs(ins);
    setOutputs(outs);
    const before = seen.current;
    seen.current = new Set([...ins, ...outs].map((d) => d.id).filter(Boolean));
    if (!fromChange) return;
    const { mic: m, out: o } = choices.current;
    const gone = (c: Choice, list: AudioDevice[]) =>
      c.id !== "" && known(list) && before.has(c.id) && !list.some((d) => d.id === c.id);
    if (gone(o, outs)) {
      setOutChoice({ id: "", label: "" });
      writeChoice(AUDIO_OUT_KEY, { id: "", label: "" });
      setNotice({ kind: "out", name: o.label });
    }
    if (gone(m, ins)) {
      setMicChoice({ id: "", label: "" });
      writeChoice(AUDIO_IN_KEY, { id: "", label: "" });
      setNotice({ kind: "in", name: m.label });
    }
  }, []);

  useEffect(() => {
    void read(false);
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.addEventListener) return;
    const change = () => void read(true);
    md.addEventListener("devicechange", change);
    return () => md.removeEventListener("devicechange", change);
  }, [read]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const choose = (list: AudioDevice[], key: string, set: (c: Choice) => void) => (id: string) => {
    const c = { id, label: list.find((d) => d.id === id)?.label ?? "" };
    set(c);
    writeChoice(key, c);
  };

  const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  const picker = (md as unknown as { selectAudioOutput?: PickOutput } | undefined)?.selectAudioOutput;
  const pickOutput = useCallback(() => {
    if (!picker) return;
    picker
      .call(md, choices.current.out.id ? { deviceId: choices.current.out.id } : undefined)
      .then((d) => {
        const c = { id: d.deviceId, label: d.label };
        setOutChoice(c);
        writeChoice(AUDIO_OUT_KEY, c);
        setOutputs((list) => (list.some((x) => x.id === c.id) ? list : [...list, c]));
      })
      .catch(() => undefined); // closed without choosing
  }, [picker, md]);

  // A remembered device that is not here now: the default plays until it comes back.
  const effective = (c: Choice, list: AudioDevice[]) =>
    c.id && known(list) && !list.some((d) => d.id === c.id) ? "" : c.id;

  return {
    inputs,
    outputs,
    micId: effective(mic, inputs),
    outId: effective(out, outputs),
    setMic: choose(inputs, AUDIO_IN_KEY, setMicChoice),
    setOut: choose(outputs, AUDIO_OUT_KEY, setOutChoice),
    outputSupported: outputSupported(),
    canPickOutput: outputSupported() && typeof picker === "function",
    pickOutput,
    refresh: useCallback(() => void read(false), [read]),
    notice,
  };
}
