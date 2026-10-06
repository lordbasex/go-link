// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { newProject, type Project } from "../model";
import { LangProvider } from "../i18n";
import type { Rgba } from "./detect";

// a sheet with two figures on magenta, 12 x 48 each (outline, head, dark shirt, jeans)
function testSheet(): Rgba {
  const w = 60;
  const h = 60;
  const data = new Uint8ClampedArray(w * h * 4);
  const set = (x: number, y: number, c: number[]) => data.set([...c, 255], (y * w + x) * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, [255, 0, 255]);
  for (const x0 of [4, 24])
    for (let y = 5; y < 53; y++)
      for (let x = x0; x < x0 + 12; x++) {
        const edge = x === x0 || x === x0 + 11 || y === 5 || y === 52;
        set(x, y, edge ? [0, 0, 0] : y < 21 ? [238, 170, 119] : y < 37 ? [20, 20, 30] : [34, 68, 136]);
      }
  return { w, h, data };
}

const putAsset = vi.fn(async (bytes: Uint8Array) => `sha256:${String(bytes.length).padStart(64, "0")}` as const);

vi.mock("./image", () => ({
  decodeImage: vi.fn(async () => testSheet()),
  encodePng: vi.fn(async () => new Uint8Array([1, 2, 3])),
  paint: vi.fn(),
}));

vi.mock("../io/assets", () => ({
  putAsset: (bytes: Uint8Array) => putAsset(bytes),
  getAsset: vi.fn(async () => ({ ref: "sha256:x", type: "image/png", bytes: new Uint8Array([9]) })),
  assetsPersistent: vi.fn(async () => true),
  sniffType: () => "image/png",
}));

const { CharactersScreen } = await import("./index");

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  URL.createObjectURL = vi.fn(() => "blob:sheet");
  URL.revokeObjectURL = vi.fn();
  putAsset.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup(project = newProject({ title: "Test" }), lang: "en" | "es" | "pt" = "en") {
  const onChange = vi.fn<(p: Project) => void>();
  const view = render(
    <LangProvider value={lang}>
      <CharactersScreen project={project} onChange={onChange} />
    </LangProvider>,
  );
  return { onChange, view };
}

async function drop() {
  const input = screen.getByLabelText("Choose a picture", { selector: "input" });
  const file = new File([new Uint8Array([137, 80, 78, 71])], "01_willy.png", { type: "image/png" });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
  await screen.findByText("Found 2 frames in your sheet");
}

describe("CharactersScreen", () => {
  it("deletes an animation, shows a built-in one again, and takes a known name in any language as that animation", async () => {
    setup();
    await drop();
    const yawn = () => screen.queryByRole("button", { name: /^Yawnyawn/ });
    fireEvent.click(yawn()!);
    fireEvent.click(screen.getByRole("button", { name: "Delete animation" }));
    expect(yawn()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show Yawn again" }));
    expect(yawn()).not.toBeNull();
    // "Run" typed as a new one is the existing run, not a copy of it
    fireEvent.change(screen.getByRole("textbox", { name: "New animation" }), { target: { value: "Run" } });
    fireEvent.click(screen.getByRole("button", { name: /^\+ Add$/ }));
    expect(screen.getByText("That one already exists: Run (run).")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Run/ })).toHaveLength(1);
  });

  it("starts with the drop zone", () => {
    setup();
    expect(screen.getByText("Drop a sprite sheet here")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save character" })).toBeDisabled();
  });

  it("adds another picture under the sheet: its frames join, the animations stay", async () => {
    setup();
    await drop();
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: /Add the selected frames/ }));
    expect(screen.getByRole("button", { name: /^Standingidle\s*2 of 4/ })).toBeInTheDocument();
    const more = new File([new Uint8Array([137, 80, 78, 71])], "walk.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Add another picture", { selector: "input" }), { target: { files: [more] } });
    });
    await screen.findByText("Found 4 frames in your sheet");
    expect(screen.getByText(/Added 2 frames from walk.png/)).toBeInTheDocument();
    // idle keeps its frames; the new ones are left for the next animations
    expect(screen.getByRole("button", { name: /^Standingidle\s*2 of 4/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Frame 3" })).toBeInTheDocument();
  });

  it("detects frames, assigns them to idle and saves the character", async () => {
    const { onChange } = setup();
    await drop();
    expect(screen.getByText(/Magenta background removed/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("willy");
    // select both boxes and add them to idle (the active animation)
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: /Add the selected frames/ }));
    expect(screen.getByRole("button", { name: "Frame 1 · Standing 1" })).toBeInTheDocument();
    // the animation shows a plain name and, under it, the name the game uses
    expect(screen.getByRole("button", { name: /^Standingidle\s*2 of 4/ })).toBeInTheDocument();
    // palette zones: 48 px tall at 44 px -> head, torso, legs
    await screen.findByText("Head");
    expect(screen.getByText("Torso")).toBeInTheDocument();
    expect(screen.getByText("Legs")).toBeInTheDocument();
    expect(screen.getByText(/44 px tall · 19.6 % of the screen/)).toBeInTheDocument();
    expect(screen.getByText(/Shrunk from 48 px/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Willy" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save character" }));
    });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const p = onChange.mock.calls[0]![0];
    expect(p.characters).toHaveLength(1);
    const ch = p.characters[0]!;
    expect(ch).toMatchObject({ id: "willy", name: "Willy", role: "hero", height: 44 });
    expect(ch.anims.idle).toEqual({ frames: ["f1", "f2"], fps: 6, loop: true });
    expect(ch.frames[0]!.zones).toEqual(["pal-willy-head", "pal-willy-torso", "pal-willy-legs"]);
    expect(p.palettes.filter((x) => x.id.startsWith("pal-willy-"))).toHaveLength(3);
    // the source sheet and the 1:1 atlas both went to storage
    expect(putAsset).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("edits a frame's pixels by hand, keeps them with the character and marks the frame", async () => {
    const { onChange } = setup();
    await drop();
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: /Add the selected frames/ }));
    await screen.findByText("Head");
    fireEvent.click(screen.getByRole("button", { name: "Edit frame 1" }));
    const dialog = screen.getByRole("dialog", { name: "Edit frames · Standing" });
    // the frame at its size on the board: 44 px tall
    expect(dialog).toHaveTextContent(/\d+ × 44 px/);
    fireEvent.click(screen.getByRole("button", { name: "Flip left to right" }));
    fireEvent.click(screen.getByRole("button", { name: "Use these frames" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("1 · edited")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save character" }));
    });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    // the source sheet, the atlas and the edited frame's own pixels
    expect(putAsset).toHaveBeenCalledTimes(3);
    const ch = onChange.mock.calls[0]![0].characters[0] as unknown as { source: { frames: { id: string; edit?: { ref: string; w: number; h: number; px: number; py: number } }[] } };
    const f1 = ch.source.frames.find((f) => f.id === "f1")!;
    expect(f1.edit).toMatchObject({ ref: expect.stringMatching(/^sha256:/), h: 44 });
    expect(ch.source.frames.find((f) => f.id === "f2")!.edit).toBeUndefined();
  });

  it("draws a character from scratch: no sheet, its frames drawn in the editor and kept with it", async () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "✎ Draw from scratch" }));
    expect(screen.getByRole("dialog", { name: "Edit frames · Standing" })).toHaveTextContent(/Frame 1 of 1 · 33 × 44 px/);
    // two frames: the blank one and a copy, a little different
    fireEvent.click(screen.getByRole("button", { name: "Duplicate this frame" }));
    fireEvent.click(screen.getByRole("button", { name: "Flip left to right" }));
    fireEvent.click(screen.getByRole("button", { name: "Use these frames" }));
    expect(screen.getByRole("button", { name: /^Standingidle\s*2 of 4/ })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Pixel" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save character" }));
    });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const ch = onChange.mock.calls[0]![0].characters[0] as unknown as { id: string; anims: Record<string, { frames: string[] }>; source: { sheet: string | null; frames: { id: string; drawn?: boolean; edit?: unknown }[] } };
    expect(ch.id).toBe("pixel");
    expect(ch.anims.idle!.frames).toEqual(["f1", "f2"]);
    expect(ch.source.sheet).toBeNull();
    // one layer only, no shirt: no layers kept, the picture is enough
    expect((ch.source.frames[0] as { edit?: { layers?: unknown } }).edit?.layers).toBeUndefined();
    expect(ch.source.frames).toMatchObject([
      { id: "f1", drawn: true, w: 33, h: 44, edit: { ref: expect.stringMatching(/^sha256:/) } },
      { id: "f2", drawn: true, edit: { ref: expect.stringMatching(/^sha256:/) } },
    ]);
  });

  it("keeps a frame's layers with the character and gives a shirt layer's colors to the recolored ones", async () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "✎ Draw from scratch" }));
    fireEvent.click(screen.getByRole("button", { name: "New layer (above this one)" }));
    // a color of the board on the new layer, by the color picker, then a dot
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "#ee3311" } });
    const c = screen.getByRole("img", { name: "Frame 1 of 1" }) as HTMLCanvasElement;
    c.getBoundingClientRect = () => ({ left: 0, top: 0, width: 33, height: 44, right: 33, bottom: 44, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(c, { clientX: 10.5, clientY: 20.5, button: 0, pointerId: 1 });
    fireEvent.pointerUp(c, { clientX: 10.5, clientY: 20.5, button: 0, pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Shirt: Layer 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Use these frames" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Shirt" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save character" }));
    });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const ch = onChange.mock.calls[0]![0].characters[0] as unknown as { swapColors: string[]; source: { frames: { edit?: { layers?: { name: string; ref: string; shirt?: boolean }[] } }[] } };
    expect(ch.source.frames[0]!.edit!.layers).toMatchObject([
      { name: "Base", ref: expect.stringMatching(/^sha256:/) },
      { name: "Layer 2", ref: expect.stringMatching(/^sha256:/), shirt: true },
    ]);
    expect(ch.swapColors).toEqual(["#EE3311"]);
  });

  it("keeps a vector layer's shapes with the character", async () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "✎ Draw from scratch" }));
    fireEvent.click(screen.getByRole("button", { name: "New vector layer (shapes)" }));
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "#ee3311" } });
    fireEvent.click(screen.getByRole("button", { name: "Ellipse (O)" }));
    const c = screen.getByRole("img", { name: "Frame 1 of 1" }) as HTMLCanvasElement;
    c.getBoundingClientRect = () => ({ left: 0, top: 0, width: 33, height: 44, right: 33, bottom: 44, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(c, { clientX: 8.5, clientY: 4.5, button: 0, pointerId: 1 });
    fireEvent.pointerMove(c, { clientX: 24.5, clientY: 18.5, button: 0, pointerId: 1 });
    fireEvent.pointerUp(c, { clientX: 24.5, clientY: 18.5, button: 0, pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Use these frames" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Ball" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save character" }));
    });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const ch = onChange.mock.calls[0]![0].characters[0] as unknown as { source: { frames: { edit?: { layers?: { name: string; shapes?: unknown[] }[] } }[] } };
    expect(ch.source.frames[0]!.edit!.layers![1]).toMatchObject({ name: "Vector 2", shapes: [{ kind: "ellipse", points: [[8, 4], [24, 18]], fill: "#ee3311", stroke: "#000000", width: 1 }] });
  });

  it("edits boxes: delete with the keyboard, add one, move the pivot", async () => {
    setup();
    await drop();
    const box = screen.getByRole("button", { name: "Frame 2" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(box).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(box, { key: "Delete" });
    expect(screen.getByText("Found 1 frames in your sheet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add a box/ }));
    expect(screen.getByText("Found 2 frames in your sheet")).toBeInTheDocument();
    const pivot = screen.getByRole("spinbutton", { name: "Pivot X" });
    fireEvent.change(pivot, { target: { value: "3" } });
    expect(pivot).toHaveValue(3);
  });

  it("switches to a fixed grid", async () => {
    setup();
    await drop();
    fireEvent.click(screen.getByRole("button", { name: /Fixed grid/ }));
    // 48 x 48 cells over a 60 x 60 sheet: both figures sit in the left column of cells
    expect(screen.getByText("Found 2 frames in your sheet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Frame 1" })).toBeInTheDocument();
    // 20 px wide cells: each figure in its own column, cut by the row at 48
    fireEvent.change(screen.getByRole("spinbutton", { name: "Cell width" }), { target: { value: "20" } });
    expect(screen.getByText("Found 4 frames in your sheet")).toBeInTheDocument();
  });

  it("opens the character the review's Go points at", () => {
    const project = newProject({ title: "Test" });
    project.characters.push({ id: "willy", name: "Willy", role: "hero", height: 44, sheet: null, frames: [], anims: {}, swapColors: [] });
    const onChange = vi.fn<(p: Project) => void>();
    render(
      <LangProvider value="en">
        <CharactersScreen project={project} onChange={onChange} characterId="willy" />
      </LangProvider>,
    );
    expect(screen.getByText("Character · Willy")).toBeInTheDocument();
  });

  it("explains in the user's language why a picture cannot be used", async () => {
    setup(undefined, "es");
    // a PNG header that says 1 × 1 pixels
    const head = new Uint8Array(33);
    head.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1]);
    const input = screen.getByLabelText("Elegir una imagen", { selector: "input" });
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File([head], "tiny.png", { type: "image/png" })] } });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo usar esa imagen: es demasiado pequeña (1 × 1 px) para un personaje.");
    expect(putAsset).not.toHaveBeenCalled();
  });

  it("speaks Spanish", async () => {
    setup(undefined, "es");
    expect(screen.getByText("Suelta aquí una hoja de sprites")).toBeInTheDocument();
  });
});
