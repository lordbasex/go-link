// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Turns a go-link recording (WebM: VP8 video, Opus game sound and one Opus
// track per player's voice) into an MP4 that phones and chat apps play
// (H.264 video, AAC sound). Everything happens in the browser: WebCodecs
// decodes and encodes (with the graphics chip where there is one), and a
// small Go program compiled to WebAssembly (public/mp4) reads the WebM and
// writes the MP4. The device takes no part.
//
// When someone spoke the MP4 has three sound tracks, alternatives of one
// another (a player plays one): the game with the voices mixed in (the
// default, what phones and chat apps play), the game alone and the voices
// alone, each at the volume set in the preview.

import { createWatermark } from "./watermark";

const BASE = import.meta.env.BASE_URL;
const SCRIPT = `${BASE}mp4/wasm_exec.js`;
const BINARY = `${BASE}mp4/mp4.wasm`;
const RATE = 48000;
const WINDOW_S = 5; // sound is mixed and encoded 5 seconds at a time
const TARGET_HEIGHT = 900; // the arcade picture is enlarged by whole steps up to this

interface WebmTrack {
  number: number;
  type: number;
  codec: string;
  name: string;
  width: number;
  height: number;
  channels: number;
  rate: number;
  codecPrivate: Uint8Array;
}

interface GoMp4 {
  demux(webm: Uint8Array): {
    error?: string;
    tracks: WebmTrack[];
    frames: { track: Uint8Array; time: Float64Array; offset: Float64Array; size: Uint32Array };
  };
  create(config: string): number | { error: string };
  describe(id: number, track: number, desc: Uint8Array): { error: string } | null;
  add(id: number, track: number, timeUs: number, key: boolean, data: Uint8Array): { error: string } | null;
  finish(id: number): Uint8Array | { error: string };
  free(id: number): void;
}

type GoRuntime = { importObject: WebAssembly.Imports; run: (i: WebAssembly.Instance) => Promise<void> };
type GoWindow = typeof globalThis & { Go?: new () => GoRuntime; goLinkMp4?: GoMp4 };

/** Raised when this browser cannot make an MP4 (no WebCodecs, no H.264 or AAC encoder). */
export class Mp4Unsupported extends Error {}

let loading: Promise<GoMp4> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`cannot load ${src}`));
    document.head.appendChild(s);
  });
}

/** Loads the Go helper once (only when a recording is converted). */
function loadGo(): Promise<GoMp4> {
  loading ??= (async () => {
    const w = globalThis as GoWindow;
    if (typeof w.Go !== "function") await loadScript(SCRIPT);
    if (typeof w.Go !== "function") throw new Error("the Go runtime did not load");
    const go = new w.Go();
    let instance: WebAssembly.Instance;
    try {
      instance = (await WebAssembly.instantiateStreaming(fetch(BINARY), go.importObject)).instance;
    } catch {
      // A server that does not send application/wasm: load it whole.
      const res = await fetch(BINARY);
      if (!res.ok) throw new Error("the MP4 helper did not load");
      instance = (await WebAssembly.instantiate(await res.arrayBuffer(), go.importObject)).instance;
    }
    void go.run(instance);
    if (!w.goLinkMp4) throw new Error("the MP4 helper did not start");
    return w.goLinkMp4;
  })();
  loading.catch(() => (loading = null));
  return loading;
}

const check = <T>(v: T | { error: string } | null): T => {
  if (v && typeof v === "object" && "error" in v) throw new Error(v.error);
  return v as T;
};

/** a[i] of a typed array, 0 past the end (the index is always in range). */
const at = (a: ArrayLike<number>, i: number): number => a[i] ?? 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toBytes(buf: AllowSharedBufferSource): Uint8Array {
  if (buf instanceof Uint8Array) return buf;
  if (ArrayBuffer.isView(buf)) return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  return new Uint8Array(buf as ArrayBuffer);
}

/** H.264 profiles to try, from the most to the least compatible. */
const AVC_CODECS = ["avc1.42E028", "avc1.4D0028", "avc1.640028", "avc1.42001F"];

async function pickVideo(width: number, height: number): Promise<VideoEncoderConfig> {
  for (const codec of AVC_CODECS) {
    const cfg: VideoEncoderConfig = {
      codec,
      width,
      height,
      bitrate: Math.min(8_000_000, Math.round(width * height * 60 * 0.08)),
      framerate: 60,
      avc: { format: "avc" },
    };
    try {
      if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg;
    } catch {
      // try the next one
    }
  }
  throw new Mp4Unsupported("no H.264 encoder");
}

async function pickAudio(): Promise<AudioEncoderConfig> {
  const cfg: AudioEncoderConfig = { codec: "mp4a.40.2", sampleRate: RATE, numberOfChannels: 2, bitrate: 160_000 };
  try {
    if ((await AudioEncoder.isConfigSupported(cfg)).supported) return cfg;
  } catch {
    // below
  }
  throw new Mp4Unsupported("no AAC encoder");
}

/** Whether this browser has what the conversion needs. */
export function canMakeMp4(): boolean {
  return (
    typeof VideoEncoder !== "undefined" &&
    typeof VideoDecoder !== "undefined" &&
    typeof AudioEncoder !== "undefined" &&
    typeof AudioDecoder !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof WebAssembly !== "undefined"
  );
}

/** A recording opened for preview and conversion: its tracks and where each frame is. */
export interface Recording {
  webm: Uint8Array;
  video: WebmTrack;
  game: WebmTrack | undefined;
  audios: WebmTrack[];
  frames: ReturnType<GoMp4["demux"]>["frames"];
  byTrack: Map<number, number[]>;
  endUs: number;
  /** Someone spoke: the MP4 gets a voices track and the preview a voices volume. */
  hasVoices: boolean;
  payload: (i: number) => Uint8Array;
}

/** Reads a recording (loads the Go helper the first time). */
export async function openRecording(webm: Uint8Array): Promise<Recording> {
  if (typeof WebAssembly === "undefined") throw new Mp4Unsupported("no WebAssembly");
  const go = await loadGo();
  const file = go.demux(webm);
  if (file.error) throw new Error(file.error);
  const { tracks, frames } = file;
  const video = tracks.find((t) => t.type === 1 && t.codec === "V_VP8");
  const audios = tracks.filter((t) => t.type === 2 && t.codec === "A_OPUS");
  const game = audios.find((t) => /game/i.test(t.name)) ?? audios[0];
  if (!video || !video.width || !video.height) throw new Error("the recording has no video");
  // Frame indexes per track, in file order (the recording keeps each track in time order).
  const byTrack = new Map<number, number[]>();
  for (let i = 0; i < frames.track.length; i++) {
    const list = byTrack.get(at(frames.track, i)) ?? [];
    list.push(i);
    byTrack.set(at(frames.track, i), list);
  }
  const hasVoices = audios.some((v) => v !== game && (byTrack.get(v.number)?.length ?? 0) > 0);
  let endUs = 0;
  for (let i = 0; i < frames.time.length; i++) endUs = Math.max(endUs, at(frames.time, i));
  return {
    webm,
    video,
    game,
    audios,
    frames,
    byTrack,
    endUs: endUs + 20_000,
    hasVoices,
    payload: (i: number) => webm.subarray(at(frames.offset, i), at(frames.offset, i) + at(frames.size, i)),
  };
}

/**
 * The players' voices between two times, mixed to one channel at 48 kHz:
 * what the preview plays next to the video.
 */
export async function decodeVoices(rec: Recording, startUs: number, endUs: number): Promise<Float32Array<ArrayBuffer>> {
  const n = Math.max(0, Math.round(((endUs - startUs) * RATE) / 1e6));
  const out = new Float32Array(n);
  const voices = rec.audios.filter((t) => t !== rec.game);
  await Promise.all(
    voices.map(async (t) => {
      const list = (rec.byTrack.get(t.number) ?? []).filter((i) => {
        const ts = at(rec.frames.time, i);
        return ts >= startUs - 20_000 && ts < endUs;
      });
      if (list.length === 0) return;
      let failed = false;
      const d = new AudioDecoder({
        output: (a) => {
          const at0 = Math.round(((a.timestamp - startUs) * RATE) / 1e6);
          const tmp = new Float32Array(a.numberOfFrames);
          a.copyTo(tmp, { planeIndex: 0, format: "f32-planar" });
          for (let k = 0; k < tmp.length; k++) {
            const p = at0 + k;
            if (p >= 0 && p < n) out[p] = at(out, p) + at(tmp, k);
          }
          a.close();
        },
        error: () => (failed = true),
      });
      d.configure({
        codec: "opus",
        sampleRate: RATE,
        numberOfChannels: t.channels || 1,
        ...(t.codecPrivate.length ? { description: t.codecPrivate } : {}),
      });
      for (const i of list) {
        d.decode(new EncodedAudioChunk({ type: "key", timestamp: at(rec.frames.time, i), data: rec.payload(i) }));
      }
      await d.flush().catch(() => undefined);
      d.close();
      if (failed) return;
    }),
  );
  return out;
}

/** How loud each part goes into the MP4 (1 = as recorded). */
export interface Mp4Gains {
  game: number;
  voices: number;
}

/** Export options besides the volumes. */
export interface Mp4Options {
  /** The go-link icon over the picture (beats and moves between corners). */
  watermark?: boolean;
}

/**
 * A soft limiter: untouched below 0.9, then bent towards 1 so peaks never
 * clip (a hard cut crackles).
 */
export function limit(v: number): number {
  const a = Math.abs(v);
  if (a <= 0.9) return v;
  return Math.sign(v) * (0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1));
}

/**
 * Converts a recording. onProgress gets 0..1; signal cancels it.
 * Throws Mp4Unsupported when the browser cannot do it.
 */
export async function webmToMp4(
  rec: Recording,
  gains: Mp4Gains,
  onProgress: (f: number) => void,
  signal: AbortSignal,
  options: Mp4Options = {},
): Promise<Blob> {
  if (!canMakeMp4()) throw new Mp4Unsupported("no WebCodecs");
  const go = await loadGo();
  const { video, game, audios, frames, byTrack, endUs, hasVoices, payload } = rec;
  const videoFrames = byTrack.get(video.number) ?? [];

  const scale = Math.max(1, Math.min(4, Math.floor(TARGET_HEIGHT / video.height)));
  const W = (video.width * scale) & ~1;
  const H = (video.height * scale) & ~1;
  const [vcfg, acfg] = await Promise.all([pickVideo(W, H), pickAudio()]);

  const config = [
    { kind: "video", width: W, height: H, name: "Game" },
    { kind: "audio", rate: RATE, channels: 2, name: hasVoices ? "Game and voices" : "Game", default: true },
    ...(hasVoices
      ? [
          { kind: "audio", rate: RATE, channels: 2, name: "Game", default: false },
          { kind: "audio", rate: RATE, channels: 2, name: "Voices", default: false },
        ]
      : []),
  ];
  const id = check(go.create(JSON.stringify(config)));
  let failure: unknown = null;
  const fail = (e: unknown) => (failure ??= e);
  const aborted = () => {
    if (signal.aborted) throw new DOMException("cancelled", "AbortError");
    if (failure) throw failure;
  };

  try {
    // ---- Video: VP8 -> enlarged picture (crisp pixels) -> H.264.
    const canvas = new OffscreenCanvas(W, H);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Mp4Unsupported("no canvas");
    ctx.imageSmoothingEnabled = false;
    const mark = options.watermark ? await createWatermark(W, H, endUs) : null;
    let done = 0;
    let lastKey = -Infinity;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        const desc = meta?.decoderConfig?.description;
        if (desc) check(go.describe(id, 0, toBytes(desc)));
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        check(go.add(id, 0, chunk.timestamp, chunk.type === "key", data));
      },
      error: fail,
    });
    encoder.configure(vcfg);
    const decoder = new VideoDecoder({
      output: (frame) => {
        try {
          ctx.drawImage(frame, 0, 0, W, H);
          mark?.(ctx, frame.timestamp);
          const ts = frame.timestamp;
          const out = new VideoFrame(canvas, { timestamp: ts });
          const key = ts - lastKey >= 2_000_000; // a key frame every 2 s
          if (key) lastKey = ts;
          encoder.encode(out, { keyFrame: key });
          out.close();
        } catch (e) {
          fail(e);
        } finally {
          frame.close();
          done++;
          onProgress((0.85 * done) / Math.max(1, videoFrames.length));
        }
      },
      error: fail,
    });
    decoder.configure({ codec: "vp8", codedWidth: video.width, codedHeight: video.height });
    for (const i of videoFrames) {
      aborted();
      const data = payload(i);
      decoder.decode(
        new EncodedVideoChunk({ type: (at(data, 0) & 1) === 0 ? "key" : "delta", timestamp: at(frames.time, i), data }),
      );
      while (decoder.decodeQueueSize > 8 || encoder.encodeQueueSize > 8) {
        await sleep(2);
        aborted();
      }
    }
    await decoder.flush();
    await encoder.flush();
    decoder.close();
    encoder.close();
    aborted();

    // ---- Sound: Opus -> mixed PCM -> AAC, a few seconds at a time.
    const outputs = [new AudioEncoder({ output: sink(1), error: fail })];
    if (hasVoices) outputs.push(new AudioEncoder({ output: sink(2), error: fail }), new AudioEncoder({ output: sink(3), error: fail }));
    function sink(track: number) {
      return (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => {
        const desc = meta?.decoderConfig?.description;
        if (desc) check(go.describe(id, track, toBytes(desc)));
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        check(go.add(id, track, chunk.timestamp, true, data));
      };
    }
    for (const e of outputs) e.configure(acfg);

    // Mix buffers for one window plus a tail (a packet crossing the edge).
    const span = (WINDOW_S + 1) * RATE;
    const gameL = new Float32Array(span);
    const gameR = new Float32Array(span);
    const voice = new Float32Array(span);
    let winStartUs = 0;
    const put = (a: AudioData, into: "game" | "voice") => {
      const start = Math.round(((a.timestamp - winStartUs) * RATE) / 1e6);
      const n = a.numberOfFrames;
      const tmp = new Float32Array(n);
      for (let c = 0; c < Math.min(a.numberOfChannels, 2); c++) {
        a.copyTo(tmp, { planeIndex: c, format: "f32-planar" });
        const into2 = into === "voice" ? [voice] : a.numberOfChannels === 1 ? [gameL, gameR] : [c === 0 ? gameL : gameR];
        for (let k = 0; k < n; k++) {
          const p = start + k;
          if (p < 0 || p >= span) continue;
          const v = at(tmp, k);
          for (const buf of into2) buf[p] = at(buf, p) + v;
        }
      }
      a.close();
    };
    const decoders = audios.map((t) => {
      const d = new AudioDecoder({ output: (a) => put(a, t === game ? "game" : "voice"), error: fail });
      d.configure({
        codec: "opus",
        sampleRate: RATE,
        numberOfChannels: t.channels || 1,
        ...(t.codecPrivate.length ? { description: t.codecPrivate } : {}),
      });
      return { track: t, decoder: d, list: byTrack.get(t.number) ?? [], next: 0 };
    });

    const windows = Math.ceil(endUs / (WINDOW_S * 1e6));
    for (let w = 0; w < windows; w++) {
      aborted();
      winStartUs = w * WINDOW_S * 1e6;
      const winEndUs = winStartUs + WINDOW_S * 1e6;
      for (const d of decoders) {
        while (d.next < d.list.length && at(frames.time, at(d.list, d.next)) < winEndUs) {
          const i = at(d.list, d.next++);
          d.decoder.decode(new EncodedAudioChunk({ type: "key", timestamp: at(frames.time, i), data: payload(i) }));
        }
      }
      await Promise.all(decoders.map((d) => d.decoder.flush()));
      const n = Math.min(WINDOW_S * RATE, Math.ceil(((endUs - winStartUs) * RATE) / 1e6));
      if (n > 0) {
        const mix = new Float32Array(2 * n);
        const gameOnly = hasVoices ? new Float32Array(2 * n) : null;
        const only = hasVoices ? new Float32Array(2 * n) : null;
        for (let k = 0; k < n; k++) {
          const v = at(voice, k) * gains.voices;
          mix[k] = limit(at(gameL, k) * gains.game + v);
          mix[n + k] = limit(at(gameR, k) * gains.game + v);
          if (gameOnly) {
            gameOnly[k] = limit(at(gameL, k) * gains.game);
            gameOnly[n + k] = limit(at(gameR, k) * gains.game);
          }
          if (only) only[k] = only[n + k] = limit(v);
        }
        const pcm: Float32Array<ArrayBuffer>[] = gameOnly && only ? [mix, gameOnly, only] : [mix];
        pcm.forEach((data, j) =>
          outputs[j]?.encode(
            new AudioData({ format: "f32-planar", sampleRate: RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: winStartUs, data }),
          ),
        );
      }
      // Keep the tail for the next window.
      for (const buf of [gameL, gameR, voice]) {
        buf.copyWithin(0, WINDOW_S * RATE);
        buf.fill(0, span - WINDOW_S * RATE);
      }
      onProgress(0.85 + (0.15 * (w + 1)) / windows);
    }
    for (const d of decoders) d.decoder.close();
    await Promise.all(outputs.map((e) => e.flush()));
    for (const e of outputs) e.close();
    aborted();

    const mp4 = check(go.finish(id));
    return new Blob([mp4 as BlobPart], { type: "video/mp4" });
  } catch (e) {
    go.free(id);
    throw e;
  }
}
