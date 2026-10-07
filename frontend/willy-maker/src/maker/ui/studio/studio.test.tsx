// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LangProvider } from "../../i18n";
import { studioEn } from "../../i18n/studio.en";
import { studioEs } from "../../i18n/studio.es";
import { studioPt } from "../../i18n/studio.pt";
import { newProject, objectLayer, tagLayer, type Project } from "../../model";
import { projectFromTemplate } from "../../templates";
import { Studio } from "./Studio";
import { gridColumns, readPrefs, StudioUi } from "./state";
import { firstSteps } from "./steps";
import { hitAt } from "./select";
import { exampleLevel } from "./example";
import { artEnd, hasAiMagenta, onLevelGrid } from "./background";
import { encodeCells } from "../../model/rle";
import { characterOf } from "./ownSprites";
import { SHORTCUTS, shortcutFor } from "./keys";
import { BOT_FIRE, BOT_JUMPS } from "./demo";
import { createGame, firstLevel } from "./newGame";
import { Game, Input, levelFromProject } from "../../engine";
import { listProjects } from "../../io/storage";
import { catalog } from "./catalog";
import { coreEn } from "../../i18n/core.en";

function shape(v: unknown): unknown {
  if (typeof v === "function") return "fn";
  if (Array.isArray(v)) return v.map(shape);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]).sort());
  return typeof v;
}

beforeEach(() => {
  window.localStorage.clear();
  // a desktop window: the header shows its labels and the board tag
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
});
afterEach(cleanup);

describe("editor UI state", () => {
  it("turns the tools panel into the rail below 140 px and keeps widths in range", () => {
    const ui = new StudioUi();
    ui.dragLeft(500);
    expect(ui.state.leftW).toBe(380);
    ui.dragLeft(150);
    expect(ui.state).toMatchObject({ leftW: 180, leftCompact: false });
    ui.dragLeft(120);
    expect(ui.state.leftCompact).toBe(true);
    ui.dragRight(100);
    expect(ui.state.rightW).toBe(240);
    ui.dragRight(999);
    expect(ui.state.rightW).toBe(480);
  });

  it("lays out the body without the hidden panels", () => {
    expect(gridColumns({ leftHidden: false, leftCompact: false, leftW: 220, rightHidden: false, rightW: 288 })).toBe("220px minmax(0,1fr) 288px");
    expect(gridColumns({ leftHidden: false, leftCompact: true, leftW: 220, rightHidden: true, rightW: 288 })).toBe("52px minmax(0,1fr)");
    expect(gridColumns({ leftHidden: true, leftCompact: false, leftW: 220, rightHidden: true, rightW: 288 })).toBe("minmax(0,1fr)");
  });

  it("hides both panels with Tab, and shows both when either is hidden", () => {
    const ui = new StudioUi();
    ui.togglePanels();
    expect(ui.state).toMatchObject({ leftHidden: true, rightHidden: true });
    ui.set({ leftHidden: false });
    ui.togglePanels();
    expect(ui.state).toMatchObject({ leftHidden: true, rightHidden: true });
    ui.togglePanels();
    expect(ui.state).toMatchObject({ leftHidden: false, rightHidden: false });
  });

  it("remembers the panels and view in this browser, and checks what it reads back", () => {
    const ui = new StudioUi();
    ui.set({ leftW: 300, grid: 8, zoneOpacity: 40 });
    expect(new StudioUi().state).toMatchObject({ leftW: 300, grid: 8, zoneOpacity: 40 });
    expect(readPrefs('{"leftW":5000,"rightW":"x","grid":12,"zoneOpacity":3,"showGrid":false}')).toEqual({ leftW: 380, zoneOpacity: 10, showGrid: false });
    expect(readPrefs("not json")).toEqual({});
  });

  it("keeps the zoom between 0.5× and 6×, in hundredths", () => {
    const ui = new StudioUi();
    ui.setZoom(9);
    expect(ui.state.zoom).toBe(6);
    ui.setZoom(0.1);
    expect(ui.state.zoom).toBe(0.5);
    ui.setZoom(1.23456);
    expect(ui.state.zoom).toBe(1.23);
  });
});

describe("first steps", () => {
  it("read the level: a new one has its floor and starts but no background, Buenos Aires has them all", () => {
    expect(firstSteps(newProject({ title: "x" }).levels[0]!, false)).toEqual([false, true, true, false]);
    const ba = projectFromTemplate("buenos-aires", { title: "BA", layout: "slammast", players: 4 }).levels[0]!;
    expect(firstSteps(ba, true)).toEqual([true, true, true, true]);
  });
});

describe("the editor", () => {
  it("keeps the same texts in every language", () => {
    expect(shape(studioEs)).toEqual(shape(studioEn));
    expect(shape(studioPt)).toEqual(shape(studioEn));
  });

  function open(lang: "en" | "es" = "en") {
    const project = newProject({ title: "Dead Air", players: 2 });
    let home = 0;
    let langAsked: string | null = null;
    render(
      <LangProvider value={lang}>
        <Studio project={project} lang={lang} theme="light" onLang={(l) => (langAsked = l)} onHome={() => home++} onCreated={() => undefined} />
      </LangProvider>,
    );
    return { home: () => home, langAsked: () => langAsked };
  }

  it("shows the header, the tools, the options bar, the panels and the footer", () => {
    const h = open();
    expect(screen.getByText("Dead Air")).toBeInTheDocument();
    expect(screen.getByText("CPS-1 · 384×224 · 2P × 3B")).toBeInTheDocument();
    for (const name of ["Select and move", "Draw zone", "Erase", "Hand"]) expect(screen.getByRole("button", { name: new RegExp(name) })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Undo/ })).toBeDisabled();
    expect(screen.getByText("Properties")).toBeInTheDocument();
    expect(screen.getByText(/^Level \d+×\d+$/)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("saved in this browser");
    fireEvent.click(screen.getByRole("button", { name: "My games" }));
    expect(h.home()).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "PT" }));
    expect(h.langAsked()).toBe("pt");
  });

  it("speaks Spanish with the site", () => {
    open("es");
    expect(screen.getByText("CPS-1 · 384×224 · 2J × 3B")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Seleccionar y mover/ })).toBeInTheDocument();
    expect(screen.getByText("Primeros pasos")).toBeInTheDocument();
  });

  it("picks tools and zone kinds from the keyboard, and toggles the panels", () => {
    open();
    fireEvent.keyDown(window, { key: "b" });
    expect(screen.getByText("This is:")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "6" });
    expect(screen.getByRole("button", { name: "Hazard" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Takes a life on touch.")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "h" });
    expect(screen.getByText("Hand: drag to move the canvas.")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "F6" });
    expect(screen.queryByText("Tools")).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "F7" });
    expect(screen.queryByText("Properties")).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(screen.getByText("Tools")).toBeInTheDocument();
    expect(screen.getByText("Properties")).toBeInTheDocument();
    // never while typing
    const opacity = screen.getByRole("slider", { name: "Zone opacity" });
    fireEvent.keyDown(opacity, { key: "F6" });
    expect(screen.queryByText("Tools")).not.toBeInTheDocument();
  });

  it("shows the timeline under the canvas, its screens and the box on what the view shows", () => {
    open();
    const strip = screen.getByRole("slider", { name: "Timeline: click or drag to move the view" });
    expect(strip).toBeInTheDocument();
    // the level's size and its screens of 384 px, numbered on the strip
    const size = screen.getByText(/^\d+×\d+ px · \d+ screens?$/).textContent!;
    const [w, n] = [Number(/^(\d+)×/.exec(size)![1]), Number(/· (\d+) screen/.exec(size)![1])];
    expect(n).toBe(Math.ceil(w / 384));
    expect(within(strip).getByText(String(n))).toBeInTheDocument();
  });

  it("shrinks the tools panel to the rail, whose zone button opens the kinds", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Shrink to icons" }));
    expect(screen.queryByText("First steps")).not.toBeInTheDocument();
    expect(screen.getByText("2/4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Draw zone \(B\)/ }));
    const menu = screen.getByRole("menu");
    const kinds = within(menu).getAllByRole("menuitemcheckbox");
    expect(kinds.map((b) => b.textContent)).toEqual(["Floor1", "Platform2", "Ladder3", "Crate4", "Breakable5", "Hazard6"]);
    expect(kinds.map((b) => b.getAttribute("aria-checked"))).toEqual(["true", "false", "false", "false", "false", "false"]);
    fireEvent.click(kinds[2]!);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ladder" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Expand panel" }));
    expect(screen.getByText("First steps")).toBeInTheDocument();
  });

  it("shows the debug overlays' chips while playing, and counts them in View", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByText("Debug:")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "FPS" }));
    expect(screen.getByRole("button", { name: /View · 2/ })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByText("Try it").closest("li")).toHaveClass("is-done");
  });

  it("zooms with the buttons, by 1.25", () => {
    open();
    expect(screen.getByText("200 %")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("250 %")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(screen.getByText("160 %")).toBeInTheDocument();
  });
});

describe("the canvas", () => {
  function openWith(project: Project) {
    render(
      <LangProvider value="en">
        <Studio project={project} lang="en" theme="light" onHome={() => undefined} onCreated={() => undefined} />
      </LangProvider>,
    );
    return document.querySelector(".studio-stage") as HTMLElement;
  }
  // jsdom lays nothing out: the level's corner is at (0, 0), so a client point is a level point × the zoom (2)
  const at = (x: number, y: number) => ({ clientX: x * 2, clientY: y * 2, button: 0, pointerId: 1 });

  it("draws a zone with the Draw zone tool, snapped to the 16 px grid, and selects it", () => {
    const project = newProject({ title: "Canvas", players: 1 });
    const stage = openWith(project);
    fireEvent.keyDown(window, { key: "b" });
    fireEvent.keyDown(window, { key: "3" });
    fireEvent.pointerDown(stage, at(37, 21));
    fireEvent.pointerMove(window, at(70, 90));
    fireEvent.pointerUp(window, at(70, 90));
    const zone = project.levels[0]!.zones!.find((z) => z.kind === "ladder")!;
    expect(zone).toMatchObject({ x: 32, y: 16, w: 32, h: 80 });
    expect(screen.getByText("Zone: Ladder 1 · 32×80")).toBeInTheDocument();
    expect(document.querySelector(".studio-zone.is-selected")).not.toBeNull();
    // a click without a drag makes a 4 × 2 cell zone
    fireEvent.pointerDown(stage, at(200, 100));
    fireEvent.pointerUp(window, at(200, 100));
    expect(project.levels[0]!.zones!.filter((z) => z.kind === "ladder")[1]).toMatchObject({ w: 64, h: 32 });
  });

  it("moves an object with the select tool, and erases it with the eraser", () => {
    const project = newProject({ title: "Canvas", players: 1 });
    const start = objectLayer(project.levels[0]!).items.find((o) => o.type === "player_start")!;
    const x0 = start.x;
    const stage = openWith(project);
    fireEvent.pointerDown(stage, at(start.x, start.y - 10));
    fireEvent.pointerMove(window, at(start.x + 33, start.y - 10));
    fireEvent.pointerUp(window, at(start.x + 33, start.y - 10));
    expect(start.x).toBe(x0 + 32);
    expect(screen.getByRole("button", { name: /Undo/ })).not.toBeDisabled();
    fireEvent.keyDown(window, { key: "e" });
    fireEvent.pointerDown(stage, at(start.x, start.y - 10));
    expect(objectLayer(project.levels[0]!).items.some((o) => o.type === "player_start")).toBe(false);
  });

  it("places an enemy from the context menu and the sprite picker", () => {
    const project = newProject({ title: "Canvas", players: 1 });
    const stage = openWith(project);
    fireEvent.contextMenu(stage, at(150, 60));
    fireEvent.click(screen.getByRole("menuitem", { name: "Place enemy…" }));
    const dialog = screen.getByRole("dialog", { name: "Choose a sprite" });
    expect(within(dialog).getByRole("tab", { name: "Enemies" })).toHaveAttribute("aria-selected", "true");
    expect(within(dialog).getByRole("button", { name: "Place" })).toBeDisabled();
    fireEvent.doubleClick(within(dialog).getByRole("button", { name: /Spinner/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(objectLayer(project.levels[0]!).items).toContainEqual(expect.objectContaining({ type: "enemy", kind: "spinner", x: 144, y: 64 }));
    expect(screen.getByText("Spinner · 24×44")).toBeInTheDocument();
  });

  it("changes a zone's kind from its context menu", () => {
    const project = newProject({ title: "Canvas", players: 1 });
    const floor = project.levels[0]!;
    const stage = openWith(project);
    const z = floor.zones!.find((x) => x.kind === "floor")!;
    fireEvent.contextMenu(stage, at(z.x + 40, z.y + 4));
    expect(screen.getByText("Floor 1: this is…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Hazard/ }));
    expect(floor.zones!.find((x) => x.id === z.id)!.kind).toBe("hazard");
    expect(tagLayer(floor).data).toContain("6*");
  });

  it("offers the empty canvas's start", () => {
    const project = newProject({ title: "Empty", players: 1 });
    const l = project.levels[0]!;
    objectLayer(l).items.length = 0;
    tagLayer(l).data = "rle:";
    openWith(project);
    expect(screen.getByText("Start with the background")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Insert background…" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Open example level" })).toBeEnabled();
  });
});

describe("the example level", () => {
  it("marks three floors, three platforms, a ladder, a crate and a hazard, with the hero, a trooper, a bazooka and the exit in four groups", () => {
    const l = exampleLevel("level-1", "Level 1", studioEn.exampleGroups);
    expect(l.size).toEqual({ w: 480, h: 272 });
    expect(l.zones!.map((z) => z.kind).sort()).toEqual(["crate", "floor", "floor", "floor", "hazard", "ladder", "platform", "platform", "platform"]);
    expect(l.zones!.every((z) => z.x % 16 === 0 && z.y % 16 === 0 && z.w % 16 === 0 && z.h % 16 === 0)).toBe(true);
    expect(objectLayer(l).items.map((o) => o.type)).toEqual(["player_start", "enemy", "pickup", "exit"]);
    expect(l.groups!.map((g) => g.name ?? g.base)).toEqual(["objects", "Platforms and ladders", "Hazards", "Ground and crates"]);
    // the collision layer already says it all, and the hero stands on the first floor
    expect(firstSteps(l, false)).toEqual([false, true, true, false]);
    const start = objectLayer(l).items[0]!;
    expect(l.zones!.some((z) => z.kind === "floor" && z.y === start.y && start.x >= z.x && start.x < z.x + z.w)).toBe(true);
  });
});

describe("picking and the catalog", () => {
  it("picks objects over zones, skips locked and hidden ones, and finds the background last", () => {
    const p = projectFromTemplate("buenos-aires", { title: "BA", layout: "slammast", players: 1 });
    const l = p.levels[0]!;
    const crate = objectLayer(l).items.find((o) => o.type === "crate")!;
    expect(hitAt(l, crate.x + 4, crate.y + 4)).toEqual({ kind: "object", id: crate.name });
    crate.locked = true;
    expect(hitAt(l, crate.x + 4, crate.y + 4)?.kind).not.toBe("object");
    expect(hitAt(l, 10, 10)).toEqual({ kind: "bg" });
  });

  it("lists heroes for the game's players, the enemies and the objects", () => {
    const p = newProject({ title: "x", players: 2 });
    const items = catalog(p, { objects: coreEn.objects, kinds: coreEn.kinds, player: studioEn.player });
    expect(items.filter((i) => i.tab === "heroes").map((i) => i.name)).toEqual(["Player 1 · Willy", "Player 2 · Willy"]);
    expect(items.filter((i) => i.tab === "enemies").map((i) => i.name)).toContain("Trooper");
    expect(items.filter((i) => i.tab === "objects").map((i) => i.name)).toEqual(expect.arrayContaining(["Crate", "Bazooka", "Exit", "Woman"]));
  });

  it("offers the game's own enemies and civilians first, as the kind their character's id names", () => {
    const p = newProject({ title: "x", players: 1 });
    p.characters.push({ id: "sentinel", name: "Sentinel", role: "enemy" } as never, { id: "kid", name: "Kid", role: "civilian" } as never, { id: "battery", name: "Battery", role: "boss" } as never);
    const items = catalog(p, { objects: coreEn.objects, kinds: coreEn.kinds, player: studioEn.player });
    const enemy = items.find((i) => i.tab === "enemies")!;
    expect(enemy.name).toBe("Sentinel");
    expect(enemy.part).toMatchObject({ type: "enemy", props: { kind: "sentinel" } });
    expect(items.find((i) => i.tab === "objects")).toMatchObject({ name: "Kid", part: { type: "civilian", props: { kind: "kid" } } });
    expect(items.some((i) => i.name === "Battery")).toBe(false);
  });
});

describe("the Layers panel", () => {
  function openExample() {
    const project = newProject({ title: "Layers", players: 1 });
    project.levels[0] = exampleLevel("level-1", "Level 1", studioEn.exampleGroups);
    render(
      <LangProvider value="en">
        <Studio project={project} lang="en" theme="light" onHome={() => undefined} onCreated={() => undefined} />
      </LangProvider>,
    );
    return project.levels[0]!;
  }
  const L = () => within(document.querySelector(".studio-layers-list") as HTMLElement);
  const rowsOf = (group: string) => {
    const head = L().getByText(group).closest(".studio-group")!;
    return [...head.querySelectorAll(".studio-layer-name")].map((e) => e.textContent);
  };

  it("lists the groups with their layers, the one on top first, and the background last", () => {
    openExample();
    expect([...document.querySelectorAll(".studio-group-name")].map((e) => e.textContent)).toEqual(["Characters", "Platforms and ladders", "Hazards", "Ground and crates", "Background"]);
    expect(rowsOf("Characters")).toEqual(["Exit", "Bazooka", "Trooper", "Player 1 · Willy"]);
    expect(rowsOf("Platforms and ladders")).toEqual(["Platform 3", "Platform 2", "Ladder 1", "Platform 1"]);
    expect(screen.getByRole("button", { name: "+ Insert background…" })).toBeInTheDocument();
  });

  it("hides a group and its zones, and locks a layer so the canvas cannot pick it", () => {
    const level = openExample();
    const before = document.querySelectorAll(".studio-zone").length;
    const head = L().getByText("Hazards").closest(".studio-group-head") as HTMLElement;
    fireEvent.click(within(head).getByRole("button", { name: "Show / hide the group" }));
    expect(document.querySelectorAll(".studio-zone")).toHaveLength(before - 1);
    expect(tagLayer(level).data).not.toContain("6*");
    const row = L().getByText("Ladder 1").closest(".studio-layer") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Lock" }));
    expect(level.zones!.find((z) => z.kind === "ladder")!.locked).toBe(true);
    expect(hitAt(level, 20, 150)?.kind).not.toBe("zone");
  });

  it("renames a layer and a group in place, and selects a layer with a click", () => {
    const level = openExample();
    fireEvent.doubleClick(L().getByText("Floor 2"));
    const input = screen.getByRole("textbox", { name: "Rename Floor 2" });
    fireEvent.change(input, { target: { value: "Street" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(level.zones!.find((z) => z.kind === "floor" && z.n === 2)!.name).toBe("Street");
    expect(L().getByText("Street").closest(".studio-layer")).toBeInTheDocument();
    fireEvent.click(L().getByText("Street"));
    expect(screen.getByText("Zone: Street · 160×32")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New group" }));
    const name = screen.getByRole("textbox", { name: "Rename Group 1" });
    fireEvent.change(name, { target: { value: "Rooftops" } });
    fireEvent.blur(name);
    expect(level.groups![0]).toMatchObject({ name: "Rooftops", n: 1 });
  });

  it("drags a layer into another group", () => {
    const level = openExample();
    const row = L().getByText("Bazooka").closest(".studio-layer") as HTMLElement;
    const target = L().getByText("Hazards").closest(".studio-group") as HTMLElement;
    fireEvent.dragStart(row, { dataTransfer: { setData: () => undefined, effectAllowed: "" } });
    fireEvent.dragOver(target);
    expect(target.querySelector(".studio-group-head")).toHaveClass("is-drop");
    fireEvent.drop(target);
    expect(objectLayer(level).items.find((o) => o.type === "pickup")!.group).toBe("group-hazards");
    expect(rowsOf("Hazards")).toEqual(["Bazooka", "Hazard 1"]);
  });

  it("offers the group menu: no ungroup or delete on base groups", () => {
    openExample();
    fireEvent.contextMenu(L().getByText("Characters").closest(".studio-group-head")!);
    expect(screen.queryByRole("menuitem", { name: "Ungroup" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    fireEvent.contextMenu(L().getByText("Hazards").closest(".studio-group-head")!);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete group and its content" }));
    expect(L().queryByText("Hazards")).not.toBeInTheDocument();
    expect(L().queryByText("Hazard 1")).not.toBeInTheDocument();
  });
});

describe("properties and shortcuts", () => {
  function openExample() {
    const project = newProject({ title: "Props", players: 1 });
    project.levels[0] = exampleLevel("level-1", "Level 1", studioEn.exampleGroups);
    render(
      <LangProvider value="en">
        <Studio project={project} lang="en" theme="light" onHome={() => undefined} onCreated={() => undefined} />
      </LangProvider>,
    );
    // undo puts back a copy of the level: always read the current one
    return () => project.levels[0]!;
  }
  const L = () => within(document.querySelector(".studio-layers-list") as HTMLElement);
  const P = () => within(document.querySelector(".studio-props") as HTMLElement);

  it("edits a zone: its name, kind, place, size and a breakable's hits, typing being one undo step", () => {
    const level = openExample();
    fireEvent.click(L().getByText("Platform 2"));
    expect(P().getByText("Zone")).toBeInTheDocument();
    const name = P().getByRole("textbox", { name: "Name" }) as HTMLInputElement;
    expect(name.value).toBe("Platform 2");
    fireEvent.focus(name);
    for (const v of ["B", "Br", "Bridge"]) fireEvent.change(name, { target: { value: v } });
    const zone = level().zones!.find((z) => z.id === "zone-6")!;
    expect(zone.name).toBe("Bridge");
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    expect(level().zones!.find((z) => z.id === "zone-6")!.name).toBeUndefined();
    fireEvent.click(P().getByRole("radio", { name: "Breakable" }));
    expect(level().zones!.find((z) => z.id === "zone-6")!.kind).toBe("breakable");
    fireEvent.change(P().getByRole("spinbutton", { name: "Hits" }), { target: { value: "5" } });
    expect(tagLayer(level()).props?.["9,8"]).toEqual({ hp: 5 });
    fireEvent.change(P().getByRole("spinbutton", { name: "Width" }), { target: { value: "130" } });
    expect(level().zones!.find((z) => z.id === "zone-6")!.w).toBe(128);
    fireEvent.change(P().getByRole("spinbutton", { name: "X" }), { target: { value: "470" } });
    expect(level().zones!.find((z) => z.id === "zone-6")!.x).toBe(480 - 128);
  });

  it("edits a character: its name stays its label, its place, its side and its sprite", () => {
    const level = openExample();
    fireEvent.click(L().getByText("Trooper"));
    expect(P().getByText("Enemy · Trooper · 24×44")).toBeInTheDocument();
    fireEvent.change(P().getByRole("textbox", { name: "Name" }), { target: { value: "Guard" } });
    const o = objectLayer(level()).items.find((x) => x.type === "enemy")!;
    expect(o).toMatchObject({ name: "trooper", label: "Guard" });
    fireEvent.change(P().getByRole("spinbutton", { name: "X" }), { target: { value: "300" } });
    expect(o.x).toBe(300);
    fireEvent.click(P().getByRole("button", { name: "Look right" }));
    expect(o.facing).toBe("right");
    fireEvent.click(P().getByRole("button", { name: "Change sprite…" }));
    fireEvent.doubleClick(within(screen.getByRole("dialog")).getByRole("button", { name: /Jitter/ }));
    expect(objectLayer(level()).items.find((x) => x.name === "trooper")).toMatchObject({ kind: "jitter", label: "Guard", x: 300 });
  });

  it("runs the editing keys on the selection: arrows, duplicate, group, rename, delete, undo and redo", () => {
    const level = openExample();
    fireEvent.click(L().getByText("Ladder 1"));
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowDown", shiftKey: true });
    // 4 cells down would leave the level: it stops at the bottom (272 − its 112 px)
    expect(level().zones!.find((z) => z.kind === "ladder")).toMatchObject({ x: 32, y: 160 });
    fireEvent.keyDown(window, { key: "d", ctrlKey: true });
    expect(level().zones!.filter((z) => z.kind === "ladder")).toHaveLength(2);
    fireEvent.keyDown(window, { key: "g", ctrlKey: true });
    expect(screen.getByRole("textbox", { name: "Rename Group 1" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Rename Group 1" }), { key: "Enter" });
    fireEvent.keyDown(window, { key: "Delete" });
    expect(level().zones!.filter((z) => z.kind === "ladder")).toHaveLength(1);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(level().zones!.filter((z) => z.kind === "ladder")).toHaveLength(2);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(level().zones!.filter((z) => z.kind === "ladder")).toHaveLength(1);
    fireEvent.click(L().getByText("Floor 1"));
    fireEvent.keyDown(window, { key: "F2" });
    expect(screen.getByRole("textbox", { name: "Rename Floor 1" })).toBeInTheDocument();
  });

  it("draws a pickup with one of the game's characters", () => {
    const level = openExample();
    const bazooka = objectLayer(level()).items.find((o) => o.type === "pickup")!;
    fireEvent.click(L().getByText("Bazooka"));
    expect(P().getByRole("combobox", { name: /Picture/ })).toHaveValue("");
    expect(bazooka.look).toBeUndefined();
  });

  it("leaves Space to a dialog's checkbox instead of panning the canvas", async () => {
    openExample();
    fireEvent.click(screen.getByRole("button", { name: studioEn.insert.prompt }));
    const dialog = await screen.findByRole("dialog");
    const box = within(dialog).getAllByRole("checkbox")[0]!;
    // not prevented: the browser checks the box
    expect(fireEvent.keyDown(box, { key: " ", code: "Space" })).toBe(true);
  });

  it("lists every shortcut in the dialog, opened with ? and closed with Esc", () => {
    openExample();
    fireEvent.keyDown(window, { key: "?" });
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    for (const g of ["Tools", "View", "Panels", "Edit", "Play", "Help"]) expect(within(dialog).getByRole("heading", { name: g })).toBeInTheDocument();
    expect(within(dialog).getByText("Move 1 cell / 4 cells")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Shortcuts/ }));
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
  });

  it("matches each key to one row of the table", () => {
    const key = (k: string, o: Partial<KeyboardEventInit> = {}) => shortcutFor(new KeyboardEvent("keydown", { key: k, ...o }));
    expect(key("z", { metaKey: true })).toBe("undo");
    expect(key("Z", { ctrlKey: true, shiftKey: true })).toBe("redo");
    expect(key("y", { ctrlKey: true })).toBe("redo");
    expect(key("Backspace")).toBe("delete");
    expect(key("ArrowLeft", { shiftKey: true })).toBe("nudge");
    expect(key("N", { metaKey: true, shiftKey: true })).toBe("newGroup");
    expect(key("=", { metaKey: true })).toBe("zoomIn");
    expect(key("x")).toBeNull();
    // every row the list shows has its texts in every language
    for (const r of SHORTCUTS) expect(studioEn.keys.items[r.item]).toBeTruthy();
  });
});

describe("playing in the editor", () => {
  it("plays the level with the real play mode, shows the debug chips, and Esc goes back to building", async () => {
    const project = newProject({ title: "Play", players: 1 });
    project.levels[0] = exampleLevel("level-1", "Level 1", studioEn.exampleGroups);
    render(
      <LangProvider value="en">
        <Studio project={project} lang="en" theme="light" onHome={() => undefined} onCreated={() => undefined} />
      </LangProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByText("● PLAYING")).toBeInTheDocument();
    expect(screen.getByText("Screen 384×224")).toBeInTheDocument();
    expect(await screen.findByRole("img", {}, { timeout: 4000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Screen frame" }));
    expect(screen.queryByText("Screen 384×224")).not.toBeInTheDocument();
    expect(document.querySelector(".studio-stage")).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("● PLAYING")).not.toBeInTheDocument();
    expect(document.querySelector(".studio-stage")).not.toBeNull();
    expect(screen.getByText("Try it").closest("li")).toHaveClass("is-done");
  });
});

describe("the new game wizard", () => {
  const texts = { untitled: "My game", levelName: "Level 1", groups: studioEn.exampleGroups, quizSamples: [] };
  const choice = { genre: "platform-shooter" as const, layout: "slammast" as const, title: "", author: "", players: 2, heroVariant: 0 };

  it("makes the first level from the example (with or without its zones) or empty with a floor, the starts on the floor and an exit", () => {
    const marked = firstLevel({ ...choice, background: { kind: "example", autoZones: true } }, texts);
    expect(marked.zones).toHaveLength(9);
    expect(objectLayer(marked).items.filter((o) => o.type === "player_start").map((o) => [o.x, o.y])).toEqual([
      [112, 224],
      [136, 224],
    ]);
    const bare = firstLevel({ ...choice, background: { kind: "example", autoZones: false } }, texts);
    expect(bare.zones).toEqual([]);
    expect(objectLayer(bare).items.map((o) => o.type).sort()).toEqual(["exit", "player_start", "player_start"]);
    const empty = firstLevel({ ...choice, players: 1, background: { kind: "empty" } }, texts);
    expect(empty.size).toEqual({ w: 480, h: 272 });
    expect(empty.zones).toEqual([expect.objectContaining({ kind: "floor", x: 0, y: 240, w: 480, h: 32 })]);
    expect(firstSteps(empty, false)).toEqual([false, true, true, false]);
  });

  it("gives the project its genre's rules, its board, players and hero", async () => {
    const p = await createGame({ ...choice, genre: "platformer", layout: "captcomm", title: "  Neon Run ", heroVariant: 2, background: { kind: "empty" } }, texts);
    expect(p).toMatchObject({ title: "Neon Run", genre: "platformer", board: { layout: "captcomm" } });
    expect(p.settings.rules?.weapons).toBe(false);
    expect(p.settings.players).toBe(2);
    expect(p.settings.playerSlots![0]!.variant).toBe(2);
    expect((await createGame({ ...choice, background: { kind: "empty" } }, texts)).title).toBe("My game");
  });

  it("walks the six steps and makes the game", async () => {
    const project = newProject({ title: "Old", players: 1 });
    let made: { p: unknown; how: unknown } | null = null;
    render(
      <LangProvider value="en">
        <Studio project={project} lang="en" theme="light" onHome={() => undefined} onCreated={(p, how) => (made = { p, how })} />
      </LangProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /New game/ }));
    const dialog = screen.getByRole("dialog", { name: "What kind of game?" });
    expect(within(dialog).getAllByRole("radio").filter((r) => !(r as HTMLButtonElement).disabled)).toHaveLength(13);
    fireEvent.click(within(dialog).getByRole("radio", { name: /Maze/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next: Board →" }));
    // the board's spec sheet: the 1992 QSound board, the 68000 as the emulator runs it, the controls of the layout picked
    const sheet = screen.getByRole("region", { name: "The CPS-1 in your game" });
    expect(within(sheet).getByText("QSound board (1992) · set slammast")).toBeInTheDocument();
    expect(within(sheet).getByText("68000 at 10 MHz in the emulator (mame2003-plus); 12 MHz on the real board")).toBeInTheDocument();
    expect(within(sheet).getByText("Up to 4 players, 3 buttons each")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /2 buttons/ }));
    expect(within(sheet).getByText("Up to 4 players, 2 buttons each")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next: Name and players →" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Game title" }), { target: { value: "Maze Run" } });
    fireEvent.click(screen.getByRole("radio", { name: "3 players" }));
    fireEvent.click(screen.getByRole("button", { name: "Next: Background →" }));
    fireEvent.click(screen.getByRole("radio", { name: /Start empty/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next: Hero →" }));
    fireEvent.click(screen.getByRole("radio", { name: /recruit shirt 1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next: Ready →" }));
    expect(screen.getByText("Maze Run")).toBeInTheDocument();
    expect(screen.getByText("CPS-1 · 384×224 · 2 buttons")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create game" }));
    await waitFor(() => expect(made).not.toBeNull());
    const { p, how } = made! as { p: Project; how: unknown };
    expect(p).toMatchObject({ title: "Maze Run", genre: "maze", board: { layout: "captcomm" } });
    expect(p.settings.players).toBe(3);
    expect(how).toMatchObject({ tool: "select", toast: studioEn.wizard.created });
    expect(listProjects()).toHaveLength(0);
  });
});

describe("the demo", () => {
  it("has a bot that clears the example level with the real engine", () => {
    const level = exampleLevel("l", "L", studioEn.exampleGroups);
    const g = new Game(levelFromProject(level), { players: 1, maxPlayers: 1 });
    for (let f = 0; f < 1800 && g.outcome === "playing"; f++) {
      const p = g.players[0]!;
      let bits = f < 6 ? Input.Start : Input.Right;
      if (f >= 6 && BOT_JUMPS.some(([a, b]) => p.x >= a && p.x <= b) && f % 8 < 4) bits |= Input.B1;
      if (f >= 6 && p.x > BOT_FIRE[0] && p.x < BOT_FIRE[1] && f % 20 < 4) bits |= Input.B2;
      g.step([bits]);
    }
    expect(g.outcome).toBe("cleared");
  });
});

describe("the game's own characters on the canvas", () => {
  it("draws a start with its player's character, an own enemy or civilian by its kind, and a pickup by its picture", () => {
    const p = newProject({ title: "x", players: 2 });
    p.characters.push({ id: "courier", role: "hero" } as never, { id: "sentinel", role: "enemy" } as never, { id: "kid", role: "civilian" } as never, { id: "battery", role: "boss" } as never);
    p.settings.playerSlots = [{ character: "courier", variant: 0 }, { character: "builtin:willy", variant: 1 }];
    expect(characterOf(p, { type: "player_start", player: 1 })).toBe("courier");
    expect(characterOf(p, { type: "player_start", player: 2 })).toBeNull();
    expect(characterOf(p, { type: "enemy", kind: "sentinel" })).toBe("sentinel");
    expect(characterOf(p, { type: "enemy", kind: "trooper" })).toBeNull();
    // a kind naming a character of another role is the engine's own, as in the ROM
    expect(characterOf(p, { type: "enemy", kind: "kid" })).toBeNull();
    expect(characterOf(p, { type: "civilian", kind: "kid" })).toBe("kid");
    expect(characterOf(p, { type: "pickup", item: "health", look: "battery" } as never)).toBe("battery");
    expect(characterOf(p, { type: "pickup" })).toBeNull();
  });
});

describe("a background of one's own", () => {
  it("is stretched a few pixels so a growing level and its art end on the same 32 px column", () => {
    // the image AI's picture of the e2e: 1672 × 941, on a level 272 px tall
    const src = { w: 1672, h: 941, data: new Uint8ClampedArray(1672 * 941 * 4) };
    const out = onLevelGrid(src, 272);
    expect(Math.round(out.w / (out.h / 272))).toBe(480);
    expect(out.h).toBe(941);
    // already on the grid: untouched
    const exact = { w: 768, h: 224, data: new Uint8ClampedArray(768 * 224 * 4) };
    expect(onLevelGrid(exact, 224)).toBe(exact);
  });

  it("knows where its art ends, so Add scene goes right after it even on a wider level", () => {
    const p = newProject({ title: "Wide" });
    const level = p.levels[0]!;
    level.size.w = 960;
    const play = level.layers.find((l) => l.kind === "tiles" && l.id === "play")!;
    if (play.kind !== "tiles") throw new Error("play");
    const cols = 960 / play.grid;
    const rows = Math.ceil(level.size.h / play.grid);
    const cells = new Uint16Array(cols * rows);
    expect((play.data = encodeCells(cells), artEnd(level))).toBe(0);
    // art up to column 29: it ends at 480 px of a 960 px level
    cells[2 * cols + 29] = 5;
    play.data = encodeCells(cells);
    expect(artEnd(level)).toBe(480);
  });

  it("takes an image AI's magenta sky as see-through, and a picture without it as it is", () => {
    const pic = (magentaRows: number) => {
      const data = new Uint8ClampedArray(40 * 40 * 4);
      for (let i = 0; i < 40 * 40; i++) data.set(i < magentaRows * 40 ? [255, 0, 255, 255] : [20, 40, 120, 255], i * 4);
      return { w: 40, h: 40, data };
    };
    expect(hasAiMagenta(pic(10))).toBe(true);
    expect(hasAiMagenta(pic(0))).toBe(false);
  });
});

describe("my games (the site's home)", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it("lists the games in this browser as cards, opens one, and asks before deleting", async () => {
    const { saveProject } = await import("../../io/storage");
    const { WillyMakerApp } = await import("../..");
    saveProject(newProject({ title: "Neon Run" }));
    let opened: string | null = null;
    render(<WillyMakerApp lang="en" onProjectId={(id) => (opened = id)} />);
    const card = await screen.findByRole("button", { name: /^Neon Run/ });
    expect(screen.getByRole("heading", { name: coreEn.home.myGames })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: coreEn.home.more("Neon Run") }));
    fireEvent.click(screen.getByRole("menuitem", { name: coreEn.home.delete }));
    expect(screen.getByRole("alert")).toHaveTextContent(coreEn.home.deleteAsk("Neon Run"));
    fireEvent.click(screen.getByRole("button", { name: coreEn.home.cancel }));
    fireEvent.click(card);
    expect(opened).toBe(listProjects()[0]!.id);
  });

  it("opens the new game wizard from New game, and the demo without saving anything", async () => {
    const { WillyMakerApp } = await import("../..");
    render(<WillyMakerApp lang="en" />);
    expect(await screen.findByText(coreEn.home.empty)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: coreEn.home.newGame }));
    expect(await screen.findByText(studioEn.wizard.steps[0]!.title)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: studioEn.wizard.cancel }));
    fireEvent.click(screen.getByRole("button", { name: studioEn.demo }));
    await waitFor(() => expect(document.querySelector(".studio-demo")).not.toBeNull());
    expect(listProjects()).toHaveLength(0);
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(await screen.findByText(coreEn.home.empty)).toBeInTheDocument();
    expect(listProjects()).toHaveLength(0);
  });

  it("shows the new editor by default; ?editor=classic keeps this browser on the classic one", async () => {
    const { editorChoice } = await import("../../../site");
    expect(editorChoice(new URLSearchParams(""))).toBe("next");
    expect(editorChoice(new URLSearchParams("editor=classic"))).toBe("classic");
    expect(editorChoice(new URLSearchParams(""))).toBe("classic");
    expect(editorChoice(new URLSearchParams("editor=next"))).toBe("next");
    expect(editorChoice(new URLSearchParams(""))).toBe("next");
  });
});

describe("depth bands", () => {
  it("adds a band from the background's properties, marks it on the canvas, and edits and removes it", async () => {
    const project = projectFromTemplate("buenos-aires", { title: "Depth", layout: "slammast", players: 1 });
    const level = project.levels[0]!;
    delete level.parallax;
    render(
      <LangProvider value="en">
        <Studio project={project} lang="en" theme="light" onHome={() => undefined} onCreated={() => undefined} />
      </LangProvider>,
    );
    fireEvent.click(document.querySelector(".studio-bg-row") as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: studioEn.depth.add }));
    const third = Math.floor(level.size.h / 3 / 16) * 16;
    expect(level.parallax).toEqual([{ y0: 0, y1: third, speed: 75 }]);
    expect(document.querySelectorAll(".studio-band")).toHaveLength(1);
    const speed = screen.getByLabelText(studioEn.depth.speed);
    fireEvent.change(speed, { target: { value: "40" } });
    fireEvent.blur(speed);
    expect(level.parallax![0]!.speed).toBe(40);
    fireEvent.click(screen.getByRole("button", { name: studioEn.depth.remove(1) }));
    expect(level.parallax).toBeUndefined();
    expect(document.querySelectorAll(".studio-band")).toHaveLength(0);
  });
});
