// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The automatic demo: a level made in front of you, in six steps, with the
// editor's own menus, tools and picker driven by a pretend cursor that
// finds the buttons by their translated text. It works on a throwaway game
// (never saved), and ends playing it with the real play mode: a little bot
// joins, walks right, jumps the gaps and the hazard, and fires.

import { findZone, LiveEdit } from "../../editor/zoneOps";
import type { EditorStore } from "../../editor/store";
import type { GameSnapshot } from "../../engine";
import type { StudioMessages } from "../../i18n";
import type { ZoneKind } from "../../model";
import { exampleLevel } from "./example";
import type { StageApi } from "./Stage";
import type { PickerTab, StudioUi } from "./state";

export const DEMO_STEPS = 6;

/** Where the demo's bot jumps on the example level (player x, px): the gap, the step up and the hazard. */
export const BOT_JUMPS: readonly (readonly [number, number])[] = [
  [150, 166],
  [314, 334],
  [372, 394],
];
/** Where it fires (at the trooper). */
export const BOT_FIRE = [200, 300] as const;

export interface DemoCursor {
  x: number;
  y: number;
  /** Milliseconds the move takes. */
  t: number;
  down: boolean;
}

export interface DemoHost {
  ui: StudioUi;
  texts: StudioMessages;
  /** The picker cards the demo places, by their translated names. */
  names: { trooper: string; bazooka: string };
  store: () => EditorStore;
  levelId: string;
  stage: () => StageApi | null;
  setCursor: (c: DemoCursor | null) => void;
  /** The example picture, fitted into the demo level. */
  insertBackground: () => Promise<void>;
  openPicker: (tab: PickerTab, at: { x: number; y: number }) => void;
  confirmPicker: () => void;
  play: () => void;
  stop: () => void;
  snapshot: () => GameSnapshot | null;
}

export class Cancelled extends Error {}

/** Runs the demo until it ends or `alive()` turns false. */
export async function runDemo(host: DemoHost, alive: () => boolean): Promise<void> {
  const { ui, texts: t } = host;
  const wait = (ms: number) =>
    new Promise<void>((res, rej) =>
      setTimeout(() => {
        if (alive()) res();
        else rej(new Cancelled());
      }, ms),
    );
  let cursor: DemoCursor = { x: 0, y: 0, t: 0, down: false };
  const move = async (x: number, y: number, ms = 480) => {
    cursor = { x, y, t: ms, down: false };
    host.setCursor(cursor);
    await wait(ms + 80);
  };
  const press = (down: boolean) => {
    cursor = { ...cursor, down, t: 45 };
    host.setCursor(cursor);
  };
  const click = async () => {
    press(true);
    await wait(180);
    press(false);
  };
  const caption = (n: number) => ui.set({ demo: { n, done: false } });
  const toLevel = (x: number, y: number, ms?: number) => {
    const p = host.stage()?.toClient(x, y) ?? { x: 0, y: 0 };
    return move(p.x, p.y, ms);
  };
  /** The first visible element under `selector` whose text starts with `text`. */
  const toElement = async (selector: string, text: string, ms?: number) => {
    const el = [...document.querySelectorAll<HTMLElement>(selector)].find((e) => (e.textContent ?? "").trim().startsWith(text) && e.getBoundingClientRect().width > 0);
    if (!el) return;
    const r = el.getBoundingClientRect();
    await move(r.left + Math.min(48, r.width / 2), r.top + r.height / 2, ms);
  };
  const menuAt = (x: number, y: number) => {
    const p = host.stage()?.toClient(x, y) ?? { x: 0, y: 0 };
    ui.set({ menu: { x: p.x, y: p.y, target: { kind: "canvas", at: { x, y }, ref: null } } });
  };
  const place = async (tab: PickerTab, menuLabel: string, cardName: string, x: number, y: number) => {
    await toLevel(x, y);
    await click();
    menuAt(x, y);
    await wait(500);
    await toElement("[role=menu] button", menuLabel);
    await click();
    ui.set({ menu: null });
    host.openPicker(tab, { x, y });
    await wait(650);
    const card = [...document.querySelectorAll<HTMLElement>(".studio-pick-card")].find((e) => (e.querySelector(".studio-pick-name")?.textContent ?? "") === cardName);
    await toElement(".studio-pick-card", card ? (card.textContent ?? "").trim() : cardName);
    await click();
    card?.click();
    await wait(420);
    await toElement(".studio-picker .btn-primary", t.picker.place);
    await click();
    host.confirmPicker();
    await wait(700);
  };

  // a clean stage: tools in full, the select tool, the level in view
  ui.set({ leftHidden: false, leftCompact: false, rightHidden: false, tool: "select", sel: null, menu: null, picker: null, keysOpen: false, showLabels: true });
  await wait(80);
  host.stage()?.fit();
  await wait(120);
  const start = host.stage()?.toClient(60, 60) ?? { x: 0, y: 0 };
  cursor = { x: start.x, y: start.y, t: 0, down: false };
  host.setCursor(cursor);

  caption(1);
  await wait(500);
  await toLevel(240, 110);
  await click();
  menuAt(240, 110);
  await wait(600);
  await toElement("[role=menu] button", t.menu.insertBackground);
  await click();
  ui.set({ menu: null });
  await host.insertBackground();
  ui.set({ sel: { kind: "bg" } });
  await wait(1000);

  caption(2);
  await toElement(".studio-left .studio-row", t.tools.zone);
  await click();
  ui.set({ tool: "zone", sel: null });
  await wait(300);
  const example = exampleLevel("demo", "", t.exampleGroups).zones!;
  for (const kind of ["floor", "platform", "ladder", "crate", "hazard"] as ZoneKind[]) {
    await toElement(".studio-options .studio-chip", t.zoneKinds[kind].name, 380);
    await click();
    ui.set({ zoneKind: kind });
    for (const z of example.filter((x) => x.kind === kind)) {
      await toLevel(z.x + 1, z.y + 1, 380);
      press(true);
      const edit = new LiveEdit(host.store(), host.levelId, t.undoLabels.drawZone);
      edit.change((lv) => {
        lv.zones = [...(lv.zones ?? []), { ...z, w: 16, h: 16 }];
      });
      ui.set({ sel: { kind: "zone", id: z.id } });
      const steps = 8;
      for (let i = 1; i <= steps; i++) {
        const w = Math.max(16, Math.round((z.w * i) / steps / 16) * 16);
        const h = Math.max(16, Math.round((z.h * i) / steps / 16) * 16);
        edit.change((lv) => {
          const zone = findZone(lv, z.id);
          if (zone) Object.assign(zone, { w, h });
        });
        const p = host.stage()?.toClient(z.x + w, z.y + h) ?? { x: 0, y: 0 };
        cursor = { x: p.x, y: p.y, t: 45, down: true };
        host.setCursor(cursor);
        await wait(50);
      }
      edit.commit();
      press(false);
      await wait(140);
    }
  }
  ui.set({ sel: null, tool: "select" });

  caption(3);
  await place("heroes", t.menu.placeCharacter, t.player(1, "Willy"), 112, 224);
  caption(4);
  await place("enemies", t.menu.placeEnemy, host.names.trooper, 272, 240);
  await place("objects", t.menu.placeObject, host.names.bazooka, 184, 128);
  ui.set({ sel: null });

  caption(5);
  await toElement(".studio-header .btn-primary", t.play);
  await click();
  host.setCursor(null);
  host.play();
  await wait(900);
  await bot(host, wait, alive);
  await wait(1400);
  host.stop();
  ui.set({ demo: { n: DEMO_STEPS, done: true } });
}

/** Plays the demo level: joins, holds right, jumps the gap, the step up and the hazard, and fires. */
async function bot(host: DemoHost, wait: (ms: number) => Promise<void>, alive: () => boolean): Promise<void> {
  const key = (code: string, down: boolean) => window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, key: code, bubbles: true }));
  const tap = async (code: string) => {
    key(code, true);
    await wait(120);
    key(code, false);
  };
  try {
    await tap("Enter");
    await wait(400);
    key("ArrowRight", true);
    for (let i = 0; i < 160 && alive(); i++) {
      const s = host.snapshot();
      if (s?.outcome === "cleared") break;
      const p = s?.players.find((x) => x.active);
      if (p && BOT_JUMPS.some(([a, b]) => p.x >= a && p.x <= b)) await tap("KeyZ");
      else if (p && p.x > BOT_FIRE[0] && p.x < BOT_FIRE[1] && i % 3 === 0) await tap("KeyX");
      else await wait(100);
    }
  } finally {
    for (const code of ["ArrowRight", "KeyZ", "KeyX", "Enter"]) key(code, false);
  }
}
