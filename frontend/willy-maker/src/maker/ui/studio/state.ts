// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The editor's UI state: the tool, the panels, the view and the debug
// overlays. The game itself lives in the EditorStore (with its undo); this
// is what the screen shows around it, so it has no history. The panels'
// sizes and the view's settings are this browser's preferences.

import { createContext, useContext, useSyncExternalStore } from "react";
import type { ZoneKind } from "../../model";
import type { ItemRef } from "../../editor/zoneOps";

export type Workspace = "level" | "characters" | "game" | "menus" | "export";
export type StudioTool = "select" | "zone" | "erase" | "hand";
export type DebugFlag = "frame" | "collision" | "hitboxes" | "camera" | "fps" | "slow";

export const DEBUG_FLAGS: readonly DebugFlag[] = ["frame", "collision", "hitboxes", "camera", "fps", "slow"];

/** A floating menu: the rail's flyouts, or the canvas's context menu (at a level point, on an item or on nothing). */
export type MenuTarget = { kind: "flyZone" } | { kind: "flyInsert" } | { kind: "canvas"; at: { x: number; y: number }; ref: ItemRef | null } | { kind: "group"; id: string };

/** What is being renamed in place (in the Layers panel). */
export type Renaming = { kind: "group" | "zone" | "object"; id: string };

export type PickerTab = "heroes" | "enemies" | "objects";

/** The sprite picker: placing a new object at a level point, or changing an object's sprite. */
export interface PickerState {
  mode: "place" | "change";
  tab: PickerTab;
  at: { x: number; y: number } | null;
  /** The object whose sprite changes. */
  object?: string;
  /** The catalog item chosen so far. */
  chosen: string | null;
}

export interface StudioUiState {
  workspace: Workspace;
  tool: StudioTool;
  zoneKind: ZoneKind;
  zoom: number;
  grid: 8 | 16;
  showGrid: boolean;
  showLabels: boolean;
  /** Zones' opacity, 10-100 %. */
  zoneOpacity: number;
  leftW: number;
  rightW: number;
  leftCompact: boolean;
  leftHidden: boolean;
  rightHidden: boolean;
  playing: boolean;
  /** Played at least once this session (the fourth first step). */
  played: boolean;
  debug: Record<DebugFlag, boolean>;
  menu: { x: number; y: number; target: MenuTarget } | null;
  /** What is selected on the canvas. */
  sel: ItemRef | null;
  /** With the background selected: the scene picked on the canvas (Level.scenes id). */
  scene: string | null;
  /** The group whose header was clicked last: new zones and objects go into it when it takes them. */
  activeGroup: string | null;
  picker: PickerState | null;
  renaming: Renaming | null;
  /** The keyboard shortcuts list is open. */
  keysOpen: boolean;
  /** The new game wizard is open. */
  wizard: boolean;
  /** The automatic demo: its step, and whether it has ended. */
  demo: { n: number; done: boolean } | null;
  /** Space is held: dragging pans the canvas. */
  spacePan: boolean;
  viewMenu: boolean;
  toast: { text: string; n: number } | null;
}

export const LEFT_MIN = 180;
export const LEFT_MAX = 380;
/** Dragged narrower than this, the tools panel becomes the icon rail. */
export const LEFT_RAIL_AT = 140;
export const RAIL_W = 52;
export const RIGHT_MIN = 240;
export const RIGHT_MAX = 480;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 6;

const PREFS_KEY = "go-link.wm.studio";
const PREF_FIELDS = ["leftW", "rightW", "leftCompact", "grid", "showGrid", "showLabels", "zoneOpacity"] as const;
type Prefs = Pick<StudioUiState, (typeof PREF_FIELDS)[number]>;

export function defaultUi(): StudioUiState {
  return {
    workspace: "level",
    tool: "select",
    zoneKind: "floor",
    zoom: 2,
    grid: 16,
    showGrid: true,
    showLabels: true,
    zoneOpacity: 85,
    leftW: 220,
    rightW: 288,
    leftCompact: false,
    leftHidden: false,
    rightHidden: false,
    playing: false,
    played: false,
    debug: { frame: true, collision: false, hitboxes: false, camera: false, fps: false, slow: false },
    menu: null,
    sel: null,
    scene: null,
    activeGroup: null,
    picker: null,
    renaming: null,
    keysOpen: false,
    wizard: false,
    demo: null,
    spacePan: false,
    viewMenu: false,
    toast: null,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Saved preferences, each checked; anything odd falls back to the default. */
export function readPrefs(raw: string | null): Partial<Prefs> {
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(raw ?? "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
  if (!v || typeof v !== "object") return {};
  const out: Partial<Prefs> = {};
  if (typeof v.leftW === "number" && Number.isFinite(v.leftW)) out.leftW = clamp(Math.round(v.leftW), LEFT_MIN, LEFT_MAX);
  if (typeof v.rightW === "number" && Number.isFinite(v.rightW)) out.rightW = clamp(Math.round(v.rightW), RIGHT_MIN, RIGHT_MAX);
  if (typeof v.leftCompact === "boolean") out.leftCompact = v.leftCompact;
  if (v.grid === 8 || v.grid === 16) out.grid = v.grid;
  if (typeof v.showGrid === "boolean") out.showGrid = v.showGrid;
  if (typeof v.showLabels === "boolean") out.showLabels = v.showLabels;
  if (typeof v.zoneOpacity === "number" && Number.isFinite(v.zoneOpacity)) out.zoneOpacity = clamp(Math.round(v.zoneOpacity), 10, 100);
  return out;
}

function loadPrefs(): Partial<Prefs> {
  try {
    return readPrefs(window.localStorage.getItem(PREFS_KEY));
  } catch {
    return {};
  }
}

export class StudioUi {
  state: StudioUiState;
  private readonly listeners = new Set<() => void>();
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(initial?: Partial<StudioUiState>) {
    this.state = { ...defaultUi(), ...loadPrefs(), ...initial };
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  get = (): StudioUiState => this.state;

  set(patch: Partial<StudioUiState> | ((s: StudioUiState) => Partial<StudioUiState>)): void {
    const p = typeof patch === "function" ? patch(this.state) : patch;
    this.state = { ...this.state, ...p };
    if (PREF_FIELDS.some((k) => k in p)) this.savePrefs();
    this.listeners.forEach((fn) => fn());
  }

  private savePrefs(): void {
    const prefs = Object.fromEntries(PREF_FIELDS.map((k) => [k, this.state[k]]));
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // storage blocked: the preferences last for this page
    }
  }

  /** Width of the tools panel while its edge is dragged: below LEFT_RAIL_AT it becomes the rail. */
  dragLeft(w: number): void {
    if (w < LEFT_RAIL_AT) {
      if (!this.state.leftCompact) this.set({ leftCompact: true });
    } else this.set({ leftCompact: false, leftW: clamp(Math.round(w), LEFT_MIN, LEFT_MAX) });
  }

  dragRight(w: number): void {
    this.set({ rightW: clamp(Math.round(w), RIGHT_MIN, RIGHT_MAX) });
  }

  /** Tab: hides both panels when any is shown, else shows both. */
  togglePanels(): void {
    const any = !this.state.leftHidden || !this.state.rightHidden;
    this.set({ leftHidden: any, rightHidden: any });
  }

  setZoom(z: number): void {
    this.set({ zoom: clamp(Math.round(z * 100) / 100, MIN_ZOOM, MAX_ZOOM) });
  }

  toggleDebug(flag: DebugFlag): void {
    this.set((s) => ({ debug: { ...s.debug, [flag]: !s.debug[flag] } }));
  }

  /** A short note at the bottom left, gone after 2.8 s. */
  flash(text: string): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.set((s) => ({ toast: { text, n: (s.toast?.n ?? 0) + 1 } }));
    this.toastTimer = setTimeout(() => this.set({ toast: null }), 2800);
  }

  dispose(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }
}

const UiContext = createContext<StudioUi | null>(null);
export const UiProvider = UiContext.Provider;

export function useStudioUi(): StudioUi {
  const ui = useContext(UiContext);
  if (!ui) throw new Error("useStudioUi outside the editor");
  return ui;
}

/** The UI state; re-renders on every change (the state is small). */
export function useUiState(): StudioUiState {
  const ui = useStudioUi();
  return useSyncExternalStore(ui.subscribe, ui.get, ui.get);
}

/** The grid columns of the editor's body: tools panel, canvas, layers panel. */
export function gridColumns(s: Pick<StudioUiState, "leftHidden" | "leftCompact" | "leftW" | "rightHidden" | "rightW">): string {
  return [s.leftHidden ? null : s.leftCompact ? `${RAIL_W}px` : `${s.leftW}px`, "minmax(0,1fr)", s.rightHidden ? null : `${s.rightW}px`].filter(Boolean).join(" ");
}

const APPLE = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
/** The command key's name: ⌘ on Apple computers, Ctrl elsewhere ("⌘ + wheel"). */
export const MOD_NAME = APPLE ? "⌘" : "Ctrl";
/** The command key before another key: "⌘Z", "Ctrl+Z". */
export const MOD_PREFIX = APPLE ? "⌘" : "Ctrl+";

/** The zone kinds offered for drawing: the six of the design, and water only when the level already has it. */
export function drawableKinds(hasWater: boolean): ZoneKind[] {
  return hasWater ? ["floor", "platform", "ladder", "crate", "breakable", "hazard", "water"] : ["floor", "platform", "ladder", "crate", "breakable", "hazard"];
}
