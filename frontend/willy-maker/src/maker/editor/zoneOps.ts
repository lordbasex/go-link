// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The new editor's changes to a level: zones, objects (characters, enemies,
// items) and the background. Each one is a single undo step through the
// EditorStore, and every change to zones or crates draws the collision
// layer again from them (model/zones.ts), so play mode and the ROM always
// read what the editor shows. Drags change the level live and become one
// step when they end (LiveEdit).

import { applyZones, cloneProject, crateCells, groupOf, nextGroupNumber, nextZoneNumber, objectLayer, OBJECTS_GROUP, tileLayers, ZONES_GROUP, encodeCells, type LayerGroup, type Level, type LevelObject, type Project, type Zone, type ZoneKind } from "../model";
import type { Part } from "./parts";
import { baseName } from "./parts";
import type { EditorStore } from "./store";

/** What the editor points at: a zone, an object (by its unique name) or the background. */
export type ItemRef = { kind: "zone"; id: string } | { kind: "object"; id: string } | { kind: "bg" };

export function sameRef(a: ItemRef | null, b: ItemRef | null): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  return a.kind === "bg" || a.id === (b as { id: string }).id;
}

export function findZone(level: Level, id: string): Zone | undefined {
  return level.zones?.find((z) => z.id === id);
}

export function findObject(level: Level, name: string): LevelObject | undefined {
  return objectLayer(level).items.find((o) => o.name === name);
}

/** The background is the play layer's picture (it scrolls with the level, so zones stay on it). */
export function backgroundLayer(level: Level) {
  return tileLayers(level).find((l) => l.id === "play");
}

function putLevel(p: Project, levelId: string, l: Level): void {
  const i = p.levels.findIndex((x) => x.id === levelId);
  if (i >= 0) p.levels[i] = cloneProject(l);
}

/** A change made live (a drag) that becomes one undo step on commit, or is undone by cancel. */
export class LiveEdit {
  private readonly before: Level;
  private changed = false;

  constructor(
    private readonly store: EditorStore,
    private readonly levelId: string,
    private readonly label: string,
  ) {
    this.before = cloneProject(this.level);
  }

  get level(): Level {
    return this.store.level(this.levelId)!;
  }

  change(fn: (level: Level) => void): void {
    fn(this.level);
    applyZones(this.level);
    this.changed = true;
    this.store.touch();
  }

  commit(): void {
    if (!this.changed) return;
    const after = cloneProject(this.level);
    if (JSON.stringify(after) === JSON.stringify(this.before)) return;
    const before = this.before;
    this.store.run({ label: this.label, apply: (p) => putLevel(p, this.levelId, after), revert: (p) => putLevel(p, this.levelId, before) }, true);
  }

  cancel(): void {
    if (!this.changed) return;
    putLevel(this.store.project, this.levelId, this.before);
    this.store.touch();
  }
}

/** A level change as one undo step, with the collision layer drawn again from the zones. */
export function editZones(store: EditorStore, levelId: string, label: string, fn: (level: Level) => void, merge?: string): void {
  store.editLevel(
    label,
    levelId,
    (level) => {
      fn(level);
      applyZones(level);
    },
    merge,
  );
}

let seq = 0;
function newZoneId(level: Level): string {
  const ids = new Set((level.zones ?? []).map((z) => z.id));
  let id: string;
  do id = `zone-${Date.now().toString(36)}-${(seq++).toString(36)}`;
  while (ids.has(id));
  return id;
}

/** The group new zones or objects go into: the active one when it takes that kind, else the base one. */
export function targetGroup(level: Level, kind: "zones" | "objects", active: string | null): string {
  const groups = level.groups ?? [];
  const a = groups.find((g) => g.id === active);
  if (a && (!a.base || a.base === kind)) return a.id;
  return groups.find((g) => g.base === kind)?.id ?? (kind === "zones" ? ZONES_GROUP : OBJECTS_GROUP);
}

export function addZone(store: EditorStore, levelId: string, z: { kind: ZoneKind; x: number; y: number; w: number; h: number; group: string }, label: string): string {
  let id = "";
  editZones(store, levelId, label, (level) => {
    level.zones = level.zones ?? [];
    id = newZoneId(level);
    level.zones.push({ id, kind: z.kind, n: nextZoneNumber(level.zones, z.kind), x: z.x, y: z.y, w: z.w, h: z.h, group: z.group });
    // a zone drawn into a hidden group shows the group again
    const g = level.groups?.find((x) => x.id === z.group);
    if (g) g.visible = true;
  });
  return id;
}

/** Changes a zone's fields; a new kind gets that kind's next automatic number. */
export function patchZone(store: EditorStore, levelId: string, id: string, patch: Partial<Omit<Zone, "id">>, label: string, merge?: string): void {
  editZones(store, levelId, label, (level) => {
    const z = findZone(level, id);
    if (!z) return;
    if (patch.kind && patch.kind !== z.kind && !patch.n) patch = { ...patch, n: nextZoneNumber(level.zones ?? [], patch.kind) };
    Object.assign(z, patch);
    if (z.kind !== "breakable") delete z.hp;
  }, merge);
}

export function removeItem(store: EditorStore, levelId: string, ref: ItemRef, label: string): void {
  if (ref.kind === "bg") return;
  editZones(store, levelId, label, (level) => {
    if (ref.kind === "zone") level.zones = (level.zones ?? []).filter((z) => z.id !== ref.id);
    else {
      const items = objectLayer(level).items;
      const i = items.findIndex((o) => o.name === ref.id);
      if (i >= 0) items.splice(i, 1);
    }
  });
}

/** A unique object name from a base ("trooper" → "trooper_2"). */
export function uniqueObjectName(level: Level, base: string): string {
  const names = new Set(objectLayer(level).items.map((o) => o.name));
  const clean = base.replace(/[^A-Za-z0-9_]/g, "_") || "object";
  if (!names.has(clean)) return clean;
  let n = 2;
  while (names.has(`${clean}_${n}`)) n++;
  return `${clean}_${n}`;
}

/** A copy two grid steps to the right (kept inside the level); returns what to select. */
export function duplicateItem(store: EditorStore, levelId: string, ref: ItemRef, step: number, label: string): ItemRef | null {
  if (ref.kind === "bg") return null;
  let out: ItemRef | null = null;
  editZones(store, levelId, label, (level) => {
    if (ref.kind === "zone") {
      const z = findZone(level, ref.id);
      if (!z) return;
      const id = newZoneId(level);
      const { name: _name, ...rest } = z;
      level.zones!.push({ ...rest, id, n: nextZoneNumber(level.zones!, z.kind), x: Math.min(level.size.w - z.w, z.x + Math.max(16, step * 2)) });
      out = { kind: "zone", id };
    } else {
      const o = findObject(level, ref.id);
      if (!o) return;
      // one hero start per player: a copy of one is not a new player
      if (o.type === "player_start" || o.type === "exit") return;
      const name = uniqueObjectName(level, o.name.replace(/_\d+$/, ""));
      objectLayer(level).items.push({ ...cloneProject(o), name, x: Math.min(level.size.w - 8, o.x + step * 2) });
      out = { kind: "object", id: name };
    }
  });
  return out;
}

/**
 * Places a part from the sprite picker. A crate is an object whose cells the
 * zones' drawing adds; a player's start replaces that player's old one and
 * there is one exit. Returns the new object's name.
 */
export function placeObject(store: EditorStore, levelId: string, part: Extract<Part, { kind: "object" | "crate" }>, x: number, y: number, group: string, label: string): string {
  let name = "";
  editZones(store, levelId, label, (level) => {
    const items = objectLayer(level).items;
    const own = (o: LevelObject) => (groupOf(level, { group }, "objects")?.base === "objects" ? o : { ...o, group });
    if (part.kind === "crate") {
      name = uniqueObjectName(level, "crate");
      items.push(own({ name, type: "crate", x: Math.max(0, Math.floor(x / 16) * 16), y: Math.max(0, Math.floor(y / 16) * 16), size: 32, hp: 2, contents: "nothing" }));
      return;
    }
    if (part.type === "player_start" || part.type === "exit") {
      const old = items.findIndex((i) => i.type === part.type && (part.type === "exit" || i.player === part.props.player));
      if (old >= 0) items.splice(old, 1);
    }
    name = uniqueObjectName(level, baseName(part));
    items.push(own({ name, type: part.type, x: Math.round(x), y: Math.round(y), ...cloneProject(part.props) }));
  });
  return name;
}

/** Gives an object another part of the same kind (another enemy, another item), keeping its place, name and group. */
export function changeObjectPart(store: EditorStore, levelId: string, name: string, part: Extract<Part, { kind: "object" | "crate" }>, label: string): void {
  editZones(store, levelId, label, (level) => {
    const o = findObject(level, name);
    if (!o) return;
    const keep = { name: o.name, x: o.x, y: o.y, ...(o.group ? { group: o.group } : {}), ...(o.hidden ? { hidden: true } : {}), ...(o.locked ? { locked: true } : {}), ...(o.facing ? { facing: o.facing } : {}), ...(typeof o.label === "string" ? { label: o.label } : {}) };
    for (const k of Object.keys(o)) delete (o as Record<string, unknown>)[k];
    if (part.kind === "crate") Object.assign(o, { type: "crate", size: 32, hp: 2, contents: "nothing" }, keep);
    else Object.assign(o, { type: part.type }, cloneProject(part.props), keep);
  });
}

/** Turns an object to look the other way (characters face right unless their `facing` is "left"). */
export function flipObject(store: EditorStore, levelId: string, name: string, label: string): void {
  editZones(store, levelId, label, (level) => {
    const o = findObject(level, name);
    if (o) o.facing = o.facing === "left" ? "right" : "left";
  });
}

/** Takes the background picture off the level (its tiles; the tileset stays until another picture replaces it). */
export function clearBackground(store: EditorStore, levelId: string, label: string): void {
  store.editLevel(label, levelId, (level) => {
    const l = backgroundLayer(level);
    if (!l) return;
    l.data = encodeCells(new Uint16Array(Math.ceil(level.size.w / l.grid) * Math.ceil(level.size.h / l.grid)));
  });
}

export function setBackgroundFlags(store: EditorStore, levelId: string, flags: { visible?: boolean; locked?: boolean }, label: string): void {
  store.editLevel(label, levelId, (level) => {
    const l = backgroundLayer(level);
    if (l) Object.assign(l, flags);
  });
}

/** Cells of a crate object, for drawing it and finding it. */
export function crateBox(o: LevelObject): { x: number; y: number; w: number; h: number } {
  const { c0, r0, n } = crateCells(o);
  return { x: c0 * 16, y: r0 * 16, w: n * 16, h: n * 16 };
}

// ---------- layer groups (the Layers panel)

function newGroupId(level: Level): string {
  const ids = new Set((level.groups ?? []).map((g) => g.id));
  let id: string;
  do id = `group-${Date.now().toString(36)}-${(seq++).toString(36)}`;
  while (ids.has(id));
  return id;
}

/** A new group at the top of the panel ("Group n"); returns its id. */
export function addGroup(store: EditorStore, levelId: string, label: string): string {
  let id = "";
  editZones(store, levelId, label, (level) => {
    level.groups = level.groups ?? [];
    id = newGroupId(level);
    level.groups.unshift({ id, n: nextGroupNumber(level.groups), visible: true, locked: false, open: true });
  });
  return id;
}

/** Shows, hides, locks or renames a group (an empty name brings the automatic one back). */
export function patchGroup(store: EditorStore, levelId: string, id: string, patch: Partial<Pick<LayerGroup, "visible" | "locked" | "name">>, label: string): void {
  editZones(store, levelId, label, (level) => {
    const g = level.groups?.find((x) => x.id === id);
    if (!g) return;
    Object.assign(g, patch);
    if (patch.name !== undefined && !patch.name.trim()) delete g.name;
  });
}

/** Opens or closes a group in the panel: a view setting, kept with the game but not an undo step. */
export function setGroupOpen(store: EditorStore, levelId: string, id: string, open: boolean): void {
  const g = store.level(levelId)?.groups?.find((x) => x.id === id);
  if (!g || g.open === open) return;
  g.open = open;
  store.touch();
}

/** Moves a group up (-1) or down (+1) in the panel. */
export function moveGroup(store: EditorStore, levelId: string, id: string, dir: -1 | 1, label: string): void {
  editZones(store, levelId, label, (level) => {
    const gs = level.groups ?? [];
    const i = gs.findIndex((g) => g.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= gs.length) return;
    [gs[i], gs[j]] = [gs[j]!, gs[i]!];
  });
}

/** The zones and objects listed in a group. */
export function groupMembers(level: Level, id: string): ItemRef[] {
  const out: ItemRef[] = [];
  for (const o of objectLayer(level).items) if (groupOf(level, o, "objects")?.id === id) out.push({ kind: "object", id: o.name });
  for (const z of level.zones ?? []) if (groupOf(level, z, "zones")?.id === id) out.push({ kind: "zone", id: z.id });
  return out;
}

function setGroupOf(level: Level, ref: ItemRef, gid: string | undefined): void {
  if (ref.kind === "zone") {
    const z = findZone(level, ref.id);
    if (z) z.group = gid ?? level.groups?.find((g) => g.base === "zones")?.id ?? ZONES_GROUP;
  } else if (ref.kind === "object") {
    const o = findObject(level, ref.id);
    if (!o) return;
    // the objects' base group is where an object without a group is
    if (!gid || level.groups?.find((g) => g.id === gid)?.base === "objects") delete o.group;
    else o.group = gid;
  }
}

/** Takes a group away; its zones and objects go back to their base groups. Base groups stay. */
export function ungroup(store: EditorStore, levelId: string, id: string, label: string): void {
  editZones(store, levelId, label, (level) => {
    const g = level.groups?.find((x) => x.id === id);
    if (!g || g.base) return;
    for (const ref of groupMembers(level, id)) setGroupOf(level, ref, undefined);
    level.groups = level.groups!.filter((x) => x.id !== id);
  });
}

/** Deletes a group and everything in it. Base groups stay. */
export function deleteGroup(store: EditorStore, levelId: string, id: string, label: string): void {
  editZones(store, levelId, label, (level) => {
    const g = level.groups?.find((x) => x.id === id);
    if (!g || g.base) return;
    const members = groupMembers(level, id);
    const zones = new Set(members.filter((m) => m.kind === "zone").map((m) => (m as { id: string }).id));
    const objects = new Set(members.filter((m) => m.kind === "object").map((m) => (m as { id: string }).id));
    level.zones = (level.zones ?? []).filter((z) => !zones.has(z.id));
    const items = objectLayer(level).items;
    for (let i = items.length - 1; i >= 0; i--) if (objects.has(items[i]!.name)) items.splice(i, 1);
    level.groups = level.groups!.filter((x) => x.id !== id);
  });
}

/** Moves a zone or an object into a group. */
export function moveToGroup(store: EditorStore, levelId: string, ref: ItemRef, gid: string, label: string): void {
  editZones(store, levelId, label, (level) => {
    const g = level.groups?.find((x) => x.id === gid);
    if (!g) return;
    setGroupOf(level, ref, gid);
  });
}

/** "Group in a new group": a new group holding this item; returns the group's id. */
export function groupItem(store: EditorStore, levelId: string, ref: ItemRef, label: string): string {
  let id = "";
  editZones(store, levelId, label, (level) => {
    level.groups = level.groups ?? [];
    id = newGroupId(level);
    level.groups.unshift({ id, n: nextGroupNumber(level.groups), visible: true, locked: false, open: true });
    setGroupOf(level, ref, id);
  });
  return id;
}

/** Hides, locks or renames a zone or an object (an object's `name` is its reference and stays; it gets a `label`). */
export function patchItem(store: EditorStore, levelId: string, ref: ItemRef, patch: { hidden?: boolean; locked?: boolean; name?: string }, label: string, merge?: string): void {
  if (ref.kind === "bg") return;
  editZones(store, levelId, label, (level) => {
    const it: Record<string, unknown> | undefined = ref.kind === "zone" ? (findZone(level, ref.id) as unknown as Record<string, unknown>) : findObject(level, ref.id);
    if (!it) return;
    for (const k of ["hidden", "locked"] as const) {
      if (patch[k] === undefined) continue;
      if (patch[k]) it[k] = true;
      else delete it[k];
    }
    if (patch.name !== undefined) {
      const key = ref.kind === "zone" ? "name" : "label";
      // kept as typed (a field being typed in may end in a space); blank brings the automatic name back
      if (patch.name.trim()) it[key] = patch.name;
      else delete it[key];
    }
  }, merge);
}

/** Draws a pickup with one of the game's characters (its id), or with the engine's icon (null). */
export function setObjectLook(store: EditorStore, levelId: string, name: string, look: string | null, label: string): void {
  editZones(store, levelId, label, (level) => {
    const o = findObject(level, name);
    if (!o || o.type !== "pickup") return;
    if (look) o.look = look;
    else delete o.look;
  });
}

/** Moves an object to a place (x, y in level px, kept inside the level); typing in a field is one step. */
export function moveObject(store: EditorStore, levelId: string, name: string, x: number, y: number, label: string, merge?: string): void {
  editZones(
    store,
    levelId,
    label,
    (level) => {
      const o = findObject(level, name);
      if (!o) return;
      o.x = Math.max(0, Math.min(level.size.w, Math.round(x)));
      o.y = Math.max(0, Math.min(level.size.h, Math.round(y)));
    },
    merge,
  );
}

/** Moves or resizes a zone, on the 16 px grid and inside the level; typing in a field is one step. */
export function placeZone(store: EditorStore, levelId: string, id: string, r: { x?: number; y?: number; w?: number; h?: number }, label: string, merge?: string): void {
  editZones(
    store,
    levelId,
    label,
    (level) => {
      const z = findZone(level, id);
      if (!z) return;
      const snap = (v: number) => Math.round(v / 16) * 16;
      const w = Math.max(16, Math.min(level.size.w, snap(r.w ?? z.w)));
      const h = Math.max(16, Math.min(level.size.h, snap(r.h ?? z.h)));
      z.x = Math.max(0, Math.min(level.size.w - w, snap(r.x ?? z.x)));
      z.y = Math.max(0, Math.min(level.size.h - h, snap(r.y ?? z.y)));
      z.w = w;
      z.h = h;
    },
    merge,
  );
}
