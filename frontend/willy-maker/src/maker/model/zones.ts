// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Zones and layer groups (format 4). A zone is a rectangle that says what a
// part of the level is (floor, platform, ladder…); the collision layer that
// play mode and the ROM read is drawn from the visible zones, so both engines
// stay exactly as they are. Levels made before zones existed get theirs from
// their collision cells, joined into as few rectangles as a greedy cover
// gives. Pure: no DOM, no store.

import { decodeCells, encodeCells } from "./rle";
import { TAG_NUMBER, ZONE_KINDS, ZONE_TAG, type Level, type LayerGroup, type LevelObject, type ObjectLayer, type TagLayer, type Zone, type ZoneKind } from "./types";

/** The collision grid (px). Zones always sit on it. */
const GRID = 16;

export const OBJECTS_GROUP = "group-objects";
export const ZONES_GROUP = "group-zones";

const KIND_OF_TAG = new Map<number, ZoneKind>(ZONE_KINDS.map((k) => [TAG_NUMBER[ZONE_TAG[k]], k]));

export function isZoneKind(v: unknown): v is ZoneKind {
  return typeof v === "string" && (ZONE_KINDS as readonly string[]).includes(v);
}

/** The two base groups, in the panel's order (objects over zones). */
export function baseGroups(): LayerGroup[] {
  return [
    { id: OBJECTS_GROUP, base: "objects", visible: true, locked: false, open: true },
    { id: ZONES_GROUP, base: "zones", visible: true, locked: false, open: true },
  ];
}

/** The group a zone or an object is listed in: its own when it exists, else the base group of its kind. */
export function groupOf(level: Level, item: { group?: string }, kind: "objects" | "zones"): LayerGroup | undefined {
  const groups = level.groups ?? [];
  return groups.find((g) => g.id === item.group) ?? groups.find((g) => g.base === kind);
}

/** Whether a zone is in the game: neither it nor its group is hidden. */
export function zoneVisible(level: Level, z: Zone): boolean {
  return !z.hidden && groupOf(level, z, "zones")?.visible !== false;
}

/** Whether an object is in the game: neither it nor its group is hidden. */
export function objectVisible(level: Level, o: LevelObject): boolean {
  return o.hidden !== true && groupOf(level, o, "objects")?.visible !== false;
}

/** The cells a crate object fills (its top left cell, 1 or 2 cells a side), as play mode and the ROM add them. */
export function crateCells(o: LevelObject): { c0: number; r0: number; n: number } {
  return { c0: Math.floor(o.x / GRID), r0: Math.floor(o.y / GRID), n: (Number(o.size) || 32) >= 32 ? 2 : 1 };
}

function crateObjects(level: Level): LevelObject[] {
  const layer = level.layers.find((l): l is ObjectLayer => l.kind === "objects");
  return (layer?.items ?? []).filter((o) => o.type === "crate");
}

/** The number for a new zone's automatic name: one more than the highest of its kind. */
export function nextZoneNumber(zones: readonly Zone[], kind: ZoneKind): number {
  let n = 0;
  for (const z of zones) if (z.kind === kind && z.n > n) n = z.n;
  return n + 1;
}

/** The number for a new group's automatic name ("Group n"). */
export function nextGroupNumber(groups: readonly LayerGroup[]): number {
  let n = 0;
  for (const g of groups) if (!g.base && (g.n ?? 0) > n) n = g.n ?? 0;
  return n + 1;
}

/**
 * Draws the visible zones into the collision layer's cells (air elsewhere),
 * later zones over earlier ones, with each breakable cell's hits. Returns the
 * layer's new data and per-cell properties; the caller stores them.
 */
export function tagsFromZones(level: Level): { data: string; props: Record<string, Record<string, unknown>> } {
  const cols = Math.ceil(level.size.w / GRID);
  const rows = Math.ceil(level.size.h / GRID);
  const cells = new Uint16Array(cols * rows);
  const hp = new Map<number, number>();
  for (const z of level.zones ?? []) {
    if (!zoneVisible(level, z)) continue;
    const tag = TAG_NUMBER[ZONE_TAG[z.kind]];
    const c0 = Math.max(0, Math.floor(z.x / GRID));
    const r0 = Math.max(0, Math.floor(z.y / GRID));
    const c1 = Math.min(cols, Math.ceil((z.x + z.w) / GRID));
    const r1 = Math.min(rows, Math.ceil((z.y + z.h) / GRID));
    for (let r = r0; r < r1; r++)
      for (let c = c0; c < c1; c++) {
        const i = r * cols + c;
        cells[i] = tag;
        if (z.kind === "breakable" && z.hp !== undefined) hp.set(i, z.hp);
        else hp.delete(i);
      }
  }
  // crates are objects; their cells come from them where nothing else is (as play mode and the ROM do)
  for (const o of crateObjects(level)) {
    if (!objectVisible(level, o)) continue;
    const { c0, r0, n } = crateCells(o);
    for (let r = r0; r < Math.min(rows, r0 + n); r++) for (let c = c0; c < Math.min(cols, c0 + n); c++) if (c >= 0 && r >= 0 && cells[r * cols + c] === 0) cells[r * cols + c] = TAG_NUMBER.crate;
  }
  const props: Record<string, Record<string, unknown>> = {};
  for (const [i, v] of hp) props[`${i % cols},${Math.floor(i / cols)}`] = { hp: v };
  return { data: encodeCells(cells), props };
}

/** Writes tagsFromZones into the level's collision layer (in place). */
export function applyZones(level: Level): void {
  const layer = level.layers.find((l): l is TagLayer => l.kind === "tags");
  if (!layer) return;
  const { data, props } = tagsFromZones(level);
  layer.data = data;
  if (Object.keys(props).length) layer.props = props;
  else delete layer.props;
}

/**
 * Covers a collision layer's cells with rectangles, one zone each: from the
 * top left, a run of equal cells (same tag and hits) is widened as far as it
 * goes and then grown down while the row below matches it all. Air is left
 * out. Zones get ids `zone-<n>` and their kind's automatic numbers.
 */
export function zonesFromTags(level: Level, group = ZONES_GROUP): Zone[] {
  const layer = level.layers.find((l): l is TagLayer => l.kind === "tags");
  if (!layer) return [];
  const cols = Math.ceil(level.size.w / GRID);
  const rows = Math.ceil(level.size.h / GRID);
  const cells = decodeCells(layer.data, cols * rows);
  const hpAt = (c: number, r: number): number | undefined => {
    const v = layer.props?.[`${c},${r}`]?.hp;
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
  };
  const done = new Uint8Array(cols * rows);
  // a crate object's own cells are the object's, not a zone
  for (const o of crateObjects(level)) {
    const { c0, r0, n } = crateCells(o);
    for (let r = r0; r < Math.min(rows, r0 + n); r++) for (let c = c0; c < Math.min(cols, c0 + n); c++) if (c >= 0 && r >= 0 && cells[r * cols + c] === TAG_NUMBER.crate) done[r * cols + c] = 1;
  }
  const same = (i: number, c: number, r: number, tag: number, hp: number | undefined) => !done[i] && cells[i] === tag && hpAt(c, r) === hp;
  const zones: Zone[] = [];
  const count = new Map<ZoneKind, number>();
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const tag = cells[i]!;
      const kind = KIND_OF_TAG.get(tag);
      if (done[i] || !kind) continue;
      const hp = kind === "breakable" ? hpAt(c, r) : undefined;
      let w = 1;
      while (c + w < cols && same(i + w, c + w, r, tag, hp)) w++;
      let h = 1;
      grow: while (r + h < rows) {
        for (let k = 0; k < w; k++) if (!same((r + h) * cols + c + k, c + k, r + h, tag, hp)) break grow;
        h++;
      }
      for (let y = 0; y < h; y++) done.fill(1, (r + y) * cols + c, (r + y) * cols + c + w);
      const n = (count.get(kind) ?? 0) + 1;
      count.set(kind, n);
      zones.push({ id: `zone-${zones.length + 1}`, kind, n, x: c * GRID, y: r * GRID, w: w * GRID, h: h * GRID, group, ...(hp !== undefined ? { hp } : {}) });
    }
  return zones;
}

/**
 * Gives a level made before format 4 its zones (from its collision cells)
 * and its base groups. A level that already has zones is only checked.
 */
export function withZones(level: Level): Level {
  const groups = cleanGroups(level.groups);
  const out: Level = { ...level, groups };
  out.zones = Array.isArray(level.zones) ? cleanZones(out, level.zones) : zonesFromTags(out);
  return out;
}

/**
 * Makes a level's zones match its collision layer: when the layer is not
 * what its zones draw (no zones yet, or cells painted in the classic editor),
 * the zones are made again from the cells. Groups are kept; zone names are
 * lost only in that case. Returns whether the zones changed.
 */
export function reconcileZones(level: Level): boolean {
  const layer = level.layers.find((l): l is TagLayer => l.kind === "tags");
  if (!layer) return false;
  level.groups = cleanGroups(level.groups);
  if (level.zones) {
    const drawn = tagsFromZones(level);
    if (drawn.data === layer.data && sameHits(drawn.props, layer.props ?? {})) return false;
  }
  level.zones = zonesFromTags(level);
  return true;
}

/** Whether two cell property maps give every cell the same hits (key order aside). */
function sameHits(a: Record<string, Record<string, unknown>>, b: Record<string, Record<string, unknown>>): boolean {
  const hits = (m: Record<string, Record<string, unknown>>) =>
    Object.entries(m)
      .filter(([, v]) => typeof v?.hp === "number")
      .map(([k, v]) => `${k}=${String(v.hp)}`)
      .sort()
      .join(";");
  return hits(a) === hits(b);
}

/** The groups of a file: valid ones, unique ids, and both base groups present (first time at the top). */
export function cleanGroups(raw: unknown): LayerGroup[] {
  const seen = new Set<string>();
  const out: LayerGroup[] = [];
  for (const g of Array.isArray(raw) ? raw : []) {
    if (!g || typeof g !== "object" || typeof (g as LayerGroup).id !== "string") continue;
    const x = g as LayerGroup;
    if (seen.has(x.id)) continue;
    seen.add(x.id);
    const base = x.base === "objects" || x.base === "zones" ? x.base : undefined;
    if (base && out.some((o) => o.base === base)) continue;
    out.push({
      id: x.id,
      ...(typeof x.name === "string" && x.name.trim() ? { name: x.name } : {}),
      ...(!base && Number.isInteger(x.n) && x.n! > 0 ? { n: x.n } : {}),
      ...(base ? { base } : {}),
      visible: x.visible !== false,
      locked: x.locked === true,
      open: x.open !== false,
    });
  }
  for (const b of baseGroups()) if (!out.some((o) => o.base === b.base)) out.push({ ...b, id: seen.has(b.id) ? `${b.id}-${out.length}` : b.id });
  return out;
}

/** The zones of a file: known kinds, on the grid, inside the level, at least one cell, in an existing group. */
export function cleanZones(level: Level, raw: unknown): Zone[] {
  const groups = new Set((level.groups ?? []).map((g) => g.id));
  const fallback = level.groups?.find((g) => g.base === "zones")?.id ?? ZONES_GROUP;
  const seen = new Set<string>();
  const out: Zone[] = [];
  const snapDown = (v: unknown, max: number) => Math.min(max - GRID, Math.max(0, Math.floor((Number(v) || 0) / GRID) * GRID));
  for (const z of Array.isArray(raw) ? raw : []) {
    if (!z || typeof z !== "object") continue;
    const x = z as Zone;
    if (!isZoneKind(x.kind)) continue;
    let id = typeof x.id === "string" && x.id ? x.id : `zone-${out.length + 1}`;
    while (seen.has(id)) id = `${id}-2`;
    seen.add(id);
    const zx = snapDown(x.x, level.size.w);
    const zy = snapDown(x.y, level.size.h);
    const w = Math.min(level.size.w - zx, Math.max(GRID, Math.round((Number(x.w) || 0) / GRID) * GRID));
    const h = Math.min(level.size.h - zy, Math.max(GRID, Math.round((Number(x.h) || 0) / GRID) * GRID));
    out.push({
      id,
      kind: x.kind,
      ...(typeof x.name === "string" && x.name.trim() ? { name: x.name } : {}),
      n: Number.isInteger(x.n) && x.n > 0 ? x.n : nextZoneNumber(out, x.kind),
      x: zx,
      y: zy,
      w,
      h,
      group: typeof x.group === "string" && groups.has(x.group) ? x.group : fallback,
      ...(x.hidden === true ? { hidden: true } : {}),
      ...(x.locked === true ? { locked: true } : {}),
      ...(x.kind === "breakable" && typeof x.hp === "number" && Number.isFinite(x.hp) && x.hp > 0 ? { hp: Math.round(x.hp) } : {}),
    });
  }
  return out;
}

