// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The open project and its history. Every change is a command with apply
// and revert, so undo/redo, autosave and edits made while playing all take
// the same path. The store mutates its project in place and bumps a version
// that React reads (useSyncExternalStore).

import { cloneProject, decodeCells, encodeCells, type GameSettings, type Level, type Project, type TagLayer, type TileLayer } from "../model";

export interface Command {
  label: string;
  apply(p: Project): void;
  revert(p: Project): void;
  /** Commands with the same key that follow each other quickly are one undo step (typing in a field). */
  merge?: string;
  /** When it ran (ms), for merging. */
  at?: number;
}

const HISTORY = 200;
/** Edits of the same field closer than this join into one undo step. */
const MERGE_MS = 1500;

export class EditorStore {
  project: Project;
  private past: Command[] = [];
  private future: Command[] = [];
  private listeners = new Set<() => void>();
  private changeListeners = new Set<(p: Project) => void>();
  version = 0;

  constructor(project: Project) {
    this.project = project;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  /** Called after every change to the project (autosave hooks here). */
  onChange(fn: (p: Project) => void): () => void {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }

  private emit(changed: boolean) {
    this.version++;
    if (changed) {
      this.project.updatedAt = new Date().toISOString();
      this.changeListeners.forEach((fn) => fn(this.project));
    }
    this.listeners.forEach((fn) => fn());
  }

  /** Runs a command (or records one already applied, like a pencil stroke). */
  run(cmd: Command, alreadyApplied = false): void {
    if (!alreadyApplied) cmd.apply(this.project);
    const now = Date.now();
    const top = this.past[this.past.length - 1];
    if (cmd.merge && top?.merge === cmd.merge && top.at !== undefined && now - top.at < MERGE_MS) {
      // one step from before the first edit to after this one
      this.past[this.past.length - 1] = { ...cmd, revert: top.revert, at: now };
      this.future = [];
      this.emit(true);
      return;
    }
    this.past.push({ ...cmd, at: now });
    if (this.past.length > HISTORY) this.past.shift();
    this.future = [];
    this.emit(true);
  }

  /** Repaints after a live change that will be recorded later (a stroke in progress). */
  touch(): void {
    this.emit(false);
  }

  undo(): boolean {
    const cmd = this.past.pop();
    if (!cmd) return false;
    cmd.revert(this.project);
    this.future.push(cmd);
    this.emit(true);
    return true;
  }

  redo(): boolean {
    const cmd = this.future.pop();
    if (!cmd) return false;
    cmd.apply(this.project);
    this.past.push(cmd);
    this.emit(true);
    return true;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get undoLabel(): string | null {
    return this.past[this.past.length - 1]?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.future[this.future.length - 1]?.label ?? null;
  }

  level(id: string): Level | undefined {
    return this.project.levels.find((l) => l.id === id);
  }

  /**
   * Changes a level with `fn`; undo restores the level as it was. Edits with
   * the same `merge` key in quick succession (the letters typed in one field)
   * are one undo step.
   */
  editLevel(label: string, levelId: string, fn: (level: Level) => void, merge?: string): void {
    const index = this.project.levels.findIndex((l) => l.id === levelId);
    if (index < 0) return;
    const before = cloneProject(this.project.levels[index]!);
    fn(this.project.levels[index]!);
    const after = cloneProject(this.project.levels[index]!);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const put = (p: Project, l: Level) => {
      const i = p.levels.findIndex((x) => x.id === levelId);
      if (i >= 0) p.levels[i] = cloneProject(l);
    };
    this.run({ label, merge, apply: (p) => put(p, after), revert: (p) => put(p, before) }, true);
  }

  /**
   * Changes the game settings (Game and Menus tabs) with `fn`; undo
   * restores them. Edits with the same `merge` key in quick succession (the
   * letters typed in one field) are one undo step.
   */
  editSettings(label: string, fn: (s: GameSettings) => void, merge?: string): void {
    const before = cloneProject(this.project.settings);
    fn(this.project.settings);
    const after = cloneProject(this.project.settings);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    this.run({ label, merge, apply: (p) => void (p.settings = cloneProject(after)), revert: (p) => void (p.settings = cloneProject(before)) }, true);
  }

  /** Changes anything in the project with `fn`; undo restores the whole project (edits with the same `merge` key in quick succession are one step). */
  editProject(label: string, fn: (p: Project) => void, merge?: string): void {
    const before = cloneProject(this.project);
    fn(this.project);
    const after = cloneProject(this.project);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const put = (p: Project, from: Project) => {
      for (const k of Object.keys(p)) delete (p as Record<string, unknown>)[k];
      Object.assign(p, cloneProject(from));
    };
    this.run({ label, merge, apply: (p) => put(p, after), revert: (p) => put(p, before) }, true);
  }
}

/** Cell changes of one layer: [cell index, before, after]. */
export type CellChange = [number, number, number];

function findCellLayer(p: Project, levelId: string, layerId: string): { level: Level; layer: TileLayer | TagLayer } | null {
  const level = p.levels.find((l) => l.id === levelId);
  const layer = level?.layers.find((l) => l.id === layerId);
  if (!level || !layer || (layer.kind !== "tiles" && layer.kind !== "tags")) return null;
  return { level, layer };
}

function writeCells(p: Project, levelId: string, layerId: string, changes: CellChange[], after: boolean) {
  const found = findCellLayer(p, levelId, layerId);
  if (!found) return;
  const { level, layer } = found;
  const count = Math.ceil(level.size.w / layer.grid) * Math.ceil(level.size.h / layer.grid);
  const cells = decodeCells(layer.data, count);
  for (const [i, b, a] of changes) cells[i] = after ? a : b;
  layer.data = encodeCells(cells);
}

/** A command over cells of several layers (tags plus their auto art), as one step. */
export function cellsCommand(label: string, levelId: string, parts: { layerId: string; changes: CellChange[] }[]): Command {
  return {
    label,
    apply: (p) => parts.forEach((x) => writeCells(p, levelId, x.layerId, x.changes, true)),
    revert: (p) => [...parts].reverse().forEach((x) => writeCells(p, levelId, x.layerId, x.changes, false)),
  };
}
