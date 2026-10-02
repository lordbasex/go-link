// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { coreEn } from "../i18n/core.en";
import { coreEs } from "../i18n/core.es";
import { corePt } from "../i18n/core.pt";
import { exportEn } from "../i18n/export.en";
import { exportEs } from "../i18n/export.es";
import { LangProvider } from "../i18n";
import { newProject, objectLayer, tagGrid, TAG_NUMBER, type LevelObject } from "../model";
import { Game, Input, type LevelView } from "../engine";
import { EditorStore } from "./store";
import { BOSS_KINDS, CIVILIAN_KINDS, CRATE_CONTENTS, ENEMY_KINDS, PARTS, PICKUP_ITEMS } from "./parts";
import { objectSupport, optionSupport, partSupport, SUPPORT } from "./support";
import { checkText, reviewProject } from "./validate";
import { Inspector, PartsPalette } from "../ui/organisms/Panels";
import { PIECE_PARTS } from "../play/PlayView";

afterEach(cleanup);

describe("parts the engine plays (editor/support.ts)", () => {
  it("has an entry for every part and every inspector option", () => {
    for (const p of PARTS) expect(SUPPORT[p.id], p.id).toBeDefined();
    for (const i of PICKUP_ITEMS) expect(SUPPORT[`item:${i}`], i).toBeDefined();
    for (const c of CRATE_CONTENTS) expect(SUPPORT[`contents:${c}`], c).toBeDefined();
    for (const k of ENEMY_KINDS) expect(SUPPORT[`enemy:${k}`], k).toBeDefined();
    for (const k of BOSS_KINDS) expect(SUPPORT[`boss:${k}`], k).toBeDefined();
    for (const k of CIVILIAN_KINDS) expect(SUPPORT[`civilian:${k}`], k).toBeDefined();
    for (const id of Object.values(PIECE_PARTS)) expect(SUPPORT[id], id).toBeDefined();
  });

  it("gives every part that is not in the game a reason in every language", () => {
    for (const [id, s] of Object.entries(SUPPORT)) {
      if (s.status === "works") continue;
      expect(s.reason, id).toBeDefined();
      for (const t of [coreEn, coreEs, corePt]) expect(t.support.reasons[s.reason!], id).toMatch(/\w/);
    }
  });

  it("marks what the engine ignores today", () => {
    expect(partSupport("pickup:bazooka").status).toBe("works");
    for (const i of ["flamethrower", "spread", "grenades", "health", "lattenza_page"]) expect(optionSupport("item", i).status, i).toBe("soon");
    expect(optionSupport("contents", "civilian").status).toBe("soon");
    expect(optionSupport("contents", "nothing").status).toBe("works");
    expect(partSupport("boss:gunship").status).toBe("soon");
    expect(partSupport("checkpoint:checkpoint").status).toBe("soon");
    expect(partSupport("tag:water").status).toBe("soon");
    expect(partSupport("enemy:shield_trooper")).toEqual({ status: "works", shared: true });
    expect(partSupport("dip:difficulty").status).toBe("rom-only");
    expect(partSupport("dip:lives").status).toBe("works");
    expect(objectSupport({ name: "c", type: "crate", x: 0, y: 0, contents: "health" }).reason).toBe("health");
  });

  it("agrees with the engine: the bazooka arms a player, the flamethrower does nothing", () => {
    const level = (item: string): LevelView => {
      const cols = 40;
      const rows = 20;
      const tags = new Array(cols * rows).fill(0);
      for (let c = 0; c < cols; c++) tags[19 * cols + c] = 1;
      const objects: LevelObject[] = [
        { name: "p1", type: "player_start", x: 64, y: 304, player: 1 },
        { name: "k", type: "pickup", x: 64, y: 304, item },
      ];
      return { width: cols * 16, height: rows * 16, tags, objects } as unknown as LevelView;
    };
    const armed = new Game(level("bazooka"));
    armed.step([0]);
    expect(armed.players[0]!.special).toBe("bazooka");
    const flame = new Game(level("flamethrower"));
    flame.step([0]);
    expect(flame.pickups[0]!.live).toBe(false);
    expect(flame.players[0]!.special).toBe("");
    flame.step([Input.B3]);
    expect(flame.players[0]!.rocket).toBeNull();
  });
});

describe("level 1: part.soon and part.shared", () => {
  const project = () => {
    const p = newProject({ title: "Soon", players: 1 });
    objectLayer(p.levels[0]!).items.push(
      { name: "flame", type: "pickup", x: 100, y: 192, item: "flamethrower" },
      { name: "box", type: "crate", x: 160, y: 176, contents: "health" },
      { name: "cp", type: "checkpoint", x: 200, y: 192 },
      { name: "e1", type: "enemy", x: 260, y: 192, kind: "trooper" },
      { name: "e2", type: "enemy", x: 300, y: 192, kind: "spinner" },
    );
    return p;
  };

  it("warns once per object with a part that is coming soon, and never blocks the export", () => {
    const r = reviewProject(project());
    const soon = r.checks.filter((c) => c.id === "part.soon");
    expect(soon.map((c) => c.severity)).toEqual(["warning", "warning", "warning"]);
    expect(soon.map((c) => c.target)).toEqual([
      { tab: "build", level: "level-1", x: 100, y: 192, object: "flame" },
      { tab: "build", level: "level-1", x: 160, y: 176, object: "box" },
      { tab: "build", level: "level-1", x: 200, y: 192, object: "cp" },
    ]);
    expect(checkText(exportEn, soon[0]!)).toBe("Level 1: flame. The flamethrower has no effect in the game yet.");
    expect(checkText(exportEs, soon[0]!)).toBe("Level 1: flame. El lanzallamas todavía no tiene efecto en el juego.");
    expect(r.errors).toBe(0);
    expect(r.ready).toBe(true);
  });

  it("notes once per level that every enemy kind plays the same way", () => {
    const shared = reviewProject(project()).checks.filter((c) => c.id === "part.shared");
    expect(shared).toHaveLength(1);
    expect(shared[0]!.severity).toBe("info");
    expect(checkText(exportEn, shared[0]!)).toBe("Level 1: 2 enemies (Trooper, Spinner) all walk, chase and shoot the same way for now.");
  });

  it("warns about water and passes a level of working parts", () => {
    const p = newProject({ title: "Dry", players: 1 });
    expect(reviewProject(p).checks.find((c) => c.id === "part.soon")).toMatchObject({ severity: "ok" });
    const g = tagGrid(p.levels[0]!);
    g.set(5, 10, TAG_NUMBER.water);
    g.commit();
    expect(reviewProject(p).checks.find((c) => c.id === "part.soon")).toMatchObject({ severity: "warning", params: { name: "water", reason: "water" } });
  });
});

describe("the editor shows parts that are coming soon", () => {
  it("badges them in the parts grid, with the reason as the tooltip", () => {
    const p = newProject({ title: "Grid", players: 1 });
    render(
      <LangProvider value="en">
        <PartsPalette partId={null} onPart={() => {}} level={p.levels[0]!} activeLayerId="objects" images={new Map()} />
      </LangProvider>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Objects" }));
    const flame = screen.getByRole("button", { name: /Flamethrower/ });
    expect(flame).toHaveTextContent("Coming soon");
    expect(flame).toHaveAttribute("title", "The flamethrower has no effect in the game yet.");
    expect(screen.getByRole("button", { name: /Bazooka/ })).not.toHaveTextContent("Coming soon");
  });

  it("marks the options and the chosen one in the inspector", () => {
    const p = newProject({ title: "Inspect", players: 1 });
    objectLayer(p.levels[0]!).items.push({ name: "flame", type: "pickup", x: 100, y: 192, item: "flamethrower" });
    const store = new EditorStore(p);
    render(
      <LangProvider value="en">
        <Inspector store={store} level={p.levels[0]!} selected="flame" cell={null} onSelect={() => {}} />
      </LangProvider>,
    );
    const select = screen.getByRole("combobox", { name: "Item" });
    expect(within(select).getByRole("option", { name: "Bazooka" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Flamethrower · Coming soon" })).toBeInTheDocument();
    expect(select.parentElement).toHaveTextContent("Coming soon: The flamethrower has no effect in the game yet.");
  });
});
