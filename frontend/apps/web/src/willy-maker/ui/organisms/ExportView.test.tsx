// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { LangProvider, type Lang } from "../../i18n";
import { exportEn } from "../../i18n/export.en";
import { exportEs } from "../../i18n/export.es";
import { exportPt } from "../../i18n/export.pt";
import { newProject, objectLayer } from "../../model";
import { EditorStore } from "../../editor/store";
import type { Target } from "../../editor/validate";
import { PackBuildError } from "../../io/packCheck";
import { ExportView } from "./ExportView";

// a pack that fails its own build check (level 2), on demand
const failPack = vi.hoisted(() => ({ on: false }));
vi.mock("../../io/aiPack", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../io/aiPack")>();
  return {
    ...real,
    buildAiPack: (...args: Parameters<typeof real.buildAiPack>) =>
      failPack.on ? Promise.reject(new PackBuildError([{ id: "pack.maps", detail: "levels/level-1.tmj uses levels/x.png, which is not in the pack" }])) : real.buildAiPack(...args),
  };
});

function shape(v: unknown): unknown {
  if (typeof v === "function") return "fn";
  if (Array.isArray(v)) return v.map(shape);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]).sort());
  return typeof v;
}

function Harness({ store, onGo, lang = "en" }: { store: EditorStore; onGo: (t: Target) => void; lang?: Lang }) {
  const version = useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  return (
    <LangProvider value={lang}>
      <ExportView project={store.project} version={version} store={store} onGo={onGo} />
    </LangProvider>
  );
}

describe("Export tab", () => {
  afterEach(cleanup);

  it("keeps the same texts in every language", () => {
    expect(shape(exportEs)).toEqual(shape(exportEn));
    expect(shape(exportPt)).toEqual(shape(exportEn));
  });

  it("shows the review, fixes what is safe and undoes the fix", () => {
    const p = newProject({ title: "Dead Air", players: 1 });
    p.palettes.push({ id: "pal-x", group: "sprite", colors: ["#123456"] });
    const store = new EditorStore(p);
    render(<Harness store={store} onGo={() => undefined} />);
    expect(screen.getByText("Review before exporting")).toBeInTheDocument();
    expect(screen.getByText("There is a player 1 start and an exit")).toBeInTheDocument();
    const row = screen.getByText(/1 color is not on the board/).closest("li")!;
    fireEvent.click(row.querySelector("button")!);
    expect(screen.getByText("Every color exists on the board")).toBeInTheDocument();
    expect(store.project.palettes[0]!.colors).toEqual(["#113355"]);
    act(() => void store.undo());
    expect(screen.getByText(/1 color is not on the board/)).toBeInTheDocument();
  });

  it("blocks the AI pack while there are errors, and Go opens the place", () => {
    const p = newProject({ title: "Dead Air", players: 1 });
    objectLayer(p.levels[0]!).items.splice(1, 1); // the exit
    const store = new EditorStore(p);
    const onGo = vi.fn();
    render(<Harness store={store} onGo={onGo} />);
    expect(screen.getByRole("button", { name: /Download AI pack/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Copy prompt/ })).toBeDisabled();
    expect(screen.getByText(/Fix the error in the review first/)).toBeInTheDocument();
    const row = screen.getByText("Level 1 has no exit.").closest("li")!;
    fireEvent.click(row.querySelector("button")!);
    expect(onGo).toHaveBeenCalledWith({ tab: "build", level: "level-1", x: undefined, y: undefined, object: undefined });
  });

  it("offers the AI pack with a prompt preview, and copies the prompt", async () => {
    const store = new EditorStore(newProject({ title: "Dead Air", players: 1 }));
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<Harness store={store} onGo={() => undefined} lang="es" />);
    // the picture checks run first
    expect(screen.getByText(exportEs.review.checking)).toBeInTheDocument();
    expect(screen.getByText(exportEs.ai.checking)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: new RegExp(exportEs.ai.download) })).toBeEnabled());
    expect(screen.getByLabelText(exportEs.ai.preview).textContent).toMatch(/^## Before you start[\s\S]*A browser is not enough/);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: new RegExp(exportEs.ai.copy) })));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("node rom/tools/build.mjs"));
    expect(screen.getByRole("button", { name: new RegExp(exportEs.ai.copied) })).toBeInTheDocument();
  });

  it("does not download a pack that fails its build check, and gives a report to copy", async () => {
    failPack.on = true;
    try {
      const store = new EditorStore(newProject({ title: "Dead Air", players: 1 }));
      const writeText = vi.fn(async () => undefined);
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click");
      render(<Harness store={store} onGo={() => undefined} lang="pt" />);
      const download = screen.getByRole("button", { name: new RegExp(exportPt.ai.download) });
      await waitFor(() => expect(download).toBeEnabled());
      await act(async () => fireEvent.click(download));
      expect(await screen.findByText(exportPt.ai.bug)).toBeInTheDocument();
      expect(click).not.toHaveBeenCalled();
      await act(async () => fireEvent.click(screen.getByRole("button", { name: new RegExp(exportPt.ai.copyReport) })));
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("pack.maps: levels/level-1.tmj uses levels/x.png"));
      expect(screen.getByRole("button", { name: new RegExp(exportPt.ai.reportCopied) })).toBeInTheDocument();
      click.mockRestore();
    } finally {
      failPack.on = false;
    }
  });

  it("offers Create ROM (stage 2); the download and Play on my go-link come with a created ROM", () => {
    render(<Harness store={new EditorStore(newProject({ title: "A", players: 1 }))} onGo={() => undefined} />);
    expect(screen.getByText("stage 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: exportEn.rom.create })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Download ROM/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Play on my go-link/ })).toBeNull();
  });
});
