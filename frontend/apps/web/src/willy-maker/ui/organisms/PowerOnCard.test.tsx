// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { POWER_ON_TEXT, STEP_IDS, type PowerOnResult, type PowerOnStep } from "@go-link/cps1-sim";
import { LangProvider, type Lang } from "../../i18n";
import { exportEn } from "../../i18n/export.en";
import { exportEs } from "../../i18n/export.es";
import { exportPt } from "../../i18n/export.pt";
import { DeviceProvider, type MakerDevice } from "../device";
import { PowerOnCard, setNameOf } from "./PowerOnCard";

// The Worker is replaced: it reports two steps, then a failure at "vectors".
vi.mock("../../power/client", () => ({
  startPowerOn: (_zip: Uint8Array, onStep: (s: PowerOnStep) => void) => {
    const steps: PowerOnStep[] = [
      { name: "files", ok: true, code: "files.ok", params: { n: 28, set: "slammast" }, detail: "" },
      { name: "program", ok: true, code: "program.ok", params: { bytes: 23168 }, detail: "" },
      { name: "vectors", ok: false, code: "vectors.reset", params: { pc: "0x000000" }, detail: "" },
    ];
    const rest = STEP_IDS.slice(3).map((name): PowerOnStep => ({ name, ok: false, skipped: true, code: "skipped", params: {}, detail: "" }));
    const result: PowerOnResult = { ok: false, set: "slammast", steps: [...steps, ...rest], frames: 0, ms: 3 };
    return {
      result: (async () => {
        for (const s of result.steps) onStep(s);
        return result;
      })(),
      cancel: () => undefined,
    };
  },
}));

function drop(lang: Lang = "en", device: MakerDevice | null = null) {
  render(
    <LangProvider value={lang}>
      <DeviceProvider value={device}>
        <PowerOnCard />
      </DeviceProvider>
    </LangProvider>,
  );
  const file = new File([new Uint8Array([0x50, 0x4b, 5, 6])], "slammast.zip", { type: "application/zip" });
  fireEvent.change(screen.getByLabelText(lang === "es" ? exportEs.powerOn.choose : exportEn.powerOn.choose), { target: { files: [file] } });
}

describe("power-on test card", () => {
  afterEach(cleanup);

  it("has every result code translated, with no placeholders left", () => {
    const params = { n: 2, set: "slammast", name: "a.rom", size: 1, expected: 2, bytes: 3, pc: "0x1", sp: "0x2", vblank: "0x3", addr: "0x4", frames: 5, seconds: 1, frame: 6, vector: 4, access: "write", count: 7, sr: "0x2700", colors: 8, base: "0x9", layers: "scroll1", sprites: 9, control: "0x0", layer: "scroll2", coin: 120, start: 150, max: 64 };
    for (const m of [exportEn, exportEs, exportPt]) {
      expect(Object.keys(m.powerOn.codes).sort()).toEqual(Object.keys(POWER_ON_TEXT).sort());
      for (const [code, f] of Object.entries(m.powerOn.codes)) expect(f(params), `${m.lang} ${code}`).not.toMatch(/undefined|\$\{/);
      for (const id of STEP_IDS) expect(m.powerOn.steps[id]).toBeTruthy();
    }
    expect(exportEs.powerOn.codes["run.exception"](params)).toContain("instrucción ilegal");
  });

  it("shows each step as it arrives and where it failed", async () => {
    drop();
    await waitFor(() => expect(screen.getByText(exportEn.powerOn.failed)).toBeInTheDocument());
    expect(screen.getByText("All 28 files of slammast are there, each with its size")).toBeInTheDocument();
    expect(screen.getByText("The reset vector points to 0x000000, outside the program.")).toBeInTheDocument();
    expect(screen.getAllByText("Not run: an earlier step failed.")).toHaveLength(STEP_IDS.length - 3);
    expect(screen.getByRole("button", { name: new RegExp(exportEn.powerOn.again) })).toBeEnabled();
  });

  it("speaks Spanish", async () => {
    drop("es");
    await waitFor(() => expect(screen.getByText(exportEs.powerOn.failed)).toBeInTheDocument());
    expect(screen.getByText("El vector de reinicio apunta a 0x000000, fuera del programa.")).toBeInTheDocument();
  });
});

// A linked go-link that answers the upload and the rom_test like the device.
function fakeDevice(answer: (req: { id: string; set: string }) => Record<string, unknown> | null, opts: { upload?: boolean } = {}) {
  const handlers = new Set<(msg: unknown) => void>();
  const emit = (msg: unknown) => setTimeout(() => handlers.forEach((h) => h(msg)));
  const sent: { files: { id: string; name: string; purpose?: string }[]; control: unknown[] } = { files: [], control: [] };
  const device: MakerDevice = {
    linked: true,
    name: "arcade-mac",
    onMessage: (h) => {
      handlers.add(h);
      return () => handlers.delete(h);
    },
    link: {
      sendFile: async (id, file, name, onProgress, purpose) => {
        sent.files.push({ id, name, purpose });
        onProgress?.(file.size / 2, file.size);
        onProgress?.(file.size, file.size);
        emit({ type: "upload_result", id, ok: opts.upload !== false, error: opts.upload === false ? "disk full" : undefined });
      },
      sendControl: (msg) => {
        sent.control.push(msg);
        const req = msg as { id: string; set: string };
        const r = answer(req);
        if (r) emit({ type: "rom_test_result", id: req.id, set: req.set, ...r });
        return true;
      },
    },
  };
  return { device, sent };
}

const SHOT = "iVBORw0KGgo=";

describe("ROM test on the linked go-link", () => {
  afterEach(cleanup);
  const d = exportEn.powerOn.device;

  it("names the set after the zip, or the one the browser read", () => {
    expect(setNameOf("SlamMast.zip")).toBe("slammast");
    expect(setNameOf("slammast (1).zip", "slammast")).toBe("slammast");
    expect(setNameOf("my rom.zip")).toBeNull();
  });

  it("sends the zip, then shows the device's steps, frames and picture", async () => {
    const { device, sent } = fakeDevice(() => ({
      ok: true,
      frames: 900,
      seconds: 6.5,
      shot: SHOT,
      own: { id: "willy-proto", title: "Willy Gorklingo" },
      steps: [
        { name: "zip", ok: true, detail: "28 files" },
        { name: "video.picture", ok: true, detail: "first picture at frame 9" },
        { name: "future.check", ok: true },
      ],
    }));
    drop("en", device);
    const button = await screen.findByRole("button", { name: d.test });
    expect(screen.getByText(d.on("arcade-mac"))).toBeInTheDocument();
    fireEvent.click(button);
    await screen.findByText(d.passed);
    expect(sent.files).toEqual([expect.objectContaining({ name: "slammast.zip", purpose: "rom_test" })]);
    expect(sent.control).toEqual([expect.objectContaining({ type: "rom_test", set: "slammast" })]);
    expect(screen.getByText(d.steps.zip)).toBeInTheDocument();
    expect(screen.getByText("28 files")).toBeInTheDocument();
    expect(screen.getByText(d.steps["video.picture"])).toBeInTheDocument();
    expect(screen.getByText("future.check")).toBeInTheDocument();
    expect(screen.getByText(d.summary(900, 6.5))).toBeInTheDocument();
    expect(screen.getByText(d.own("Willy Gorklingo"))).toBeInTheDocument();
    expect(screen.getByRole("img", { name: d.shot })).toHaveAttribute("src", `data:image/png;base64,${SHOT}`);
    expect(screen.getByRole("button", { name: d.again })).toBeEnabled();
  });

  it("shows where the game failed on the device, in Spanish", async () => {
    const { device } = fakeDevice(() => ({
      ok: false,
      frames: 900,
      seconds: 7,
      steps: [
        { name: "zip", ok: true },
        { name: "core.loaded", ok: false, detail: "the core refused the set" },
      ],
    }));
    const es = exportEs.powerOn.device;
    drop("es", device);
    fireEvent.click(await screen.findByRole("button", { name: es.test }));
    await screen.findByText(es.failed);
    expect(screen.getByText(es.steps["core.loaded"])).toBeInTheDocument();
    expect(screen.getByText("the core refused the set")).toBeInTheDocument();
  });

  it("says when the device is busy with another test", async () => {
    const { device } = fakeDevice(() => ({ ok: false, steps: [], error: "another test is running", code: "busy" }));
    drop("en", device);
    fireEvent.click(await screen.findByRole("button", { name: d.test }));
    expect(await screen.findByText(d.busy)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: d.again })).toBeEnabled();
  });

  it("says when the device refuses the upload", async () => {
    const { device, sent } = fakeDevice(() => null, { upload: false });
    drop("en", device);
    fireEvent.click(await screen.findByRole("button", { name: d.test }));
    expect(await screen.findByText(d.error("disk full"))).toBeInTheDocument();
    expect(sent.control).toEqual([]);
  });

  it("points to My device when no go-link is linked or it is offline", async () => {
    const open = vi.fn();
    drop("en", null);
    await waitFor(() => expect(screen.getByText(exportEn.powerOn.failed)).toBeInTheDocument());
    expect(screen.getByText(new RegExp(d.noDevice.replace(/\./g, "\\.")))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: d.myDevice })).toHaveAttribute("href", "/device");
    expect(screen.queryByRole("button", { name: d.test })).toBeNull();
    cleanup();
    drop("en", { linked: true, link: null, onMessage: () => () => undefined, openMyDevice: open });
    fireEvent.click(await screen.findByRole("link", { name: d.myDevice }));
    expect(open).toHaveBeenCalled();
    expect(screen.getByText(new RegExp(d.offline.replace(/\./g, "\\.")))).toBeInTheDocument();
  });
});
