// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { GLYPHS, glyphPixels, unsupportedChars } from "@go-link/cps1";
import { LangProvider } from "../i18n";
import { gameEn } from "../i18n/game.en";
import { gameEs } from "../i18n/game.es";
import { gamePt } from "../i18n/game.pt";
import { menusEn } from "../i18n/menus.en";
import { menusEs } from "../i18n/menus.es";
import { menusPt } from "../i18n/menus.pt";
import { BUILTIN_HERO, DEFAULT_CREDITS, migrateProject, newProject, PROJECT_FORMAT, type Project, type ValidationIssue } from "../model";
import { EditorStore } from "../editor/store";
import { gameIssues } from "../editor/validate/game";
import { Game, Input, Tag, type LevelView } from "../engine";
import { comboSpecial } from "../play/input";
import { GameScreen } from "./GameScreen";
import { MenusScreen } from "./MenusScreen";
import { actionRows, playerSlots, runTapFrames, setDip, setMenuText, setPlayers, setPlayerSlot, setRunTap } from "./settings";
import { CPS1 } from "../board/cps1";
import { menuText, screenLines, screenProblems, textProblems, type MenuScreenId } from "./menus";
import { issueTextIn } from "./texts";
import { keyLabel, padButtonLabel } from "./ControllerPanel";
import { buttonNames } from "../../controllers/controllerModels";
import { WillyMakerApp } from "..";
import { saveProject } from "../io/storage";

function shape(v: unknown): unknown {
  if (typeof v === "function") return "fn";
  if (Array.isArray(v)) return v.map(shape);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]).sort());
  return typeof v;
}

/** A project.json as format 1 wrote it (no player slots, labels, run window or menu texts). */
function formatOne(): Record<string, unknown> {
  const p = JSON.parse(JSON.stringify(newProject({ title: "Old game", players: 2 }))) as Record<string, unknown> & { settings: Record<string, unknown> };
  p.format = 1;
  delete p.settings.actionLabels;
  delete p.settings.runTapMs;
  delete p.settings.playerSlots;
  delete p.settings.credits;
  p.settings.menus = {
    title: { blocks: [{ kind: "text", x: 8, y: 8, text: "HELLO" }], futureField: 7 },
    attract: { demoLevel: "level-1", panels: [] },
    select: { characters: ["willy"] },
    hud: { blocks: [] },
    continue: {},
    gameOver: {},
    highScores: {},
  };
  return p;
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("Game settings: model and migration", () => {
  it("starts new games on format 2 with the defaults", () => {
    const p = newProject({ title: "New", players: 3 });
    expect(p.format).toBe(2);
    expect(PROJECT_FORMAT).toBe(2);
    expect(p.settings.runTapMs).toBe(250);
    expect(p.settings.credits).toBe(DEFAULT_CREDITS);
    expect(p.settings.playerSlots).toEqual([0, 1, 2, 3].map((variant) => ({ character: BUILTIN_HERO, variant })));
    expect(p.settings.menus.title.background).toEqual({ kind: "level", level: "" });
    expect(p.settings.menus.gameOver.background).toEqual({ kind: "solid", color: "#000000" });
  });

  it("migrates a format 1 project and keeps what it had", () => {
    const p = migrateProject(formatOne());
    expect(p.format).toBe(2);
    expect(p.settings.players).toBe(2);
    expect(p.settings.runTapMs).toBe(250);
    expect(p.settings.credits).toBe(DEFAULT_CREDITS);
    expect(playerSlots(p)[0]).toEqual({ character: BUILTIN_HERO, variant: 0 });
    expect(p.settings.menus.title.blocks).toEqual([{ kind: "text", x: 8, y: 8, text: "HELLO" }]);
    expect(p.settings.menus.title.futureField).toBe(7);
    expect(p.settings.menus.title.texts).toEqual({});
    expect(p.settings.menus.title.music).toBe("title");
    expect(p.settings.menus.attract.demoLevel).toBe("level-1");
    expect(p.settings.menus.select.characters).toEqual(["willy"]);
    // the title screen's default title is the game's title
    expect(menuText(p, "title", "title")).toBe("OLD GAME");
  });

  it("repairs bad values while migrating", () => {
    const raw = formatOne() as { settings: Record<string, unknown> };
    raw.settings.runTapMs = 5000;
    raw.settings.playerSlots = [{ character: 3, variant: 9 }, "nope", { character: "vera", variant: 2 }];
    raw.settings.credits = 12;
    const p = migrateProject(raw);
    expect(p.settings.runTapMs).toBe(400);
    expect(p.settings.playerSlots).toEqual([
      { character: BUILTIN_HERO, variant: 0 },
      { character: BUILTIN_HERO, variant: 1 },
      { character: "vera", variant: 2 },
      { character: BUILTIN_HERO, variant: 3 },
    ]);
    expect(p.settings.credits).toBe(DEFAULT_CREDITS);
  });

  it("lists the actions the layout fixes (special = both buttons on captcomm)", () => {
    const slam = actionRows(CPS1.layouts[0]!);
    const capt = actionRows(CPS1.layouts[1]!);
    expect(slam.map((r) => `${r.id}:${r.input}`)).toEqual(["jump:B1", "fire:B2", "special:B3", "run:→ →", "climb:↑ ↓", "start:START", "coin:COIN"]);
    expect(capt.find((r) => r.id === "special")!.input).toBe("B1+B2");
  });
});

describe("Game settings: commands", () => {
  it("bounds the players by the board and undoes the change", () => {
    const store = new EditorStore(newProject({ title: "G", players: 2 }));
    setPlayers(store, 9, 4, "Players");
    expect(store.project.settings.players).toBe(4);
    store.undo();
    expect(store.project.settings.players).toBe(2);
    store.redo();
    expect(store.project.settings.players).toBe(4);
  });

  it("joins the letters typed in one field into one undo step", () => {
    const store = new EditorStore(newProject({ title: "G" }));
    let saves = 0;
    store.onChange(() => saves++);
    for (const text of ["H", "HE", "HEL", "HELL", "HELLO"]) setMenuText(store, "title", "subtitle", text, "Menu text");
    expect(menuText(store.project, "title", "subtitle")).toBe("HELLO");
    expect(saves).toBe(5);
    store.undo();
    expect(menuText(store.project, "title", "subtitle")).toBe("");
    expect(store.canUndo).toBe(false);
    // another field is another step
    setMenuText(store, "title", "subtitle", "A", "Menu text");
    setMenuText(store, "title", "prompt", "B", "Menu text");
    store.undo();
    expect(menuText(store.project, "title", "prompt")).toBe("PUSH START");
    expect(menuText(store.project, "title", "subtitle")).toBe("A");
  });

  it("goes back to a field's default text", () => {
    const store = new EditorStore(newProject({ title: "G" }));
    setMenuText(store, "gameOver", "heading", "YOU LOST", "t");
    expect(menuText(store.project, "gameOver", "heading")).toBe("YOU LOST");
    setMenuText(store, "gameOver", "heading", null, "t");
    expect(menuText(store.project, "gameOver", "heading")).toBe("GAME OVER");
  });

  it("changes a player's character, the DIP switches and the run window", () => {
    const store = new EditorStore(newProject({ title: "G" }));
    setPlayerSlot(store, 1, { character: "vera", variant: 7 }, "c");
    expect(store.project.settings.playerSlots![1]).toEqual({ character: "vera", variant: 3 });
    setDip(store, { difficulty: "lag", lives: 5 }, "dip");
    expect(store.project.settings.dip).toMatchObject({ difficulty: "lag", lives: 5, freePlay: false });
    setRunTap(store, 50, "run");
    expect(store.project.settings.runTapMs).toBe(100);
    expect(runTapFrames(250)).toBe(15);
    expect(runTapFrames(400)).toBe(24);
    store.undo();
    store.undo();
    expect(store.project.settings.dip.difficulty).toBe("normal");
  });
});

describe("Menus: text fits the board", () => {
  it("shares the ROM's 8x8 font", () => {
    expect(Object.keys(GLYPHS)).toHaveLength(50);
    expect(glyphPixels("A", 1, 2)[1]).toEqual([15, 15, 1, 1, 1, 15, 15, 15]);
    expect(unsupportedChars("Hello, world!")).toEqual([]);
    expect(unsupportedChars("Año @ 2026 ñ")).toEqual(["ñ", "@"]);
  });

  it("checks width, safe area and glyphs", () => {
    expect(textProblems("PUSH START", 1)).toEqual({ overflow: false, safe: false, chars: [] });
    expect(textProblems("X".repeat(46), 1)).toMatchObject({ overflow: false, safe: true });
    expect(textProblems("X".repeat(25), 2)).toMatchObject({ overflow: true });
    expect(textProblems("CAFÉ", 1).chars).toEqual(["É"]);
  });

  it("places every screen's lines inside the 48 x 28 text layer by default", () => {
    const p = newProject({ title: "Dead Air", players: 4 });
    for (const id of ["title", "attract", "select", "hud", "continue", "gameOver", "highScores"] as MenuScreenId[]) {
      expect(screenProblems(p, id)).toEqual([]);
      for (const line of screenLines(p, id)) {
        expect(line.col).toBeGreaterThanOrEqual(0);
        expect(line.col + line.text.length * line.scale).toBeLessThanOrEqual(48);
        expect(line.row + line.scale).toBeLessThanOrEqual(28);
      }
    }
    expect(screenLines(p, "title").map((l) => l.text)).toEqual(["DEAD AIR", "PUSH START", "(C) 2026 GO-LINK"]);
    expect(screenLines(p, "select").filter((l) => l.field === "slots").map((l) => l.text)).toEqual(["1P WILLY", "2P RECRUIT", "3P RECRUIT", "4P RECRUIT"]);
  });

  it("keeps the HUD's join prompt inside each player's slot", () => {
    const four = newProject({ title: "G", players: 4 });
    expect(menuText(four, "hud", "join")).toBe("START");
    expect(menuText(newProject({ title: "G", players: 2 }), "hud", "join")).toBe("PRESS START");
    four.settings.menus.hud.texts = { join: "PRESS START" };
    expect(screenProblems(four, "hud")).toEqual([{ kind: "overflow", field: "join", width: 11 }]);
  });

  it("finds a title too wide for the screen", () => {
    const p = newProject({ title: "A very long game title that goes on" });
    expect(screenProblems(p, "title")).toEqual([{ kind: "overflow", field: "title", width: 70 }]);
  });
});

describe("Game settings: live rules", () => {
  it("has no issues for a new game", () => {
    expect(gameIssues(newProject({ title: "Clean", players: 4 }))).toEqual([]);
  });

  it("warns about a missing character only for active players", () => {
    const p = newProject({ title: "G", players: 2 });
    p.settings.playerSlots![1] = { character: "deleted-hero", variant: 1 };
    p.settings.playerSlots![3] = { character: "", variant: 3 };
    const issues = gameIssues(p);
    expect(issues.map((i) => i.id)).toEqual(["game.character"]);
    expect(issues[0]!.params).toEqual({ n: 2 });
    expect(issues[0]!.target).toEqual({ tab: "game", player: 2 });
  });

  it("warns about an empty title, an empty game over and letters the font lacks", () => {
    const p = newProject({ title: "G" });
    p.settings.menus.title.texts = { title: "" };
    p.settings.menus.gameOver.texts = { heading: "", line: "¡PERDISTE!" };
    p.settings.players = 6;
    const issues = gameIssues(p);
    const ids = issues.map((i: ValidationIssue) => `${i.severity}:${i.id}`);
    expect(ids).toContain("error:game.players");
    expect(ids).toContain("warning:menus.title");
    expect(ids).toContain("warning:game.menus");
    const glyphs = issues.find((i) => i.id === "menus.glyphs")!;
    expect(glyphs.params).toMatchObject({ screen: "gameOver", field: "line", chars: "¡" });
    expect(issueTextIn(glyphs, "en")).toBe("Game over: the line line uses letters the board's font does not have: ¡");
    expect(issueTextIn(glyphs, "es")).toBe("Fin del juego: la línea línea usa letras que la fuente de la placa no tiene: ¡");
  });
});

describe("Play mode: the Game tab's rules", () => {
  function flat(): LevelView {
    const cols = 64;
    const rows = 28;
    const tags = new Uint8Array(cols * rows);
    for (let c = 0; c < cols; c++) for (let r = 25; r < rows; r++) tags[r * cols + c] = Tag.Solid;
    return { name: "t", width: cols * 16, height: rows * 16, tags, objects: [{ name: "p1", type: "player_start", x: 64, y: 400, player: 1 }] };
  }
  const tapGap = (g: Game, gap: number) => {
    g.step([Input.Right, 0, 0, 0]);
    for (let f = 0; f < gap; f++) g.step([0, 0, 0, 0]);
    g.step([Input.Right, 0, 0, 0]);
    return g.players[0]!.running;
  };

  it("runs on a double tap within the game's window", () => {
    expect(tapGap(new Game(flat()), 20)).toBe(false);
    expect(tapGap(new Game(flat(), { runTapFrames: runTapFrames(400) }), 20)).toBe(true);
  });

  it("reads both buttons together as the special on a 2-button layout", () => {
    expect(comboSpecial(Input.B1 | Input.B2 | Input.Right)).toBe(Input.B3 | Input.Right);
    expect(comboSpecial(Input.B1)).toBe(Input.B1);
  });
});

describe("Your controller: names", () => {
  it("names keys and buttons the way the controller prints them", () => {
    expect(keyLabel("KeyZ")).toBe("Z");
    expect(keyLabel("ArrowLeft")).toBe("←");
    expect(keyLabel("ShiftLeft")).toBe("Shift Left");
    const fallback = (n: number) => `Button ${n}`;
    expect(padButtonLabel(0, buttonNames("dualsense"), fallback)).toBe("✕");
    expect(padButtonLabel(2, buttonNames("xboxseries"), fallback)).toBe("X");
    expect(padButtonLabel(19, buttonNames("generic"), fallback)).toBe("Button 19");
  });
});

describe("Game and Menus tabs", () => {
  it("keeps the same texts in every language", () => {
    expect(shape(gameEs)).toEqual(shape(gameEn));
    expect(shape(gamePt)).toEqual(shape(gameEn));
    expect(shape(menusEs)).toEqual(shape(menusEn));
    expect(shape(menusPt)).toEqual(shape(menusEn));
  });

  function mount(project: Project, ui: (store: EditorStore, version: number) => React.ReactElement, lang: "en" | "es" = "en") {
    const store = new EditorStore(project);
    const view = render(<LangProvider value={lang}>{ui(store, 0)}</LangProvider>);
    const rerender = () => act(() => view.rerender(<LangProvider value={lang}>{ui(store, store.version)}</LangProvider>));
    store.subscribe(rerender);
    return { store, view };
  }

  it("renders the Game tab and edits players, labels, characters and switches", () => {
    const project = newProject({ title: "G", players: 2 });
    let gone: unknown = null;
    const { store } = mount(project, (s) => <GameScreen store={s} project={s.project} issues={gameIssues(s.project)} onGo={(t) => (gone = t)} />);
    expect(screen.getByRole("heading", { name: "Players and buttons" })).toBeInTheDocument();
    expect(screen.getByText(/takes up to 4 players with 3 buttons/)).toBeInTheDocument();
    expect(screen.getByText("B3")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Players" })).getByRole("radio", { name: "3" }));
    expect(store.project.settings.players).toBe(3);
    fireEvent.change(screen.getByLabelText("Label for Jump"), { target: { value: "Hop" } });
    expect(store.project.settings.actionLabels).toEqual({ jump: "Hop" });
    fireEvent.change(screen.getByLabelText("Character of player 2"), { target: { value: BUILTIN_HERO } });
    fireEvent.change(screen.getByLabelText("Shirt of player 2"), { target: { value: "2" } });
    expect(store.project.settings.playerSlots![1]).toEqual({ character: BUILTIN_HERO, variant: 2 });
    fireEvent.click(screen.getByRole("radio", { name: "Lag" }));
    expect(store.project.settings.dip.difficulty).toBe("lag");
    expect(screen.getByRole("heading", { name: "Your controller" })).toBeInTheDocument();
    expect(screen.getByText("No problems in the game settings or the menus.")).toBeInTheDocument();
    // a deleted character becomes a warning with "Go to"
    act(() => store.editSettings("x", (s) => void (s.playerSlots![0] = { character: "gone", variant: 0 })));
    expect(screen.getByText("Player 1 has no character.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(gone).toEqual({ tab: "game", player: 1 });
  });

  it("shows the special as both buttons on a 2-button layout", () => {
    const project = newProject({ title: "G", layout: "captcomm" });
    mount(project, (s) => <GameScreen store={s} project={s.project} issues={[]} onGo={() => undefined} />);
    expect(screen.getByText("B1+B2")).toBeInTheDocument();
    expect(screen.getByText(/the special is both buttons pressed together/)).toBeInTheDocument();
  });

  it("assigns a keyboard key to an action and resets to go-link defaults", () => {
    mount(newProject({ title: "G" }), (s) => <GameScreen store={s} project={s.project} issues={[]} onGo={() => undefined} />);
    fireEvent.click(screen.getByRole("radio", { name: "Keyboard" }));
    fireEvent.click(screen.getByRole("button", { name: "Assign B1" }));
    expect(screen.getByText("Press a key…")).toBeInTheDocument();
    fireEvent.keyDown(window, { code: "KeyJ" });
    const saved = JSON.parse(window.localStorage.getItem("go-link.input")!) as { keyboard: Record<string, string> };
    expect(saved.keyboard.KeyJ).toBe("b1");
    expect(Object.values(saved.keyboard).filter((a) => a === "b1")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /go-link defaults/ }));
    const reset = JSON.parse(window.localStorage.getItem("go-link.input")!) as { keyboard: Record<string, string> };
    expect(reset.keyboard.KeyJ).toBeUndefined();
    fireEvent.click(screen.getByRole("radio", { name: "Touch" }));
    fireEvent.click(screen.getByRole("radio", { name: "Always" }));
    expect(window.localStorage.getItem("go-link.wm.touchpad")).toBe("on");
  });

  it("renders the Menus tab, edits a screen's text and shows the fit checks", () => {
    const project = newProject({ title: "Dead Air" });
    let current: MenuScreenId = "title";
    const { store } = mount(project, (s, v) => (
      <MenusScreen store={s} project={s.project} version={v} screen={current} onScreen={(id) => (current = id)} issues={gameIssues(s.project)} onGo={() => undefined} />
    ));
    expect(screen.getByRole("img", { name: "Preview of the Title screen at 384 × 224" })).toBeInTheDocument();
    const title = screen.getByLabelText(/^Title/) as HTMLInputElement;
    expect(title.value).toBe("DEAD AIR");
    expect(screen.getAllByText("Fits the screen and the font.").length).toBeGreaterThan(0);
    fireEvent.change(title, { target: { value: "DEAD @IR" } });
    expect(menuText(store.project, "title", "title")).toBe("DEAD @IR");
    expect(screen.getByText("Not in the font: @")).toBeInTheDocument();
    expect(screen.getByText(/Title: the title line uses letters the board's font does not have: @/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Default" })[0]!);
    expect(menuText(store.project, "title", "title")).toBe("DEAD AIR");
    fireEvent.click(screen.getByRole("radio", { name: "Solid color" }));
    expect(store.project.settings.menus.title.background).toEqual({ kind: "solid", color: "#000000" });
    fireEvent.change(screen.getByLabelText("Music"), { target: { value: "boss" } });
    expect(store.project.settings.menus.title.music).toBe("boss");
    fireEvent.change(screen.getByLabelText("Credits line (every screen)"), { target: { value: "(C) 2026 ME" } });
    expect(store.project.settings.credits).toBe("(C) 2026 ME");
    fireEvent.click(screen.getByRole("tab", { name: "Game over" }));
    expect(current).toBe("gameOver");
  });

  it("speaks Spanish", () => {
    mount(newProject({ title: "G" }), (s, v) => <MenusScreen store={s} project={s.project} version={v} screen="highScores" onScreen={() => undefined} issues={[]} onGo={() => undefined} />, "es");
    expect(screen.getByRole("heading", { name: "Menús y pantallas" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Récords" })).toHaveAttribute("aria-selected", "true");
  });

  it("opens from the IDE, and the Build warnings link to the Game tab", async () => {
    const p = newProject({ title: "Linked", players: 2 });
    p.settings.playerSlots![0] = { character: "gone", variant: 0 };
    saveProject(p);
    render(<WillyMakerApp lang="en" projectId={p.id} />);
    const row = (await screen.findByText("Player 1 has no character.")).closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Go" }));
    expect(await screen.findByRole("heading", { name: "Players and buttons" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Menus" }));
    expect(await screen.findByRole("heading", { name: "Menus and screens" })).toBeInTheDocument();
  });
});
