// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import { backingSize, fitRect, frameInset } from "./layout";
import { compileAll, createContext, parseColor, workingSize } from "./renderer";
import { refreshRateOf } from "./refreshRate";
import {
  BANDS_KEY,
  SITE_DEFAULT,
  STYLE_KEY,
  clearPictureSettings,
  needsRenderer,
  readPictureSettings,
  resolvePicture,
  usePictureSettings,
  writePictureSettings,
  type PictureSettings,
} from "./settings";
import { PictureControl } from "../components/PictureControl";
import { RoomPictureDialog } from "../components/RoomPictureDialog";
import { PictureCanvas } from "./PictureCanvas";
import { labSource } from "../pages/PictureLabPage";
import { SplitDivider } from "./SplitDivider";

describe("picture layout", () => {
  it("fits the picture inside the area without cropping, at its aspect", () => {
    // Many stage sizes (wide, tall, phones, 4K) and game aspects.
    const sizes = [
      [1920, 1080], [3840, 2160], [390, 844], [844, 390], [1200, 900], [333, 777], [2560, 1080], [1, 1],
    ] as const;
    const aspects = [4 / 3, 3 / 4, 16 / 9, 384 / 224, 1, 2.5];
    for (const [w, h] of sizes)
      for (const a of aspects)
        for (const inset of [0, 12]) {
          const r = fitRect(w, h, a, inset);
          const eps = 1e-6;
          expect(r.x).toBeGreaterThanOrEqual(-eps);
          expect(r.y).toBeGreaterThanOrEqual(-eps);
          expect(r.x + r.w).toBeLessThanOrEqual(w + eps);
          expect(r.y + r.h).toBeLessThanOrEqual(h + eps);
          if (r.w > 0) {
            expect(r.w / r.h).toBeCloseTo(a, 6);
            // As large as possible: it touches the sides or the top and bottom.
            const aw = w - 2 * inset;
            const ah = h - 2 * inset;
            expect(Math.abs(r.w - aw) < 1e-6 || Math.abs(r.h - ah) < 1e-6).toBe(true);
            // Centered.
            expect(r.x + r.w / 2).toBeCloseTo(w / 2, 6);
            expect(r.y + r.h / 2).toBeCloseTo(h / 2, 6);
          }
        }
  });

  it("puts side bands on a wide screen and bands above and below on a tall one", () => {
    const wide = fitRect(1920, 1080, 4 / 3);
    expect(wide).toEqual({ x: 240, y: 0, w: 1440, h: 1080 });
    const tall = fitRect(390, 844, 4 / 3);
    expect(tall.x).toBe(0);
    expect(tall.w).toBe(390);
    expect(tall.h).toBeCloseTo(292.5);
  });

  it("returns an empty rectangle for an empty area or a broken aspect", () => {
    expect(fitRect(0, 100, 4 / 3).w).toBe(0);
    expect(fitRect(100, 100, 0).w).toBe(0);
    expect(fitRect(100, 100, Number.NaN).w).toBe(0);
  });

  it("keeps the frame's bezel thin, scaled by the pixel ratio", () => {
    expect(frameInset(1920, 1080, 1)).toBe(36);
    expect(frameInset(390, 292, 3)).toBe(24);
    expect(frameInset(300, 200, 1)).toBe(8);
  });

  it("sizes the canvas in device pixels, never beyond a 4K screen", () => {
    expect(backingSize(390, 292, 3)).toEqual({ w: 1170, h: 876, scale: 3 });
    const big = backingSize(3840, 2160, 2);
    expect(big.w * big.h).toBeLessThanOrEqual(3840 * 2160 + 3840 + 2160);
    expect(big.scale).toBeCloseTo(1);
  });
});

describe("picture settings", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to smooth with ambient sides; only smooth on black needs no renderer", () => {
    const s = readPictureSettings();
    expect(s).toEqual({ style: "smooth", bands: "ambient" });
    expect(s).toEqual(SITE_DEFAULT);
    expect(needsRenderer(s)).toBe(true);
    expect(needsRenderer({ style: "smooth", bands: "black" })).toBe(false);
    expect(needsRenderer({ style: "sharp", bands: "black" })).toBe(true);
    expect(needsRenderer({ style: "smooth", bands: "ambient" })).toBe(true);
  });

  it("remembers the choice in localStorage and ignores unknown values", () => {
    writePictureSettings({ style: "crt", bands: "frame" });
    expect(localStorage.getItem(STYLE_KEY)).toBe("crt");
    expect(localStorage.getItem(BANDS_KEY)).toBe("frame");
    expect(readPictureSettings()).toEqual({ style: "crt", bands: "frame" });
    localStorage.setItem(STYLE_KEY, "vaporwave");
    localStorage.setItem(BANDS_KEY, "<script>");
    expect(readPictureSettings()).toEqual({ style: "smooth", bands: "ambient" });
  });

  it("tells every mounted user of the settings at once (no reload)", () => {
    const a = renderHook(() => usePictureSettings());
    const b = renderHook(() => usePictureSettings());
    act(() => a.result.current[1]({ style: "sharp" }));
    expect(b.result.current[0]).toEqual({ style: "sharp", bands: "ambient" });
    act(() => b.result.current[1]({ bands: "frame" }));
    expect(a.result.current[0]).toEqual({ style: "sharp", bands: "frame" });
  });

  it("works without storage", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readPictureSettings()).toEqual({ style: "smooth", bands: "ambient" });
    expect(() => clearPictureSettings()).not.toThrow();
    expect(() => writePictureSettings({ style: "sharp", bands: "black" })).not.toThrow();
    get.mockRestore();
    set.mockRestore();
  });
});

describe("room default picture", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);
  const crt: PictureSettings = { style: "crt", bands: "black" };

  it("puts the viewer first, then the room, then the site", () => {
    expect(resolvePicture({}, null)).toEqual(SITE_DEFAULT);
    expect(resolvePicture({}, crt)).toEqual(crt);
    expect(resolvePicture({ style: "sharp" }, crt)).toEqual({ style: "sharp", bands: "black" });
    expect(resolvePicture({ style: "sharp", bands: "frame" }, crt)).toEqual({ style: "sharp", bands: "frame" });
    expect(resolvePicture({ style: "sharp" }, null)).toEqual({ style: "sharp", bands: "ambient" });
  });

  it("follows the room's default until the viewer chooses, and again after Use the room's default", () => {
    const { result, rerender } = renderHook(({ room }) => usePictureSettings(room), {
      initialProps: { room: null as PictureSettings | null },
    });
    expect(result.current[0]).toEqual(SITE_DEFAULT);
    expect(result.current[2].saved).toBe(false);
    // room_state arrives with the host's default.
    rerender({ room: crt });
    expect(result.current[0]).toEqual(crt);
    // The viewer picks Sharp: only the style changes, and it sticks.
    act(() => result.current[1]({ style: "sharp" }));
    expect(result.current[0]).toEqual({ style: "sharp", bands: "black" });
    expect(result.current[2].saved).toBe(true);
    rerender({ room: { style: "edges", bands: "frame" } });
    expect(result.current[0]).toEqual({ style: "sharp", bands: "black" });
    act(() => result.current[2].reset());
    expect(result.current[2].saved).toBe(false);
    expect(result.current[0]).toEqual({ style: "edges", bands: "frame" });
    expect(localStorage.getItem(STYLE_KEY)).toBeNull();
  });

  it("shows the room's default and offers to go back to it", () => {
    const onReset = vi.fn();
    render(
      <PictureControl
        open
        setOpen={() => {}}
        settings={{ style: "sharp", bands: "black" }}
        onChange={() => {}}
        compare={false}
        onCompare={() => {}}
        available
        roomDefault={crt}
        saved
        onReset={onReset}
      />,
    );
    expect(screen.getByText("Room default: CRT arcade · Black")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use the room's default" }));
    expect(onReset).toHaveBeenCalled();
    // Guests are never offered to change the room.
    expect(screen.queryByRole("button", { name: "Set as the room's default" })).toBeNull();
  });

  it("lets the owner make the current picture the room's default", () => {
    const onSet = vi.fn();
    const { rerender } = render(
      <PictureControl
        open
        setOpen={() => {}}
        settings={crt}
        onChange={() => {}}
        compare={false}
        onCompare={() => {}}
        available
        roomDefault={null}
        onSetRoomDefault={onSet}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Set as the room's default" }));
    expect(onSet).toHaveBeenCalledTimes(1);
    rerender(
      <PictureControl
        open
        setOpen={() => {}}
        settings={crt}
        onChange={() => {}}
        compare={false}
        onCompare={() => {}}
        available
        roomDefault={crt}
        onSetRoomDefault={onSet}
      />,
    );
    expect(screen.getByText("This is the room's default.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use the room's default" })).toBeNull();
  });

  it("sends room_action picture from the room's picture default dialog", () => {
    const send = vi.fn();
    const onClose = vi.fn();
    render(<RoomPictureDialog id="test" name="Test pattern" current={{ style: "crt", bands: "frame" }} send={send} onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Picture default for “Test pattern”" })).toBeInTheDocument();
    expect(screen.getByText("Now: CRT arcade · Frame")).toBeInTheDocument();
    // Unchanged: nothing to save.
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Use the default" }));
    expect(send).toHaveBeenCalledWith({ type: "room_action", id: "test", action: "picture", style: "", bands: "" });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("renderer fallback", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reports no renderer when the browser has no WebGL", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const onRenderer = vi.fn();
    function Harness() {
      const video = useRef<HTMLVideoElement>(null);
      return (
        <>
          <video ref={video} />
          <PictureCanvas source={video} aspect={4 / 3} style="sharp" bands="black" onRenderer={onRenderer} />
        </>
      );
    }
    render(<Harness />);
    expect(onRenderer).toHaveBeenCalledWith(null);
  });

  it("returns no context instead of throwing", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      throw new Error("GPU process crashed");
    });
    expect(createContext(document.createElement("canvas"))).toBeNull();
  });

  // Headless test runs have no GPU; the real compile runs in the browser
  // end-to-end test (e2e/tests/picture.spec.ts).
  const gl = (() => {
    try {
      const c = document.createElement("canvas");
      return (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    } catch {
      return null;
    }
  })();
  it.skipIf(!gl)("compiles every shader", () => {
    expect(() => compileAll(gl!)).not.toThrow();
  });
});

describe("picture helpers", () => {
  it("reads token colors", () => {
    expect(parseColor("#ff8000", [0, 0, 0])).toEqual([1, 128 / 255, 0]);
    expect(parseColor(" rgb(255 0 0) ", [0, 0, 0])).toEqual([1, 0, 0]);
    expect(parseColor("", [0.1, 0.2, 0.3])).toEqual([0.1, 0.2, 0.3]);
  });

  it("measures the screen's refresh rate from frame intervals", () => {
    expect(refreshRateOf(Array(60).fill(16.67))).toBe(60);
    expect(refreshRateOf(Array(60).fill(8.33))).toBe(120);
    expect(refreshRateOf([...Array(58).fill(6.94), 50, 400])).toBe(144);
    expect(refreshRateOf(Array(60).fill(12.2))).toBe(82);
    expect(refreshRateOf([16])).toBeNull();
  });

  it("lets the lab load same-origin paths only", () => {
    const origin = "http://localhost:5180";
    expect(labSource("/lab/frame.png", origin)).toBe("/lab/frame.png");
    expect(labSource("testcard", origin)).toBeNull();
    expect(labSource("//evil.test/x.png", origin)).toBeNull();
    expect(labSource("https://evil.test/x.png", origin)).toBeNull();
    expect(labSource("javascript:alert(1)", origin)).toBeNull();
    expect(labSource(null, origin)).toBeNull();
  });

  it("moves the comparison line with the keyboard", () => {
    const onChange = vi.fn();
    render(
      <div>
        <SplitDivider value={0.5} onChange={onChange} after="Sharp" />
      </div>,
    );
    const slider = screen.getByRole("slider", { name: "Comparison divider" });
    expect(slider).toHaveAttribute("aria-valuenow", "50");
    act(() => {
      slider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith(0.52);
    act(() => {
      slider.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith(0.02);
  });
});

describe("a 2x stream", () => {
  it("works on the game's own pixels only when the frames are exactly 2x of it", () => {
    expect(workingSize(768, 448, { w: 384, h: 224 })).toEqual({ w: 384, h: 224, down: true });
    // A room switching quality: frames of the other size are drawn as they are.
    expect(workingSize(384, 224, { w: 384, h: 224 })).toEqual({ w: 384, h: 224, down: false });
    expect(workingSize(768, 448, null)).toEqual({ w: 768, h: 448, down: false });
    expect(workingSize(768, 448, undefined)).toEqual({ w: 768, h: 448, down: false });
    expect(workingSize(770, 448, { w: 384, h: 224 }).down).toBe(false);
    expect(workingSize(0, 0, { w: 0, h: 0 }).down).toBe(false);
  });
});
