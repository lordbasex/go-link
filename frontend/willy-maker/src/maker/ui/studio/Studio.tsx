// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The new editor around one open game (docs/willy-maker/editor.md): the
// header, the tools panel or its rail, the options bar, the canvas, the
// Properties and Layers panel and the footer, full screen. Its UI state
// (StudioUi) has no history; the game is the EditorStore's, with its undo
// and autosave. The Characters, Game, Menus and Export workspaces show the
// screens the classic editor has, in the new look (workspaces.css).

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useCore, useStudioText, type Lang } from "../../i18n";
import { cloneProject, findLevel, newId, newLevel, newProject, objectLayer, reconcileZones, type Level, type LevelObject, type Project, type ValidationIssue, type Zone } from "../../model";
import { EditorStore } from "../../editor/store";
import { gameIssues } from "../../editor/validate/game";
import type { Target } from "../../editor/validate";
import { addGroup, moveObject, placeZone, backgroundLayer, changeObjectPart, clearBackground, deleteGroup, duplicateItem, findObject, findZone, flipObject, groupItem, moveGroup, moveToGroup, patchGroup, patchZone, placeObject, removeItem, setBackgroundFlags, targetGroup, ungroup, type ItemRef } from "../../editor/zoneOps";
import type { MenuScreenId } from "../../game/menus";
import { autosaver, saveProject } from "../../io/storage";
import { ExportView } from "../organisms/ExportView";
import { PromptDialog } from "../organisms/PromptDialog";
import { useProjectImages } from "../useTileImages";
import { importBackground } from "./background";
import { openExample } from "./example";
import { catalog, itemOfObject, roleOf } from "./catalog";
import { LayersPanel } from "./LayersPanel";
import { Footer, type SaveState } from "./Footer";
import { Header } from "./Header";
import { LeftPanel } from "./LeftPanel";
import { Menu, type MenuEntry } from "./Menu";
import { OptionsBar } from "./OptionsBar";
import { RightPanel } from "./RightPanel";
import { boxOf, groupName } from "./select";
import { SpritePicker } from "./SpritePicker";
import { Stage, type StageApi } from "./Stage";
import { PlayStage } from "./PlayStage";
import { ZONE_SWATCH } from "./kinds";
import { firstSteps } from "./steps";
import { nudgeOf, shortcutFor } from "./keys";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { NewGameWizard } from "./NewGameWizard";
import { DemoOverlay } from "./DemoOverlay";
import { Cancelled, runDemo, type DemoCursor, type DemoHost } from "./demo";
import { EXAMPLE_FILE, EXAMPLE_URL, exampleLevel } from "./example";
import { fitBackground, putBackground } from "./background";
import type { GameSnapshot } from "../../engine";
import { PropertiesPanel } from "./PropertiesPanel";
import { drawableKinds, gridColumns, MOD_PREFIX, StudioUi, UiProvider, useUiState, type PickerTab, type StudioTool, type Workspace } from "./state";
import "../modernist.css";
import "./studio.css";
import "./workspaces.css";

const CharactersScreen = lazy(() => import("../../sprites").then((m) => ({ default: m.CharactersScreen })));
const GameScreen = lazy(() => import("../../game").then((m) => ({ default: m.GameScreen })));
const MenusScreen = lazy(() => import("../../game").then((m) => ({ default: m.MenusScreen })));

/** Narrower than this, header buttons show their icon only and the board tag hides. */
const WIDE = 1180;

export interface StudioProps {
  project: Project;
  lang: Lang;
  theme: "dark" | "light";
  onLang?: (lang: Lang) => void;
  onTheme?: (theme: "dark" | "light") => void;
  onHome: () => void;
  /** A game made by the new game wizard (or kept from the demo): save it and open it, with how to start. */
  onCreated: (p: Project, start: StudioStart) => void;
  /** How the editor opens: a workspace, a tool, a note, or the wizard or the demo at once. */
  start?: StudioStart;
  /** A game that is never saved (the demo started from My games): leaving the demo goes back home. */
  scratch?: boolean;
}

export interface StudioStart {
  workspace?: Workspace;
  tool?: StudioTool;
  toast?: string;
  wizard?: boolean;
  demo?: boolean;
}

export function Studio(props: StudioProps) {
  const ui = useMemo(() => {
    const u = new StudioUi({ ...(props.start?.workspace ? { workspace: props.start.workspace } : {}), ...(props.start?.tool ? { tool: props.start.tool } : {}), ...(props.start?.wizard ? { wizard: true } : {}) });
    if (props.start?.toast) u.flash(props.start.toast);
    return u;
    // the editor opens once per game
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => ui.dispose(), [ui]);
  return (
    <UiProvider value={ui}>
      <StudioBody {...props} ui={ui} />
    </UiProvider>
  );
}

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return el.tagName === "INPUT" && !["range", "checkbox", "radio", "button"].includes((el as HTMLInputElement).type);
}

/** Keys inside a dialog (the image AI prompts, the shortcuts list…) belong to it: Space checks a box there, it does not pan. */
function inDialog(el: EventTarget | null): boolean {
  return el instanceof Element && !!el.closest('[role="dialog"], [aria-modal="true"]');
}

/** Tab hides the panels only when the focus is on nothing in particular, so keyboard users can still tab through the controls. */
function onBareFocus(el: EventTarget | null): boolean {
  return !(el instanceof HTMLElement) || el === document.body || el.classList.contains("studio-stage") || el.classList.contains("mdn");
}

/** The background picture's file name, when it came from a file. */
function backgroundFile(p: Project, level: Level): string | null {
  const set = p.tilesets.find((x) => x.id === backgroundLayer(level)?.tileset) as { file?: unknown } | undefined;
  return typeof set?.file === "string" ? set.file : null;
}

/** Zones follow the collision layer the classic editor may have painted (model/zones.ts). */
function withZonesReady(project: Project): Project {
  for (const l of project.levels) reconcileZones(l);
  return project;
}

function StudioBody({ project, lang, theme, onLang, onTheme, onHome, onCreated, start, scratch = false, ui }: StudioProps & { ui: StudioUi }) {
  const t = useStudioText();
  const core = useCore();
  const s = useUiState();
  const mainStore = useMemo(() => new EditorStore(withZonesReady(project)), [project]);
  // the demo works on a game of its own, never saved
  const [demoProject, setDemoProject] = useState<Project | null>(null);
  const demoStore = useMemo(() => (demoProject ? new EditorStore(demoProject) : null), [demoProject]);
  const store = demoStore ?? mainStore;
  const version = useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  const p = store.project;
  const level = findLevel(p, p.levels[0]?.id)!;
  const images = useProjectImages(p);
  const stage = useRef<StageApi>(null);
  const bgInput = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [save, setSave] = useState<SaveState>("saved");
  // the image AI prompts (the classic editor's dialog, in this editor's look)
  const [prompt, setPrompt] = useState(false);
  const promptOpen = useRef(false);
  promptOpen.current = prompt;
  const [wide, setWide] = useState(() => typeof window === "undefined" || window.innerWidth >= WIDE);
  const [menuScreen, setMenuScreen] = useState<MenuScreenId>("title");

  useEffect(() => {
    const on = () => setWide(window.innerWidth >= WIDE);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  // autosave a moment after each change, and before leaving
  const saver = useMemo(() => autosaver(() => setSave(saveProject(mainStore.project).ok ? "saved" : "failed")), [mainStore]);
  useEffect(() => {
    if (scratch) return;
    const off = mainStore.onChange(() => {
      setSave("saving");
      saver.touch();
    });
    const flush = () => saver.flush();
    window.addEventListener("pagehide", flush);
    return () => {
      off();
      window.removeEventListener("pagehide", flush);
      saver.flush();
    };
  }, [mainStore, saver, scratch]);

  // a selection that undo took away is dropped
  useEffect(() => {
    const sel = ui.get().sel;
    if ((sel?.kind === "zone" && !findZone(level, sel.id)) || (sel?.kind === "object" && !findObject(level, sel.id))) ui.set({ sel: null });
  }, [level, version, ui]);

  const steps = useMemo(
    () => firstSteps(level, s.played),
    // the version says when the level changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [level, version, s.played],
  );
  const kinds = useMemo(
    () => drawableKinds((level.zones ?? []).some((z) => z.kind === "water")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [level, version],
  );
  const issues = useMemo(
    () => gameIssues(p),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p, version],
  );
  const items = useMemo(
    () => catalog(p, { objects: core.objects, kinds: core.kinds, player: t.player }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p, version, core, t],
  );

  const zoneLabel = useCallback((z: Zone) => z.name ?? t.zoneName(t.zoneKinds[z.kind].name, z.n), [t]);
  // an object's shown name: the one the user typed (`label`), else its sprite's
  const nameOf = useCallback((o: LevelObject) => (typeof o.label === "string" && o.label ? o.label : (itemOfObject(items, o)?.name ?? o.name)), [items]);
  const objectName = useCallback(
    (name: string) => {
      const o = findObject(level, name);
      return o ? nameOf(o) : name;
    },
    [level, nameOf],
  );
  const objectLabel = useCallback(
    (name: string) => {
      const o = findObject(level, name);
      return o ? `${nameOf(o)} · ${t.roles[roleOf(o)]}` : name;
    },
    [level, nameOf, t],
  );
  const newGroup = () => {
    const id = addGroup(store, level.id, t.groupUndo.newGroup);
    ui.set({ activeGroup: id, renaming: { kind: "group", id }, menu: null });
  };
  const groupSelected = (ref: ItemRef) => {
    const id = groupItem(store, level.id, ref, t.groupUndo.group);
    ui.set({ activeGroup: id, renaming: { kind: "group", id } });
  };
  const rename = (ref: ItemRef) => {
    if (ref.kind === "bg") return;
    ui.set({ rightHidden: false, renaming: { kind: ref.kind, id: ref.id } });
  };

  const play = () => {
    saver.flush();
    ui.set({ playing: true, played: true, menu: null, viewMenu: false, sel: null });
  };
  const stop = () => ui.set({ playing: false });

  const pickBackground = () => bgInput.current?.click();
  const setBackground = async (file: File) => {
    ui.flash(t.toast.fitting);
    const r = await importBackground(store, level.id, file, t.undoLabels.background);
    if (r === "ok") {
      ui.set({ sel: { kind: "bg" } });
      ui.flash(t.toast.bgReady);
    } else ui.flash(r === "not-image" ? t.toast.notImage : t.toast.bgFailed);
  };
  const useExample = async () => {
    const ok = await openExample(store, level.id, t.undoLabels.example, t.exampleGroups);
    if (!ok) {
      ui.flash(t.toast.bgFailed);
      return;
    }
    ui.set({ sel: null });
    requestAnimationFrame(() => stage.current?.fit());
  };

  const openPicker = (mode: "place" | "change", tab: PickerTab, at: { x: number; y: number } | null, object?: string) => {
    const o = object ? findObject(level, object) : undefined;
    ui.set({ menu: null, picker: { mode, tab, at, object, chosen: o ? (itemOfObject(items, o)?.id ?? null) : null } });
  };
  const confirmPicker = (id?: string) => {
    const pk = ui.get().picker;
    const it = items.find((x) => x.id === (id ?? pk?.chosen));
    if (!pk || !it) return;
    ui.set({ picker: null });
    if (pk.mode === "change" && pk.object) {
      changeObjectPart(store, level.id, pk.object, it.part, t.undoLabels.sprite);
      return;
    }
    const at = pk.at ?? stage.current?.center() ?? { x: level.size.w / 2, y: level.size.h / 2 };
    const g = ui.get().grid;
    const name = placeObject(store, level.id, it.part, Math.round(at.x / g) * g, Math.round(at.y / g) * g, targetGroup(level, "objects", ui.get().activeGroup), t.undoLabels.place);
    ui.set({ sel: { kind: "object", id: name }, tool: "select" });
    if (it.role === "hero") ui.flash(t.toast.heroPlaced);
  };

  const duplicate = (ref: ItemRef) => {
    const o = ref.kind === "object" ? findObject(level, ref.id) : null;
    if (o && (o.type === "player_start" || o.type === "exit")) {
      ui.flash(t.toast.oneStart);
      return;
    }
    const out = duplicateItem(store, level.id, ref, ui.get().grid, t.undoLabels.duplicate);
    if (out) ui.set({ sel: out });
  };
  const remove = (ref: ItemRef) => {
    removeItem(store, level.id, ref, t.undoLabels.delete);
    ui.set({ sel: null });
  };

  // the automatic demo (demo.ts): a throwaway game, the real menus and tools, a pretend cursor
  const [demoCursor, setDemoCursor] = useState<DemoCursor | null>(null);
  const demoRun = useRef(0);
  // a run stops when the editor goes away (React may unmount and mount again: the flag follows)
  const unmounted = useRef(false);
  const lastSnap = useRef<GameSnapshot | null>(null);
  const demoHost = useRef<Partial<DemoHost>>({});
  const stopDemo = () => {
    demoRun.current++;
    setDemoCursor(null);
    ui.set({ demo: null, playing: false, menu: null, picker: null, sel: null });
    setDemoProject(null);
  };
  /** Exit: a demo started from My games goes back there. */
  const exitDemo = () => {
    stopDemo();
    if (scratch) onHome();
  };
  const startDemo = () => {
    const run = ++demoRun.current;
    const dp = newProject({ title: t.demoTour.gameTitle, players: 1 });
    const lv = newLevel({ id: "level-1", name: t.wizard.levelName, w: 480, h: 272, floor: false, players: 0 });
    lv.groups = exampleLevel("x", "", t.exampleGroups).groups;
    lv.zones = [];
    objectLayer(lv).items = [{ name: "exit", type: "exit", x: 448, y: 144, w: 32, h: 128 }];
    dp.levels = [lv];
    dp.settings.levels = [lv.id];
    setDemoProject(dp);
    ui.set({ wizard: false, playing: false, demo: { n: 1, done: false }, menu: null, picker: null, sel: null });
    // the demo store exists after this render (a timer, not an animation frame: those wait while the window is hidden)
    setTimeout(() => {
      const alive = () => demoRun.current === run && !unmounted.current;
      if (!alive()) return;
      void runDemo(demoHost.current as DemoHost, alive).catch((e) => {
        if (e instanceof Cancelled) return;
        // a broken run ends the demo instead of leaving it stuck
        console.error(e);
        stopDemo();
      });
    }, 0);
  };
  demoHost.current = {
    ui,
    texts: t,
    names: { trooper: core.kinds.trooper ?? "trooper", bazooka: core.kinds.bazooka ?? "bazooka" },
    store: () => store,
    levelId: level.id,
    stage: () => stage.current,
    setCursor: setDemoCursor,
    insertBackground: async () => {
      const res = await fetch(EXAMPLE_URL);
      const file = new File([await res.blob()], EXAMPLE_FILE, { type: "image/png" });
      const lv = store.level(level.id)!;
      const fitted = await fitBackground(lv, file, false);
      store.editProject(t.undoLabels.background, (pr) => putBackground(pr, fitted, EXAMPLE_FILE));
    },
    openPicker: (tab, at) => openPicker("place", tab, at),
    confirmPicker: () => confirmPicker(),
    play,
    stop,
    snapshot: () => lastSnap.current,
  };
  useEffect(() => {
    unmounted.current = false;
    if (start?.demo) startDemo();
    return () => void (unmounted.current = true);
    // once, when the editor opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keyboard: the shortcut table (keys.ts) and Space held to pan; never while typing or in a dialog
  const keys = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keys.current = (e: KeyboardEvent) => {
    const st = ui.get();
    if (isTyping(e.target) || inDialog(e.target) || promptOpen.current || st.picker || st.keysOpen || st.wizard) return;
    if (st.demo) {
      if (e.key === "Escape") exitDemo();
      return;
    }
    const onLevel = st.workspace === "level";
    if (e.key === " " && onLevel && !st.playing && !e.metaKey && !e.ctrlKey) {
      // a held Space pans; the button under the focus must not click
      e.preventDefault();
      if (!st.spacePan) ui.set({ spacePan: true });
      return;
    }
    const action = shortcutFor(e);
    if (!action) return;
    const sel = st.sel && st.sel.kind !== "bg" ? st.sel : null;
    const done = () => e.preventDefault();
    switch (action) {
      case "cancel":
        if (st.menu || st.viewMenu) ui.set({ menu: null, viewMenu: false });
        else if (st.playing) stop();
        else if (st.renaming) ui.set({ renaming: null });
        return;
      case "list":
        done();
        ui.set({ keysOpen: true, menu: null, viewMenu: false });
        return;
      case "playStop":
        done();
        if (st.playing) stop();
        else play();
        return;
      case "bothPanels":
      case "rightPanel":
        if (e.key === "Tab" && !onBareFocus(e.target)) return;
        done();
        if (action === "bothPanels") ui.togglePanels();
        else ui.set({ rightHidden: !st.rightHidden });
        return;
      case "leftPanel":
        done();
        ui.set({ leftHidden: !st.leftHidden });
        return;
      case "grid":
        done();
        ui.set({ showGrid: !st.showGrid });
        return;
      case "undo":
        done();
        if (!st.playing) store.undo();
        return;
      case "redo":
        done();
        if (!st.playing) store.redo();
        return;
    }
    if (!onLevel || st.playing) return;
    switch (action) {
      case "zoomIn":
      case "zoomOut":
        done();
        stage.current?.zoomBy(action === "zoomOut" ? 1 / 1.25 : 1.25);
        return;
      case "fit":
        done();
        stage.current?.fit();
        return;
      case "actual":
        done();
        stage.current?.zoomTo(1);
        return;
      case "background":
        done();
        pickBackground();
        return;
      case "newGroup":
        done();
        newGroup();
        return;
      case "tool:select":
      case "tool:zone":
      case "tool:erase":
      case "tool:hand":
        ui.set({ tool: action.slice(5) as StudioTool });
        return;
      case "zoneKind": {
        const n = Number(e.key);
        if (st.tool === "zone" && n >= 1 && n <= kinds.length) ui.set({ zoneKind: kinds[n - 1]! });
        return;
      }
    }
    if (!sel) return;
    switch (action) {
      case "duplicate":
        done();
        duplicate(sel);
        return;
      case "group":
        done();
        groupSelected(sel);
        return;
      case "rename":
        done();
        rename(sel);
        return;
      case "delete":
        done();
        remove(sel);
        return;
      case "nudge": {
        done();
        if (sel.kind === "zone") {
          const z = findZone(level, sel.id);
          const { dx, dy } = nudgeOf(e, 16);
          if (z) placeZone(store, level.id, z.id, { x: z.x + dx, y: z.y + dy }, t.props.nudge, `nudge:${z.id}`);
        } else {
          const o = findObject(level, sel.id);
          const { dx, dy } = nudgeOf(e, o?.type === "crate" ? 16 : st.grid);
          if (o) moveObject(store, level.id, o.name, o.x + dx, o.y + dy, t.props.nudge, `nudge:${o.name}`);
        }
        return;
      }
    }
  };
  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current(e);
    const up = (e: KeyboardEvent) => {
      if (e.key === " " && ui.get().spacePan) ui.set({ spacePan: false });
    };
    const blur = () => ui.get().spacePan && ui.set({ spacePan: false });
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [ui]);

  const kindEntries = (pick: (k: (typeof kinds)[number]) => void, checked: (k: (typeof kinds)[number]) => boolean | undefined, numbered: boolean): MenuEntry[] =>
    kinds.map((k, i) => {
      const c = checked(k);
      return { kind: "item", label: t.zoneKinds[k].name, swatch: ZONE_SWATCH[k], ...(c !== undefined ? { checked: c } : {}), ...(numbered ? { shortcut: String(i + 1) } : {}), onSelect: () => pick(k) };
    });
  const groupEntries = (ref: ItemRef): MenuEntry[] => {
    const own = ref.kind === "zone" ? findZone(level, ref.id)?.group : ref.kind === "object" ? findObject(level, ref.id)?.group : undefined;
    const base = level.groups?.find((g) => g.base === (ref.kind === "zone" ? "zones" : "objects"))?.id;
    return (level.groups ?? []).map((g) => ({ kind: "item", label: groupName(g, t.groupNames), checked: (own ?? base) === g.id, onSelect: () => moveToGroup(store, level.id, ref, g.id, t.groupUndo.moveTo) }));
  };

  const menuEntries = (): MenuEntry[] => {
    const target = s.menu?.target;
    if (!target) return [];
    if (target.kind === "flyZone") return [{ kind: "head", label: t.drawZoneHeading }, ...kindEntries((k) => ui.set({ tool: "zone", zoneKind: k }), (k) => s.tool === "zone" && s.zoneKind === k, true)];
    const bg = backgroundLayer(level);
    const hasBg = steps[0];
    if (target.kind === "flyInsert")
      return [
        { kind: "head", label: t.insertHeading },
        { kind: "item", label: hasBg ? t.insert.replaceBackground : t.insert.background, shortcut: `${MOD_PREFIX}O`, onSelect: pickBackground },
        { kind: "item", label: t.insert.character, onSelect: () => openPicker("place", "heroes", null) },
        { kind: "item", label: t.insert.enemy, onSelect: () => openPicker("place", "enemies", null) },
        { kind: "item", label: t.insert.object, onSelect: () => openPicker("place", "objects", null) },
        { kind: "sep" },
        { kind: "item", label: t.insert.group, shortcut: `⇧${MOD_PREFIX}N`, onSelect: newGroup },
      ];
    if (target.kind === "group") {
      const gs = level.groups ?? [];
      const i = gs.findIndex((x) => x.id === target.id);
      const g = gs[i];
      if (!g) return [];
      const out: MenuEntry[] = [
        { kind: "head", label: t.groupMenu.head(groupName(g, t.groupNames)) },
        { kind: "item", label: t.groupMenu.rename, onSelect: () => ui.set({ renaming: { kind: "group", id: g.id } }) },
        { kind: "item", label: t.groupMenu.newGroup, onSelect: newGroup },
        { kind: "item", label: g.visible ? t.groupMenu.hide : t.groupMenu.show, onSelect: () => patchGroup(store, level.id, g.id, { visible: !g.visible }, t.groupUndo.visibility) },
        { kind: "item", label: g.locked ? t.groupMenu.unlock : t.groupMenu.lock, onSelect: () => patchGroup(store, level.id, g.id, { locked: !g.locked }, t.groupUndo.lock) },
        { kind: "item", label: t.groupMenu.up, disabled: i === 0, onSelect: () => moveGroup(store, level.id, g.id, -1, t.groupUndo.move) },
        { kind: "item", label: t.groupMenu.down, disabled: i === gs.length - 1, onSelect: () => moveGroup(store, level.id, g.id, 1, t.groupUndo.move) },
      ];
      if (!g.base)
        out.push(
          { kind: "sep" },
          { kind: "item", label: t.groupMenu.ungroup, onSelect: () => ungroup(store, level.id, g.id, t.groupUndo.ungroup) },
          {
            kind: "item",
            label: t.groupMenu.delete,
            danger: true,
            onSelect: () => {
              deleteGroup(store, level.id, g.id, t.groupUndo.delete);
              ui.set({ sel: null, activeGroup: null });
            },
          },
        );
      return out;
    }
    const ref = target.ref;
    if (ref?.kind === "zone") {
      const z = findZone(level, ref.id);
      if (!z) return [];
      return [
        { kind: "head", label: t.menu.zoneIs(zoneLabel(z)) },
        ...kindEntries((k) => patchZone(store, level.id, z.id, { kind: k }, t.undoLabels.kind), (k) => z.kind === k, false),
        { kind: "sep" },
        { kind: "item", label: t.menu.rename, shortcut: "F2", onSelect: () => rename(ref) },
        { kind: "item", label: t.menu.duplicate, shortcut: `${MOD_PREFIX}D`, onSelect: () => duplicate(ref) },
        { kind: "item", label: t.menu.group, shortcut: `${MOD_PREFIX}G`, onSelect: () => groupSelected(ref) },
        { kind: "sep" },
        { kind: "head", label: t.menu.moveToGroup },
        ...groupEntries(ref),
        { kind: "sep" },
        { kind: "item", label: t.menu.delete, shortcut: "Del", danger: true, onSelect: () => remove(ref) },
      ];
    }
    if (ref?.kind === "object") {
      const o = findObject(level, ref.id);
      if (!o) return [];
      const it = itemOfObject(items, o);
      return [
        { kind: "head", label: objectLabel(o.name) },
        { kind: "item", label: t.menu.chooseSprite, onSelect: () => openPicker("change", it ? it.tab : "objects", null, o.name) },
        { kind: "item", label: o.facing === "left" ? t.menu.lookRight : t.menu.lookLeft, onSelect: () => flipObject(store, level.id, o.name, t.undoLabels.flip) },
        { kind: "item", label: t.menu.rename, shortcut: "F2", onSelect: () => rename(ref) },
        { kind: "item", label: t.menu.duplicate, shortcut: `${MOD_PREFIX}D`, onSelect: () => duplicate(ref) },
        { kind: "item", label: t.menu.group, shortcut: `${MOD_PREFIX}G`, onSelect: () => groupSelected(ref) },
        { kind: "sep" },
        { kind: "head", label: t.menu.moveToGroup },
        ...groupEntries(ref),
        { kind: "sep" },
        { kind: "item", label: t.menu.delete, shortcut: "Del", danger: true, onSelect: () => remove(ref) },
      ];
    }
    // the background, or nothing: insert here
    const at = target.at;
    const out: MenuEntry[] = [
      { kind: "head", label: t.menu.insertHere },
      { kind: "item", label: hasBg ? t.insert.replaceBackground : t.menu.insertBackground, onSelect: pickBackground },
      { kind: "item", label: t.menu.placeCharacter, onSelect: () => openPicker("place", "heroes", at) },
      { kind: "item", label: t.menu.placeEnemy, onSelect: () => openPicker("place", "enemies", at) },
      { kind: "item", label: t.menu.placeObject, onSelect: () => openPicker("place", "objects", at) },
      { kind: "sep" },
      { kind: "head", label: t.menu.drawZone },
      ...kindEntries(
        (k) => {
          ui.set({ tool: "zone", zoneKind: k });
          ui.flash(t.toast.drawHint(t.zoneKinds[k].name));
        },
        () => undefined,
        false,
      ),
    ];
    if (hasBg && bg)
      out.push(
        { kind: "sep" },
        { kind: "item", label: bg.locked ? t.menu.unlockBackground : t.menu.lockBackground, onSelect: () => setBackgroundFlags(store, level.id, { locked: !bg.locked }, t.undoLabels.lockBackground) },
        {
          kind: "item",
          label: t.menu.removeBackground,
          danger: true,
          onSelect: () => {
            clearBackground(store, level.id, t.undoLabels.removeBackground);
            ui.set({ sel: null });
          },
        },
      );
    return out;
  };

  const openIssue = (target: NonNullable<ValidationIssue["target"]> | Target) => {
    if (target.tab === "menus" && "screen" in target && target.screen) setMenuScreen(target.screen as MenuScreenId);
    ui.set({ workspace: target.tab === "build" ? "level" : target.tab });
  };

  const selection = (() => {
    if (s.playing) return "";
    const sel = s.sel;
    if (sel?.kind === "zone") {
      const z = findZone(level, sel.id);
      if (z) return t.selection.zone(zoneLabel(z), z.w, z.h);
    }
    if (sel?.kind === "object") {
      const o = findObject(level, sel.id);
      if (o) {
        const b = boxOf(o);
        return t.selection.object(objectName(o.name), b.w, b.h);
      }
    }
    if (sel?.kind === "bg") return t.selection.background(backgroundFile(p, level) ?? t.backgroundName);
    return t.levelSize(level.size.w, level.size.h);
  })();

  const loading = <p className="studio-loading">{core.home.loading}</p>;
  return (
    <div className="mdn studio" onContextMenu={(e) => e.target === e.currentTarget && e.preventDefault()}>
      <Header
        project={p}
        lang={lang}
        theme={theme}
        wide={wide}
        canUndo={store.canUndo}
        canRedo={store.canRedo}
        onHome={onHome}
        onNewGame={() => ui.set({ wizard: true, menu: null })}
        onDemo={startDemo}
        onLang={onLang}
        onTheme={onTheme}
        onUndo={() => store.undo()}
        onRedo={() => store.redo()}
        onPlay={play}
        onStop={stop}
      />
      {s.workspace === "level" ? (
        <div className="studio-body" style={{ gridTemplateColumns: gridColumns(s) }}>
          <LeftPanel steps={steps} hasBackground={steps[0]} onInsertBackground={pickBackground} onInsert={(tab) => openPicker("place", tab, null)} onPrompt={() => setPrompt(true)} />
          <main className="studio-main">
            <OptionsBar kinds={kinds} onZoomBy={(f) => stage.current?.zoomBy(f)} />
            <div className="studio-canvas">
              {s.playing ? (
                <PlayStage project={p} level={level} images={images} onSnapshot={(snap) => (lastSnap.current = snap)} />
              ) : (
                <Stage
                  store={store}
                  level={level}
                  version={version}
                  images={images}
                  apiRef={stage}
                  onCursor={setCursor}
                  zoneLabel={zoneLabel}
                  objectLabel={objectLabel}
                  onFile={(f) => void setBackground(f)}
                  onInsertBackground={pickBackground}
                  onExample={() => void useExample()}
                  onDemo={startDemo}
                />
              )}
              {s.toast && (
                <div key={s.toast.n} className="studio-toast" role="status">
                  {s.toast.text}
                </div>
              )}
            </div>
          </main>
          <RightPanel
            onNewGroup={newGroup}
            properties={
              <PropertiesPanel
                store={store}
                characters={p.characters}
                level={level}
                version={version}
                images={images}
                kinds={kinds}
                zoneLabel={zoneLabel}
                objectInfo={(o) => ({ name: nameOf(o), sprite: itemOfObject(items, o)?.name ?? o.type, role: roleOf(o) })}
                backgroundName={backgroundFile(p, level) ?? t.backgroundName}
                onDuplicate={duplicate}
                onDelete={remove}
                onChangeSprite={(name) => {
                  const o = findObject(level, name);
                  const it = o && itemOfObject(items, o);
                  openPicker("change", it ? it.tab : "objects", null, name);
                }}
                onFlip={(name) => flipObject(store, level.id, name, t.undoLabels.flip)}
                onReplaceBackground={pickBackground}
                onRemoveBackground={() => {
                  clearBackground(store, level.id, t.undoLabels.removeBackground);
                  ui.set({ sel: null });
                }}
              />
            }
            layers={
              <LayersPanel
                store={store}
                level={level}
                version={version}
                images={images}
                zoneInfo={(z) => ({ name: zoneLabel(z), kind: t.zoneKinds[z.kind].name, swatch: ZONE_SWATCH[z.kind] })}
                objectInfo={(o) => {
                  const role = roleOf(o);
                  return { name: nameOf(o), kind: t.roles[role], swatch: "", role };
                }}
                backgroundName={backgroundFile(p, level) ?? t.backgroundName}
                onPlace={() => openPicker("place", "heroes", null)}
                onInsertBackground={pickBackground}
              />
            }
          />
        </div>
      ) : (
        <div className="studio-workspace">
          <Suspense fallback={loading}>
            {s.workspace === "characters" && <CharactersScreen project={p} onChange={(next: Project) => store.editProject(t.workspaces.characters, (cur) => Object.assign(cur, cloneProject(next)))} />}
            {s.workspace === "game" && <GameScreen store={store} project={p} issues={issues} onGo={openIssue} />}
            {s.workspace === "menus" && <MenusScreen store={store} project={p} version={version} screen={menuScreen} onScreen={setMenuScreen} focusField={null} issues={issues} onGo={openIssue} />}
            {s.workspace === "export" && <ExportView project={p} version={version} store={store} onGo={openIssue} />}
          </Suspense>
        </div>
      )}
      <Footer cursor={s.workspace === "level" ? cursor : null} selection={selection} save={save} onShortcuts={() => ui.set({ keysOpen: true })} />
      {prompt && (
        <div className="studio-classic">
          <PromptDialog store={store} project={p} kind="character" onClose={() => setPrompt(false)} />
        </div>
      )}
      {s.keysOpen && <ShortcutsDialog onClose={() => ui.set({ keysOpen: false })} />}
      {s.wizard && (
        <NewGameWizard
          lang={lang}
          onLang={onLang}
          onCancel={() => (scratch ? onHome() : ui.set({ wizard: false }))}
          onDemo={() => {
            ui.set({ wizard: false });
            startDemo();
          }}
          onCreated={(created, opts) => {
            ui.set({ wizard: false });
            onCreated(created, opts.characters ? { workspace: "characters", toast: t.wizard.created } : { tool: opts.drawFloor ? "zone" : "select", toast: opts.drawFloor ? t.wizard.createdDraw : t.wizard.created });
          }}
        />
      )}
      {s.demo && (
        <DemoOverlay
          state={s.demo}
          cursor={demoCursor}
          onExit={exitDemo}
          onCreate={() => {
            stopDemo();
            ui.set({ wizard: true });
          }}
          onAgain={startDemo}
          onKeep={() => {
            const kept = demoStore?.project;
            stopDemo();
            if (kept) onCreated(cloneProject({ ...kept, id: newId() }), { toast: t.wizard.created });
          }}
        />
      )}
      <input
        ref={bgInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void setBackground(f);
        }}
      />
      {s.menu && <Menu x={s.menu.x} y={s.menu.y} entries={menuEntries()} label={s.menu.target.kind === "flyZone" ? t.tools.zone : s.menu.target.kind === "flyInsert" ? t.insertHeading : s.menu.target.kind === "group" ? t.layers : t.menu.canvas} onClose={() => ui.set({ menu: null })} />}
      {s.picker && (
        <SpritePicker
          picker={s.picker}
          items={items}
          onTab={(tab) => ui.set((st) => ({ picker: st.picker && { ...st.picker, tab } }))}
          onChoose={(id) => ui.set((st) => ({ picker: st.picker && { ...st.picker, chosen: id } }))}
          onConfirm={confirmPicker}
          onCancel={() => ui.set({ picker: null })}
          onUpload={() => ui.set({ picker: null, workspace: "characters" })}
        />
      )}
    </div>
  );
}

