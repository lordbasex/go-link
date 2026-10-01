// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Rows and small groups the panels are built from: a part button, a layer
// row, a property row, a warning row.

import { useState, type ReactNode } from "react";
import { useCore } from "../i18n";
import type { Layer } from "../model";
import { IconButton, Swatch } from "./atoms";
import { IconDown, IconEye, IconEyeOff, IconLock, IconUnlock, IconUp } from "./icons";

export function PartButton({ on, swatch, label, help, onClick, children }: { on: boolean; swatch?: ReactNode; label: string; help?: string; onClick: () => void; children?: ReactNode }) {
  return (
    <button type="button" className={`wm-part${on ? " is-on" : ""}`} aria-pressed={on} title={help} onClick={onClick}>
      {children ?? swatch}
      <span className="wm-part-label">{label}</span>
    </button>
  );
}

export function TagChip({ tag, on, onClick }: { tag: string; on: boolean; onClick: () => void }) {
  const t = useCore();
  return (
    <button type="button" className={`wm-cap is-sm${on ? " is-on" : ""}`} aria-pressed={on} title={t.tagsHelp[tag as keyof typeof t.tagsHelp]} onClick={onClick}>
      <Swatch kind="tag" name={tag} /> {t.tags[tag as keyof typeof t.tags]}
    </button>
  );
}

export function LayerRow({
  layer,
  active,
  first,
  last,
  onActivate,
  onToggleVisible,
  onToggleLock,
  onMove,
  onRename,
}: {
  layer: Layer;
  active: boolean;
  first: boolean;
  last: boolean;
  onActivate: () => void;
  onToggleVisible: () => void;
  onToggleLock: () => void;
  onMove: (dir: -1 | 1) => void;
  onRename: (name: string) => void;
}) {
  const t = useCore();
  const [editing, setEditing] = useState(false);
  const name = layer.name ?? layer.id;
  const visible = layer.visible !== false;
  const kind = layer.kind === "tiles" ? t.layers.board(layer.grid) : layer.kind === "tags" ? `${t.layers.kinds.tags} · 16` : t.layers.kinds.objects;
  return (
    <li className={`wm-layer${active ? " is-on" : ""}${visible ? "" : " is-hidden"}`}>
      <IconButton className="is-xs" label={visible ? t.layers.hide(name) : t.layers.show(name)} on={visible} onClick={onToggleVisible}>
        {visible ? <IconEye /> : <IconEyeOff />}
      </IconButton>
      <IconButton className="is-xs" label={layer.locked ? t.layers.unlock(name) : t.layers.lock(name)} on={!!layer.locked} onClick={onToggleLock}>
        {layer.locked ? <IconLock /> : <IconUnlock />}
      </IconButton>
      {editing ? (
        <input
          className="wm-input is-sm wm-layer-name"
          defaultValue={name}
          aria-label={t.layers.rename}
          autoFocus
          maxLength={40}
          onBlur={(e) => {
            setEditing(false);
            if (e.target.value.trim()) onRename(e.target.value.trim());
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <button type="button" className="wm-layer-name" aria-pressed={active} onClick={onActivate} onDoubleClick={() => setEditing(true)} title={t.layers.rename}>
          {name}
        </button>
      )}
      <span className="wm-mono wm-layer-kind">{kind}</span>
      <span className="wm-layer-order">
        <IconButton className="is-xs" label={t.layers.up} disabled={first} onClick={() => onMove(1)}>
          <IconUp />
        </IconButton>
        <IconButton className="is-xs" label={t.layers.down} disabled={last} onClick={() => onMove(-1)}>
          <IconDown />
        </IconButton>
      </span>
    </li>
  );
}

export function PropRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="wm-prop">
      <span>{label}</span>
      {children}
    </label>
  );
}
