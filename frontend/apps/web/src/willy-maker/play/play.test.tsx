// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "@go-link/shared";
import { Game, Input, Tag, sampleLevel } from "../engine";
import { LangProvider } from "../i18n";
import { playEn } from "../i18n/play.en";
import { playEs } from "../i18n/play.es";
import { playPt } from "../i18n/play.pt";
import { PlayControls, PlayView, applyEdit, planPiece, toInput } from "./index";
import { characterSheet, heroAnim, type Sheet } from "./sprites";

function shape(v: unknown): unknown {
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]));
  return typeof v;
}

describe("Willy Maker play mode", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("es and pt keep the English shape", () => {
    expect(shape(playEs)).toEqual(shape(playEn));
    expect(shape(playPt)).toEqual(shape(playEn));
  });

  it("maps the site's buttons to the engine's inputs", () => {
    expect(toInput(Button.Left | Button.B1)).toBe(Input.Left | Input.B1);
    expect(toInput(Button.B2 | Button.B3 | Button.Down)).toBe(Input.B2 | Input.B3 | Input.Down);
    expect(toInput(Button.Start)).toBe(Input.Start);
  });

  it("gives controllers the first seats and the keyboard the next", () => {
    const c = new PlayControls();
    const pad = { id: "Test pad (STANDARD GAMEPAD)", index: 0, mapping: "standard", buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 0, value: i === 0 ? 1 : 0 })), axes: [0, 0, 0, 0] };
    const r = c.read([pad as never, null], 4);
    expect(r.seats.map((s) => s.device)).toEqual(["pad", "keyboard"]);
    expect(r.inputs[0]! & Input.B1).toBeTruthy();
    expect(c.read([], 4).seats).toEqual([{ player: 0, device: "keyboard", name: "" }]);
  });

  it("plans pieces on the grid: a ladder reaches the ground, a crate sits on it", () => {
    const g = new Game(sampleLevel());
    const ladder = planPiece(g, "ladder", 56, 340, "x");
    expect(ladder?.edit.kind).toBe("cells");
    if (ladder?.edit.kind === "cells") {
      expect(ladder.edit.cells.every((c) => c.tag === Tag.Ladder && c.col === 3)).toBe(true);
      expect(ladder.edit.cells.at(-1)?.row).toBe(24);
    }
    const crate = planPiece(g, "crate", 200, 100, "crate_9");
    expect(crate?.edit).toMatchObject({ kind: "object", object: { type: "crate", y: 400 - 32 } });
    applyEdit(g, crate!.edit);
    expect(g.crates.some((k) => k.name === "crate_9")).toBe(true);
  });

  it("shows the play screen with its controls in the active language", async () => {
    const onBack = vi.fn();
    const onEdit = vi.fn();
    render(
      <LangProvider value="es">
        <PlayView level={sampleLevel()} onBack={onBack} onEdit={onEdit} />
      </LangProvider>,
    );
    expect(screen.getByRole("img", { name: "Pantalla del juego" })).toBeInTheDocument();
    expect(screen.getByText("Jugando · Prototype street")).toBeInTheDocument();
    expect(screen.getByText("Controles en vivo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editar mientras juego" }));
    expect(screen.getByRole("group", { name: "Piezas" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Escalera" }));
    expect(screen.getByRole("button", { name: "Escalera" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Pausar y editar" }));
    expect(onBack).toHaveBeenCalledWith({ x: 64, y: 400 });
    expect(screen.getByText("En pausa")).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
  });

  it("turns into a handheld with the on-screen pad, the rest behind More", async () => {
    const onBack = vi.fn();
    const { container } = render(
      <LangProvider value="en">
        <PlayView level={sampleLevel()} touchPad="on" onBack={onBack} />
      </LangProvider>,
    );
    expect(container.querySelector(".wm-play.is-console")).not.toBeNull();
    expect(screen.getByRole("group", { name: "On-screen controls" })).toBeInTheDocument();
    // a D-pad cross with nothing in its centre, B1 B2 B3 on the other side
    expect(container.querySelectorAll(".wm-console-dpad .wm-console-arm")).toHaveLength(4);
    expect(container.querySelector(".wm-console-dpad [data-bit]")).toBeNull();
    expect([...container.querySelectorAll(".wm-console-side.is-right [data-bit]")].map((b) => b.textContent)).toEqual(["B1", "B2", "B3"]);
    expect(screen.queryByRole("button", { name: "Collision" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("button", { name: "Collision" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByText("Paused")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to building" }));
    expect(onBack).toHaveBeenCalled();
    await act(async () => {
      await Promise.resolve();
    });
  });
});

describe("own heroes in play mode (T-24)", () => {
  const sheet = (anims: string[]): Sheet => ({
    image: {} as CanvasImageSource,
    frames: { a: { x: 0, y: 0, w: 32, h: 48, px: 16, py: 46 } },
    anims: Object.fromEntries(anims.map((n) => [n, { frames: ["a"], fps: 8, loop: true }])),
  });

  it("uses the hero's own names for a move, and idle when it has none", () => {
    expect(heroAnim(sheet(["idle", "walk"]), "run")).toBe("walk");
    expect(heroAnim(sheet(["idle", "run", "walk"]), "run")).toBe("run");
    expect(heroAnim(sheet(["idle", "fire"]), "machine_gun")).toBe("fire");
    expect(heroAnim(sheet(["idle", "fire"]), "bazooka")).toBe("fire");
    expect(heroAnim(sheet(["idle"]), "jump")).toBe("idle");
  });

  it("gives no sheet for a character without a picture or frames", async () => {
    const ch = { id: "c1", name: "Ana", role: "hero", height: 44, sheet: null, frames: [], anims: {}, swapColors: [] } as const;
    expect(await characterSheet({ ...ch, frames: [], anims: {}, swapColors: [] }, async () => null)).toBeNull();
  });
});
