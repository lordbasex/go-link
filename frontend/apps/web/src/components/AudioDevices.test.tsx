// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { AudioDevicesBlock } from "./AudioDevices";
import { AUDIO_IN_KEY, AUDIO_OUT_KEY, useAudioDevices } from "../signal/useAudioDevices";
import { useMicrophone } from "../signal/useVoice";

type Info = { kind: MediaDeviceKind; deviceId: string; label: string };

/** A stand-in for navigator.mediaDevices whose device list the test changes. */
function fakeMediaDevices(initial: Info[]) {
  let list = initial;
  const listeners = new Set<() => void>();
  const md = {
    enumerateDevices: vi.fn(async () => list.map((d) => ({ ...d, groupId: "", toJSON: () => d }))),
    addEventListener: (type: string, fn: () => void) => type === "devicechange" && listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    getUserMedia: vi.fn(async (c: MediaStreamConstraints) => fakeStream(c)),
    /** Plugs or unplugs devices and tells the page, as the browser does. */
    change(next: Info[]) {
      list = next;
      listeners.forEach((fn) => fn());
    },
  };
  Object.defineProperty(navigator, "mediaDevices", { value: md, configurable: true });
  return md;
}

let streams = 0;
function fakeStream(c: MediaStreamConstraints) {
  const audio = c.audio as MediaTrackConstraints;
  const id = (audio.deviceId as { exact?: string } | undefined)?.exact ?? "";
  const track = { id: `track${++streams}`, device: id, enabled: true, stop: vi.fn() };
  return { id: `stream${streams}`, getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
}

const MIC = { kind: "audioinput", deviceId: "usb-mic", label: "USB Advanced Audio Device" } as const;
const MAC_MIC = { kind: "audioinput", deviceId: "mac-mic", label: "Mac microphone" } as const;
const PHONES = { kind: "audiooutput", deviceId: "usb-phones", label: "USB headphones" } as const;
const PODS = { kind: "audiooutput", deviceId: "pods", label: "AirPods" } as const;
const DEFAULTS: Info[] = [
  { kind: "audioinput", deviceId: "default", label: "Default - Mac microphone" },
  MAC_MIC,
  MIC,
  { kind: "audiooutput", deviceId: "default", label: "Default - Speakers" },
  PHONES,
  PODS,
];

function Harness({ showMic = true }: { showMic?: boolean }) {
  const devices = useAudioDevices();
  return (
    <>
      <AudioDevicesBlock devices={devices} showMic={showMic} micLevel={null} />
      {devices.notice && <p role="status">{devices.notice.kind}:{devices.notice.name}</p>}
      <span data-testid="ids">{`${devices.micId}|${devices.outId}`}</span>
    </>
  );
}

const sinkDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "setSinkId");
function withSinkSupport(on: boolean) {
  if (on) Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", { value: vi.fn(async () => undefined), configurable: true });
  else delete (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId;
}

afterEach(cleanup);

describe("room sound devices", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    if (sinkDescriptor) Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", sinkDescriptor);
    else delete (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId;
  });

  it("lists the microphones and outputs, without the browser's default aliases", async () => {
    withSinkSupport(true);
    fakeMediaDevices(DEFAULTS);
    render(<Harness />);
    const mic = await screen.findByRole("combobox", { name: "Microphone" });
    await waitFor(() => expect(mic.querySelectorAll("option")).toHaveLength(3));
    expect([...mic.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["System default", "Mac microphone", "USB Advanced Audio Device"]);
    const out = screen.getByRole("combobox", { name: "Output" });
    expect([...out.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["System default", "USB headphones", "AirPods"]);
    expect(screen.getByRole("button", { name: "Test" })).toBeInTheDocument();
  });

  it("numbers the devices and explains why while the microphone is not allowed", async () => {
    withSinkSupport(true);
    fakeMediaDevices([
      { kind: "audioinput", deviceId: "a", label: "" },
      { kind: "audioinput", deviceId: "b", label: "" },
    ]);
    render(<Harness />);
    await screen.findByText("Microphone 2");
    expect(screen.getByText("Microphone 1")).toBeInTheDocument();
    expect(screen.getByText(/names appear after you allow the microphone/)).toBeInTheDocument();
  });

  it("shows the iPhone note instead of an output list where the browser cannot choose", async () => {
    withSinkSupport(false);
    const ua = vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    fakeMediaDevices(DEFAULTS);
    render(<Harness />);
    await screen.findByRole("combobox", { name: "Microphone" });
    expect(screen.queryByRole("combobox", { name: "Output" })).not.toBeInTheDocument();
    expect(screen.getByText(/open Control Center, press and hold the audio card/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test sound" })).toBeInTheDocument();
    ua.mockRestore();
  });

  it("remembers the choices in this browser", async () => {
    withSinkSupport(true);
    fakeMediaDevices(DEFAULTS);
    const { unmount } = render(<Harness />);
    const mic = await screen.findByRole("combobox", { name: "Microphone" });
    await waitFor(() => expect(mic.querySelectorAll("option")).toHaveLength(3));
    await userEvent.selectOptions(mic, "usb-mic");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Output" }), "pods");
    expect(JSON.parse(localStorage.getItem(AUDIO_IN_KEY)!)).toEqual({ id: "usb-mic", label: "USB Advanced Audio Device" });
    expect(JSON.parse(localStorage.getItem(AUDIO_OUT_KEY)!)).toEqual({ id: "pods", label: "AirPods" });
    unmount();
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("usb-mic|pods"));
    expect(screen.getByRole("combobox", { name: "Output" })).toHaveValue("pods");
  });

  it("goes back to the default and says so when the chosen device disconnects", async () => {
    withSinkSupport(true);
    localStorage.setItem(AUDIO_OUT_KEY, JSON.stringify({ id: "pods", label: "AirPods" }));
    localStorage.setItem(AUDIO_IN_KEY, JSON.stringify({ id: "usb-mic", label: "USB Advanced Audio Device" }));
    const md = fakeMediaDevices(DEFAULTS);
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("usb-mic|pods"));
    await act(async () => md.change(DEFAULTS.filter((d) => d !== PODS)));
    expect(await screen.findByRole("status")).toHaveTextContent("out:AirPods");
    expect(screen.getByTestId("ids")).toHaveTextContent("usb-mic|");
    expect(localStorage.getItem(AUDIO_OUT_KEY)).toBeNull();
    await act(async () => md.change(DEFAULTS.filter((d) => d !== PODS && d !== MIC)));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("in:USB Advanced Audio Device"));
    expect(screen.getByTestId("ids")).toHaveTextContent("|");
  });

  it("keeps a remembered device that is only unplugged when the room opens", async () => {
    withSinkSupport(true);
    localStorage.setItem(AUDIO_OUT_KEY, JSON.stringify({ id: "gone", label: "Old speakers" }));
    fakeMediaDevices(DEFAULTS);
    render(<Harness />);
    await screen.findByText("AirPods");
    expect(screen.getByTestId("ids")).toHaveTextContent("|");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(localStorage.getItem(AUDIO_OUT_KEY)).not.toBeNull();
  });
});

describe("microphone switch", () => {
  it("opens the chosen microphone and swaps its track into the sender", async () => {
    const md = fakeMediaDevices(DEFAULTS);
    const sender = { replaceTrack: vi.fn(async (_track: unknown) => undefined) };
    function Mic({ id }: { id: string }) {
      const mic = useMicrophone(true, true, id);
      const track = mic.stream?.getAudioTracks()[0] ?? null;
      // What the room page does with the stream's track.
      useEffect(() => void sender.replaceTrack(track), [track]);
      return null;
    }
    const { rerender } = render(<Mic id="" />);
    await waitFor(() => expect(md.getUserMedia).toHaveBeenCalledTimes(1));
    const first = (await md.getUserMedia.mock.results[0]!.value) as MediaStream;
    await waitFor(() => expect(sender.replaceTrack).toHaveBeenLastCalledWith(first.getAudioTracks()[0]));

    rerender(<Mic id="usb-mic" />);
    await waitFor(() => expect(md.getUserMedia).toHaveBeenCalledTimes(2));
    expect((md.getUserMedia.mock.calls[1]![0].audio as MediaTrackConstraints).deviceId).toEqual({ exact: "usb-mic" });
    await waitFor(() =>
      expect(sender.replaceTrack).toHaveBeenLastCalledWith(expect.objectContaining({ device: "usb-mic" })),
    );
    // The previous microphone is released.
    await waitFor(() => expect(first.getAudioTracks()[0]!.stop).toHaveBeenCalled());
  });

  it("falls back to the default microphone when the chosen one cannot open", async () => {
    const md = fakeMediaDevices(DEFAULTS);
    md.getUserMedia.mockImplementationOnce(async () => {
      throw new DOMException("no device", "OverconstrainedError");
    });
    let state = "";
    function Mic() {
      state = useMicrophone(true, false, "unplugged").state;
      return null;
    }
    render(<Mic />);
    await waitFor(() => expect(state).toBe("on"));
    expect((md.getUserMedia.mock.calls[1]![0].audio as MediaTrackConstraints).deviceId).toBeUndefined();
  });
});
