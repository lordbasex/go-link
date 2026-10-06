// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The Layers panel: the level's groups, each with its zones and objects
// (the one drawn on top first), and the background at the end. Groups and
// rows show, hide and lock (hidden ones are not in the game either), rename
// with a double click, open a menu with a right click, and rows drag from
// one group to another. Clicking a group's header makes it the active group,
// where new zones and objects go.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, Folder, Lock, LockOpen } from "lucide-react";
import { useStudioText } from "../../i18n";
import { groupOf, objectLayer, type LayerGroup, type Level, type LevelObject, type Zone } from "../../model";
import type { EditorStore } from "../../editor/store";
import { backgroundLayer, moveToGroup, patchGroup, patchItem, sameRef, setBackgroundFlags, setGroupOpen, type ItemRef } from "../../editor/zoneOps";
import type { TileImage } from "../render";
import { LevelThumb } from "./LevelThumb";
import { groupName, hasBackgroundArt } from "./select";
import { useStudioUi, useUiState, type Renaming } from "./state";

const ROLE_SWATCH = { hero: "var(--color-text)", enemy: "var(--color-accent)", object: "var(--color-neutral-100)" } as const;

export interface LayerRowInfo {
  name: string;
  kind: string;
  swatch: string;
}

export interface LayersPanelProps {
  store: EditorStore;
  level: Level;
  version: number;
  images: Map<string, TileImage>;
  /** Name, kind and swatch of a zone or an object, translated. */
  zoneInfo: (z: Zone) => LayerRowInfo;
  objectInfo: (o: LevelObject) => LayerRowInfo & { role: keyof typeof ROLE_SWATCH };
  backgroundName: string;
  onPlace: () => void;
  onInsertBackground: () => void;
}

export function LayersPanel({ store, level, version, images, zoneInfo, objectInfo, backgroundName, onPlace, onInsertBackground }: LayersPanelProps) {
  const t = useStudioText();
  const ui = useStudioUi();
  const s = useUiState();
  const dragging = useRef<ItemRef | null>(null);
  const [dropGroup, setDropGroup] = useState<string | null>(null);
  const groups = level.groups ?? [];
  const bg = backgroundLayer(level);
  const hasBg = hasBackgroundArt(level);

  const isRenaming = (kind: Renaming["kind"], id: string) => s.renaming?.kind === kind && s.renaming.id === id;
  const endRename = () => ui.set({ renaming: null });

  const over = (gid: string) => (e: React.DragEvent) => {
    if (!dragging.current) return;
    e.preventDefault();
    e.stopPropagation();
    if (dropGroup !== gid) setDropGroup(gid);
  };
  const drop = (gid: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const d = dragging.current;
    dragging.current = null;
    setDropGroup(null);
    if (d) {
      moveToGroup(store, level.id, d, gid, t.groupUndo.moveTo);
      ui.set({ activeGroup: gid });
    }
  };

  const select = (ref: ItemRef, gid: string) => ui.set((st) => ({ sel: ref, activeGroup: gid, tool: st.tool === "erase" || st.tool === "hand" ? "select" : st.tool }));
  const rowMenu = (e: React.MouseEvent, ref: ItemRef, gid: string, at: { x: number; y: number }) => {
    e.preventDefault();
    e.stopPropagation();
    ui.set({ sel: ref, activeGroup: gid, menu: { x: e.clientX, y: e.clientY, target: { kind: "canvas", at, ref } }, viewMenu: false });
  };

  return (
    <div className="studio-layers-list">
      {groups.map((g) => {
        const rows: ReactNode[] = [];
        const objects = objectLayer(level).items.filter((o) => groupOf(level, o, "objects")?.id === g.id).reverse();
        const zones = (level.zones ?? []).filter((z) => groupOf(level, z, "zones")?.id === g.id).reverse();
        for (const o of objects) {
          const info = objectInfo(o);
          const ref: ItemRef = { kind: "object", id: o.name };
          rows.push(
            <LayerRow
              key={`o:${o.name}`}
              itemRef={ref}
              info={{ ...info, swatch: ROLE_SWATCH[info.role] }}
              hidden={o.hidden === true}
              locked={o.locked === true}
              groupHidden={!g.visible}
              selected={sameRef(ref, s.sel)}
              renaming={isRenaming("object", o.name)}
              onSelect={() => select(ref, g.id)}
              onRename={() => ui.set({ renaming: { kind: "object", id: o.name } })}
              onRenamed={(name) => {
                patchItem(store, level.id, ref, { name }, t.groupUndo.rename);
                endRename();
              }}
              onEye={() => patchItem(store, level.id, ref, { hidden: !o.hidden }, t.groupUndo.visibility)}
              onLock={() => {
                patchItem(store, level.id, ref, { locked: !o.locked }, t.groupUndo.lock);
                if (sameRef(ref, ui.get().sel)) ui.set({ sel: null });
              }}
              onMenu={(e) => rowMenu(e, ref, g.id, { x: o.x, y: o.y })}
              onDragStart={() => (dragging.current = ref)}
              onDragEnd={() => {
                dragging.current = null;
                setDropGroup(null);
              }}
            />,
          );
        }
        for (const z of zones) {
          const ref: ItemRef = { kind: "zone", id: z.id };
          rows.push(
            <LayerRow
              key={`z:${z.id}`}
              itemRef={ref}
              info={zoneInfo(z)}
              hidden={z.hidden === true}
              locked={z.locked === true}
              groupHidden={!g.visible}
              selected={sameRef(ref, s.sel)}
              renaming={isRenaming("zone", z.id)}
              onSelect={() => select(ref, g.id)}
              onRename={() => ui.set({ renaming: { kind: "zone", id: z.id } })}
              onRenamed={(name) => {
                patchItem(store, level.id, ref, { name }, t.groupUndo.rename);
                endRename();
              }}
              onEye={() => patchItem(store, level.id, ref, { hidden: !z.hidden }, t.groupUndo.visibility)}
              onLock={() => {
                patchItem(store, level.id, ref, { locked: !z.locked }, t.groupUndo.lock);
                if (sameRef(ref, ui.get().sel)) ui.set({ sel: null });
              }}
              onMenu={(e) => rowMenu(e, ref, g.id, { x: z.x, y: z.y })}
              onDragStart={() => (dragging.current = ref)}
              onDragEnd={() => {
                dragging.current = null;
                setDropGroup(null);
              }}
            />,
          );
        }
        const name = groupName(g, t.groupNames);
        return (
          <div key={g.id} className="studio-group" onDragOver={over(g.id)} onDragLeave={(e) => e.currentTarget === e.target && setDropGroup(null)} onDrop={drop(g.id)}>
            <GroupHeader
              group={g}
              name={name}
              count={rows.length}
              active={s.activeGroup === g.id}
              dropTarget={dropGroup === g.id}
              renaming={isRenaming("group", g.id)}
              onSelect={() => ui.set((st) => ({ activeGroup: st.activeGroup === g.id ? null : g.id }))}
              onToggle={() => setGroupOpen(store, level.id, g.id, !g.open)}
              onEye={() => patchGroup(store, level.id, g.id, { visible: !g.visible }, t.groupUndo.visibility)}
              onLock={() => {
                patchGroup(store, level.id, g.id, { locked: !g.locked }, t.groupUndo.lock);
                ui.set({ sel: null });
              }}
              onRename={() => ui.set({ renaming: { kind: "group", id: g.id } })}
              onRenamed={(value) => {
                patchGroup(store, level.id, g.id, { name: value }, t.groupUndo.rename);
                endRename();
              }}
              onMenu={(e) => {
                e.preventDefault();
                ui.set({ activeGroup: g.id, menu: { x: e.clientX, y: e.clientY, target: { kind: "group", id: g.id } }, viewMenu: false });
              }}
            />
            {g.open && rows}
            {g.open && rows.length === 0 && (
              <button
                type="button"
                className="studio-group-empty"
                disabled={!g.base}
                onClick={() => {
                  if (g.base === "objects") onPlace();
                  else if (g.base === "zones") ui.set({ tool: "zone", activeGroup: g.id });
                }}
              >
                {g.base === "objects" ? t.layersPanel.emptyObjects : g.base === "zones" ? t.layersPanel.emptyZones : t.layersPanel.emptyGroup}
              </button>
            )}
          </div>
        );
      })}
      <div className="studio-group">
        <div className="studio-group-head is-background">
          <IconToggle on={bg?.visible !== false} label={t.layersPanel.bgEye} onClick={() => setBackgroundFlags(store, level.id, { visible: bg?.visible === false }, t.groupUndo.visibility)} kind="eye" />
          <IconToggle
            on={!!bg?.locked}
            label={t.layersPanel.bgLock}
            onClick={() => {
              setBackgroundFlags(store, level.id, { locked: !bg?.locked }, t.groupUndo.lock);
              if (ui.get().sel?.kind === "bg") ui.set({ sel: null });
            }}
            kind="lock"
          />
          <span className="studio-group-name">{t.backgroundName}</span>
        </div>
        {hasBg ? (
          <div
            className={`studio-bg-row${s.sel?.kind === "bg" ? " is-selected" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => ui.set({ sel: { kind: "bg" }, activeGroup: null })}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && ui.set({ sel: { kind: "bg" }, activeGroup: null })}
            onContextMenu={(e) => {
              e.preventDefault();
              ui.set({ sel: { kind: "bg" }, menu: { x: e.clientX, y: e.clientY, target: { kind: "canvas", at: { x: level.size.w / 2, y: level.size.h / 2 }, ref: { kind: "bg" } } } });
            }}
          >
            <LevelThumb level={level} images={images} w={32} h={20} version={version} />
            <span className="studio-ellipsis">{backgroundName}</span>
          </div>
        ) : (
          <button type="button" className="studio-group-empty is-background" onClick={onInsertBackground}>
            {t.layersPanel.insertBackground}
          </button>
        )}
      </div>
    </div>
  );
}

function IconToggle({ on, label, onClick, kind }: { on: boolean; label: string; onClick: () => void; kind: "eye" | "lock" }) {
  const Icon = kind === "eye" ? (on ? Eye : EyeOff) : on ? Lock : LockOpen;
  return (
    <button
      type="button"
      className={`studio-mini${kind === "eye" ? (on ? "" : " is-off") : on ? "" : " is-faint"}`}
      aria-label={label}
      aria-pressed={kind === "eye" ? !on : on}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <Icon size={kind === "eye" ? 15 : 13} aria-hidden="true" />
    </button>
  );
}

function RenameInput({ value, label, onDone }: { value: string; label: string; onDone: (value: string) => void }) {
  const [text, setText] = useState(value);
  const done = useRef(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone(text);
  };
  return (
    <input
      ref={ref}
      className="input studio-rename"
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          finish();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}

function GroupHeader(p: {
  group: LayerGroup;
  name: string;
  count: number;
  active: boolean;
  dropTarget: boolean;
  renaming: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onEye: () => void;
  onLock: () => void;
  onRename: () => void;
  onRenamed: (name: string) => void;
  onMenu: (e: React.MouseEvent) => void;
}) {
  const t = useStudioText();
  const g = p.group;
  return (
    <div
      className={`studio-group-head${p.active ? " is-active" : ""}${p.dropTarget ? " is-drop" : ""}${g.visible ? "" : " is-hidden"}`}
      title={t.layersPanel.groupTip}
      onClick={p.onSelect}
      onDoubleClick={p.onRename}
      onContextMenu={p.onMenu}
    >
      <button
        type="button"
        className="studio-mini"
        aria-label={t.layersPanel.openClose}
        aria-expanded={g.open}
        title={t.layersPanel.openClose}
        onClick={(e) => {
          e.stopPropagation();
          p.onToggle();
        }}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {g.open ? <ChevronDown size={14} strokeWidth={2.5} aria-hidden="true" /> : <ChevronRight size={14} strokeWidth={2.5} aria-hidden="true" />}
      </button>
      <IconToggle on={g.visible} label={t.layersPanel.groupEye} onClick={p.onEye} kind="eye" />
      <IconToggle on={g.locked} label={t.layersPanel.groupLock} onClick={p.onLock} kind="lock" />
      <span className="studio-group-title">
        <Folder size={14} aria-hidden="true" />
        {p.renaming ? <RenameInput value={g.name ?? p.name} label={t.layersPanel.rename(p.name)} onDone={p.onRenamed} /> : <span className="studio-group-name">{p.name}</span>}
      </span>
      <span className="studio-group-count tabular">{p.count || ""}</span>
    </div>
  );
}

function LayerRow(p: {
  itemRef: ItemRef;
  info: LayerRowInfo;
  hidden: boolean;
  locked: boolean;
  groupHidden: boolean;
  selected: boolean;
  renaming: boolean;
  onSelect: () => void;
  onRename: () => void;
  onRenamed: (name: string) => void;
  onEye: () => void;
  onLock: () => void;
  onMenu: (e: React.MouseEvent) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const t = useStudioText();
  return (
    <div
      className={`studio-layer${p.selected ? " is-selected" : ""}${p.groupHidden ? " is-group-hidden" : ""}`}
      role="button"
      tabIndex={0}
      aria-pressed={p.selected}
      draggable={!p.renaming}
      onDragStart={(e) => {
        p.onDragStart();
        e.dataTransfer.effectAllowed = "move";
        try {
          e.dataTransfer.setData("text/plain", p.info.name);
        } catch {
          // some browsers refuse data on drag start; the panel keeps the item itself
        }
      }}
      onDragEnd={p.onDragEnd}
      onClick={p.onSelect}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          p.onSelect();
        }
      }}
      onDoubleClick={p.onRename}
      onContextMenu={p.onMenu}
    >
      <span className={p.hidden ? "studio-eye-off" : undefined}>
        <IconToggle on={!p.hidden} label={t.layersPanel.eye} onClick={p.onEye} kind="eye" />
      </span>
      <IconToggle on={p.locked} label={t.layersPanel.lock} onClick={p.onLock} kind="lock" />
      <span className="studio-layer-swatch" style={{ background: p.info.swatch }} aria-hidden="true" />
      {p.renaming ? <RenameInput value={p.info.name} label={t.layersPanel.rename(p.info.name)} onDone={p.onRenamed} /> : <span className="studio-layer-name">{p.info.name}</span>}
      <span className="studio-layer-kind">{p.info.kind}</span>
    </div>
  );
}

