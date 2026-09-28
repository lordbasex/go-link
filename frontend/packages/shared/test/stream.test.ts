// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import { afterEach, describe, expect, it, vi } from "vitest";
import { Button, HostStream, micMid, SignalClient, encodeInput, formatBytes, gamepadName, parseDeviceStatus, readGamepad, type Envelope } from "../src";

describe("encodeInput", () => {
  it("packs the 12-byte packet big endian", () => {
    const view = new DataView(encodeInput(0x0102, 1, { buttons: Button.Up | Button.B1 | Button.Capture, axes: [-127, 127, 0, 5] }));
    expect(view.byteLength).toBe(12);
    expect(view.getUint16(0)).toBe(0x0102);
    expect(view.getUint8(2)).toBe(1);
    expect(view.getUint32(4)).toBe(0x20011);
    expect([view.getInt8(8), view.getInt8(9), view.getInt8(10), view.getInt8(11)]).toEqual([-127, 127, 0, 5]);
  });
  it("wraps the sequence, clamps axes and drops undefined bits", () => {
    const view = new DataView(encodeInput(0x1ffff, 0, { buttons: 0xffffffff, axes: [-300, 300, 0.4, 0] }));
    expect(view.getUint16(0)).toBe(0xffff);
    expect(view.getUint32(4)).toBe(0x3fffff);
    expect(view.getInt8(8)).toBe(-127);
    expect(view.getInt8(9)).toBe(127);
  });
});

describe("readGamepad", () => {
  const pad = (pressed: number[], axes: number[] = [0, 0, 0, 0]) => ({
    id: "Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)",
    index: 0,
    connected: true,
    mapping: "standard",
    buttons: Array.from({ length: 18 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
    axes,
  });
  it("maps every standard button", () => {
    expect(readGamepad(pad([0, 1, 2, 3])).buttons).toBe(Button.B1 | Button.B2 | Button.B3 | Button.B4);
    expect(readGamepad(pad([6, 7, 8, 9, 16, 17])).buttons).toBe(Button.L2 | Button.R2 | Button.Coin | Button.Start | Button.Home | Button.Capture);
    expect(readGamepad(pad([12, 15])).buttons).toBe(Button.Up | Button.Right);
  });
  it("reads sticks with a deadzone and drives the directions", () => {
    const r = readGamepad(pad([], [-1, 0.1, 0, 0.6]));
    expect(r.axes).toEqual([-127, 0, 0, 76]);
    expect(r.buttons).toBe(Button.Left);
  });
  it("names the pad", () => {
    expect(gamepadName({ id: "Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)" })).toBe("Pro Controller");
  });
});

/** Minimal RTCPeerConnection double: records calls, fires handlers on demand. */
class FakePC {
  static last: FakePC;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  added: RTCIceCandidateInit[] = [];
  onicecandidate: ((ev: { candidate: { toJSON(): RTCIceCandidateInit } | null }) => void) | null = null;
  ontrack: ((ev: unknown) => void) | null = null;
  ondatachannel: ((ev: { channel: unknown }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  connectionState = "new";
  constructor(readonly config: RTCConfiguration) {
    FakePC.last = this;
  }
  async setRemoteDescription(d: RTCSessionDescriptionInit) {
    this.remoteDescription = d;
  }
  async addIceCandidate(c: RTCIceCandidateInit) {
    this.added.push(c);
  }
  async createAnswer() {
    return { type: "answer", sdp: "answer-sdp" };
  }
  async setLocalDescription() {}
  close() {}
}

function fakeClient() {
  const sent: Envelope[] = [];
  let listener: ((env: Envelope) => void) | null = null;
  const client = {
    iceServers: [{ urls: ["stun:stun.test:3478"] }],
    send: (env: Envelope) => {
      sent.push(env);
      return true;
    },
    onMessage: (fn: (env: Envelope) => void) => {
      listener = fn;
      return () => (listener = null);
    },
  } as unknown as SignalClient;
  return { client, sent, deliver: (env: Envelope) => listener?.(env) };
}

afterEach(() => vi.useRealTimers());

describe("HostStream", () => {
  it("answers the host's offer with the ICE servers from hello", async () => {
    const { client, sent, deliver } = fakeClient();
    const states: string[] = [];
    const s = new HostStream({ client, hostPeerId: "HOST", onState: (x) => states.push(x), RTCPeerConnectionImpl: FakePC as unknown as typeof RTCPeerConnection });
    s.start();

    // A candidate that arrives before the offer is queued.
    deliver({ type: "signal", from: "HOST", payload: { kind: "candidate", candidate: { candidate: "c1" } } });
    deliver({ type: "signal", from: "INTRUDER", payload: { kind: "offer", sdp: "evil" } });
    deliver({ type: "signal", from: "HOST", payload: { kind: "offer", sdp: "offer-sdp" } });
    await vi.waitFor(() => expect(sent).toHaveLength(1));

    expect(FakePC.last.config.iceServers).toEqual([{ urls: ["stun:stun.test:3478"] }]);
    expect(FakePC.last.remoteDescription).toEqual({ type: "offer", sdp: "offer-sdp" });
    expect(FakePC.last.added).toEqual([{ candidate: "c1" }]);
    expect(sent[0]).toEqual({ type: "signal", to: "HOST", payload: { kind: "answer", sdp: "answer-sdp" } });
    expect(states).toEqual(["connecting"]);

    FakePC.last.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: "mine" }) } });
    expect(sent[1]).toEqual({ type: "signal", to: "HOST", payload: { kind: "candidate", candidate: { candidate: "mine" } } });
    s.close();
  });

  it("asks for the room's PIN and sends it to the host only", () => {
    const { client, sent, deliver } = fakeClient();
    const events: unknown[] = [];
    const s = new HostStream({ client, hostPeerId: "HOST", onPin: (e) => events.push(e), RTCPeerConnectionImpl: FakePC as unknown as typeof RTCPeerConnection });
    s.start();
    deliver({ type: "signal", from: "INTRUDER", payload: { kind: "pin_required" } });
    deliver({ type: "signal", from: "HOST", payload: { kind: "pin_required" } });
    s.sendPin("123456");
    deliver({ type: "signal", from: "HOST", payload: { kind: "pin_result", ok: false, reason: "used", left: 4 } });
    const token = "a".repeat(43);
    s.sendToken(token);
    deliver({ type: "signal", from: "HOST", payload: { kind: "pin_result", ok: true, token } });
    expect(events).toEqual([
      { kind: "required" },
      { kind: "result", ok: false, token: "", reason: "used", left: 4, retryAfter: 0 },
      { kind: "result", ok: true, token, reason: "", left: 0, retryAfter: 0 },
    ]);
    expect(sent).toEqual([
      { type: "signal", to: "HOST", payload: { kind: "pin", pin: "123456" } },
      { type: "signal", to: "HOST", payload: { kind: "pin", token } },
    ]);
    s.close();
  });

  it("keeps a separate sequence per local player", async () => {
    const { client, deliver } = fakeClient();
    const s = new HostStream({ client, hostPeerId: "HOST", RTCPeerConnectionImpl: FakePC as unknown as typeof RTCPeerConnection });
    s.start();
    deliver({ type: "signal", from: "HOST", payload: { kind: "offer", sdp: "o" } });
    await vi.waitFor(() => expect(FakePC.last).toBeDefined());
    const packets: ArrayBuffer[] = [];
    FakePC.last.ondatachannel?.({ channel: { label: "input", readyState: "open", binaryType: "", send: (b: ArrayBuffer) => packets.push(b) } });
    s.setPad(0, { buttons: Button.B1, axes: [0, 0, 0, 0] });
    s.setPad(1, { buttons: Button.Start, axes: [0, 0, 0, 0] });
    const views = packets.map((p) => new DataView(p));
    expect(views.map((v) => [v.getUint8(2), v.getUint16(0)])).toEqual([
      [0, 1],
      [1, 1],
    ]);
    s.close();
  });

  it("sends input on change and repeats while held", async () => {
    vi.useFakeTimers();
    const { client, deliver } = fakeClient();
    const s = new HostStream({ client, hostPeerId: "HOST", RTCPeerConnectionImpl: FakePC as unknown as typeof RTCPeerConnection });
    s.start();
    deliver({ type: "signal", from: "HOST", payload: { kind: "offer", sdp: "o" } });
    await vi.waitFor(() => expect(FakePC.last).toBeDefined());
    const packets: ArrayBuffer[] = [];
    const channel = { label: "input", readyState: "open", binaryType: "", send: (b: ArrayBuffer) => packets.push(b) };
    FakePC.last.ondatachannel?.({ channel });

    s.setButtons(Button.Left);
    expect(packets).toHaveLength(1);
    vi.advanceTimersByTime(250);
    expect(packets.length).toBe(3); // repeated every 100 ms
    s.setButtons(0);
    vi.advanceTimersByTime(200);
    const last = new DataView(packets.at(-1)!);
    expect(last.getUint32(4)).toBe(0);
    const seqs = packets.map((p) => new DataView(p).getUint16(0));
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b)); // strictly increasing
    s.close();
  });
});

describe("control channel", () => {
  it("answers pings and forwards other messages", async () => {
    const { client, deliver } = fakeClient();
    const received: unknown[] = [];
    const s = new HostStream({ client, hostPeerId: "HOST", onControl: (m) => received.push(m), RTCPeerConnectionImpl: FakePC as unknown as typeof RTCPeerConnection });
    s.start();
    deliver({ type: "signal", from: "HOST", payload: { kind: "offer", sdp: "o" } });
    await vi.waitFor(() => expect(FakePC.last).toBeDefined());
    const sent: string[] = [];
    const channel: { label: string; readyState: string; send: (d: string) => void; onmessage: ((m: { data: string }) => void) | null } = {
      label: "control",
      readyState: "open",
      send: (d) => sent.push(d),
      onmessage: null,
    };
    FakePC.last.ondatachannel?.({ channel });
    channel.onmessage?.({ data: JSON.stringify({ type: "ping", id: 7 }) });
    channel.onmessage?.({ data: JSON.stringify({ type: "device_status", device_id: "D" }) });
    channel.onmessage?.({ data: "not json" });
    expect(sent).toEqual([JSON.stringify({ type: "pong", id: 7 })]);
    expect(received).toEqual([{ type: "device_status", device_id: "D" }]);
    s.close();
  });
});

describe("device status", () => {
  it("parses the device_status message", () => {
    const st = parseDeviceStatus({ type: "device_status", device_id: "D", version: "1", ice_urls: ["stun:x", 3], linked_browsers: 2, system: { hardware: { cores: 8 } } });
    expect(st).toMatchObject({ device_id: "D", version: "1", ice_urls: ["stun:x"], linked_browsers: 2, roms_dir: "" });
    expect(st?.system?.hardware.cores).toBe(8);
    expect(parseDeviceStatus({ type: "welcome" })).toBeNull();
    expect(parseDeviceStatus("x")).toBeNull();
  });
  it("formats bytes", () => {
    expect(formatBytes(1.5 * 1024 ** 3)).toBe("1.5 GB");
    expect(formatBytes(300 * 1024 ** 2)).toBe("300 MB");
    expect(formatBytes(0)).toBe("–");
  });
});

describe("early offers", () => {
  it("replays signals that arrived before start", async () => {
    const { client, sent } = fakeClient();
    const s = new HostStream({ client, hostPeerId: "HOST", RTCPeerConnectionImpl: FakePC as unknown as typeof RTCPeerConnection });
    s.start([
      { type: "signal", from: "OTHER", payload: { kind: "offer", sdp: "x" } },
      { type: "signal", from: "HOST", payload: { kind: "offer", sdp: "early-offer" } },
    ]);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(FakePC.last.remoteDescription).toEqual({ type: "offer", sdp: "early-offer" });
    s.close();
  });
});

describe("microphone line", () => {
  it("finds the recvonly audio m-line", () => {
    const sdp = ["v=0", "m=video 9 UDP/TLS/RTP/SAVPF 96", "a=mid:0", "a=sendonly", "m=audio 9 UDP/TLS/RTP/SAVPF 111", "a=mid:1", "a=sendonly", "m=audio 9 UDP/TLS/RTP/SAVPF 111", "a=mid:6", "a=recvonly", ""].join("\r\n");
    expect(micMid(sdp)).toBe("6");
    expect(micMid("v=0\r\nm=audio 9 X 111\r\na=mid:1\r\na=sendonly\r\n")).toBeNull();
  });

  it("routes voice tracks by stream id", async () => {
    const { client, deliver } = fakeClient();
    const voices: number[] = [];
    const games: string[] = [];
    const s = new HostStream({
      client,
      hostPeerId: "HOST",
      onTrack: (st) => games.push(st.id),
      onVoiceTrack: (port) => voices.push(port),
      RTCPeerConnectionImpl: FakePC as unknown as typeof RTCPeerConnection,
    });
    s.start();
    deliver({ type: "signal", from: "HOST", payload: { kind: "offer", sdp: "o" } });
    await vi.waitFor(() => expect(FakePC.last).toBeDefined());
    FakePC.last.ontrack?.({ streams: [{ id: "voice-p3" }], track: {} });
    FakePC.last.ontrack?.({ streams: [{ id: "go-link" }], track: {} });
    expect(voices).toEqual([3]);
    expect(games).toEqual(["go-link"]);
    s.close();
  });
});
