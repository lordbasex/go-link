// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PowerOnResult } from "@go-link/cps1-sim";
import { LangProvider } from "../../i18n";
import { exportEn } from "../../i18n/export.en";
import { exportEs } from "../../i18n/export.es";
import { newProject } from "../../model";
import type { CreatedRom, CreateStep } from "../../rom/createRom";
import { CreateRomCard } from "./CreateRomCard";
import { DeviceProvider, type MakerDevice } from "../device";
import { makerGameInfo } from "./PlayOnDevice";

// The card's flow with the packer and the board model replaced: Create ROM
// walks its steps, powers the result on (level 3) and then offers the
// download, the symbol map and Play on my go-link. rom/rom.test.tsx runs
// the real packer and board model.

const created: CreatedRom = {
  name: "slammast.zip",
  zip: new Uint8Array([0x50, 0x4b, 5, 6]),
  symbols: '{"set":"slammast"}\n',
  pack: { files: new Map(), data: new Uint8Array(8), notes: [{ id: "boss" }], stats: { level: "Dead Air", cols: 96, rows: 28, playTiles: 9, farTiles: 6, enemies: 3, civilians: 2, crates: 3, pickups: 0, dataBytes: 9000 } },
};
const fail = { on: false };

vi.mock("../../rom/createRom", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../rom/createRom")>();
  return {
    ...real,
    createRom: async (_p: unknown, onStep: (s: CreateStep) => void) => {
      for (const s of real.CREATE_STEPS) onStep(s);
      if (fail.on) throw new Error("the engine did not load (404, 404)");
      return created;
    },
  };
});

const result: PowerOnResult = {
  ok: true,
  set: "slammast",
  frames: 600,
  ms: 120,
  steps: [{ name: "files", ok: true, code: "files.ok", params: { n: 28, set: "slammast" }, detail: "All 28 files of slammast are there" }],
} as PowerOnResult;

vi.mock("../../power/client", () => ({
  startPowerOn: (_zip: Uint8Array, onStep: (s: PowerOnResult["steps"][number]) => void) => {
    onStep(result.steps[0]!);
    return { result: Promise.resolve(result), cancel: () => undefined };
  },
}));

afterEach(() => {
  cleanup();
  fail.on = false;
});

describe("Create ROM card", () => {
  it("creates the ROM, powers it on and offers the download and Play on my go-link", async () => {
    render(<CreateRomCard project={newProject({ title: "A", players: 2 })} blocked={false} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: exportEn.rom.create })));
    expect(await screen.findByText(exportEn.rom.passed)).toBeInTheDocument();
    expect(screen.getByText(exportEn.rom.ready("slammast.zip", 1))).toBeInTheDocument();
    expect(screen.getByText(exportEn.rom.notes.boss!({}))).toBeInTheDocument();
    for (const s of Object.values(exportEn.rom.steps)) expect(screen.getByText(s)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: new RegExp(exportEn.rom.download) })).toBeEnabled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: exportEn.rom.play })));
    // without a linked go-link the device test says how to link one
    expect(screen.getByText(exportEn.rom.playText)).toBeInTheDocument();
    expect(screen.getByText(exportEn.powerOn.device.noDevice)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: exportEn.rom.again })).toBeInTheDocument();
  });

  it("Play on my go-link sends the game, and the site opens the room the device opened", async () => {
    const handlers = new Set<(m: unknown) => void>();
    const deliver = (m: unknown) => handlers.forEach((h) => h(m));
    const sent: Record<string, unknown>[] = [];
    const opened: string[] = [];
    const device: MakerDevice = {
      linked: true,
      name: "studio",
      link: {
        async sendFile(id) {
          setTimeout(() => deliver({ type: "upload_result", id, ok: true }), 0);
        },
        sendControl(m) {
          sent.push(m as Record<string, unknown>);
          setTimeout(() => deliver({ type: "room_created", id: "g1", room_id: "ROOM-1", rom: "@maker" }), 0);
          return true;
        },
      },
      onMessage: (h) => {
        handlers.add(h);
        return () => handlers.delete(h);
      },
      openRoom: (id) => opened.push(id),
    };
    const project = newProject({ title: "My street", players: 2 });
    render(
      <DeviceProvider value={device}>
        <CreateRomCard project={project} blocked={false} />
      </DeviceProvider>,
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: exportEn.rom.create })));
    await screen.findByText(exportEn.rom.passed);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: exportEn.rom.play })));
    await vi.waitFor(() => expect(opened).toEqual(["ROOM-1"]));
    expect(sent[0]).toMatchObject({ type: "create_room", rom: "@maker", maker: makerGameInfo(project) });
    expect(makerGameInfo(project)).toEqual({ title: "My street", players: 2, labels: ["Jump", "Fire", "Special"] });
  });

  it("an older go-link that cannot open the room still powers the game on", async () => {
    const handlers = new Set<(m: unknown) => void>();
    const deliver = (m: unknown) => handlers.forEach((h) => h(m));
    const device: MakerDevice = {
      linked: true,
      link: {
        async sendFile(id) {
          setTimeout(() => deliver({ type: "upload_result", id, ok: false, error: "unknown upload purpose" }), 0);
        },
        sendControl: () => true,
      },
      onMessage: (h) => {
        handlers.add(h);
        return () => handlers.delete(h);
      },
    };
    render(
      <DeviceProvider value={device}>
        <CreateRomCard project={newProject({ title: "A", players: 2 })} blocked={false} />
      </DeviceProvider>,
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: exportEn.rom.create })));
    await screen.findByText(exportEn.rom.passed);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: exportEn.rom.play })));
    expect(await screen.findByText(exportEn.rom.playing.update)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: exportEn.powerOn.device.test })).toBeInTheDocument();
  });

  it("says why when the ROM cannot be created, in the game's language", async () => {
    fail.on = true;
    render(
      <LangProvider value="es">
        <CreateRomCard project={newProject({ title: "A", players: 2 })} blocked={false} />
      </LangProvider>,
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: exportEs.rom.create })));
    expect(await screen.findByRole("alert")).toHaveTextContent(exportEs.rom.error("the engine did not load (404, 404)"));
  });

  it("waits for the review's errors to be fixed", () => {
    render(<CreateRomCard project={newProject({ title: "A", players: 2 })} blocked />);
    expect(screen.getByRole("button", { name: exportEn.rom.create })).toBeDisabled();
  });
});
