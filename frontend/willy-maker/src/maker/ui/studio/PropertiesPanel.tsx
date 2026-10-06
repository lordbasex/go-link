// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Properties of what is selected: a zone (its name, kind, place and size,
// and a breakable zone's hits), a character or object (its name, sprite,
// place and the side it faces) or the background (its picture). Typing in a
// field changes the game at once; the letters or digits typed in one field
// are one undo step. A pickup can be drawn with one of the game's characters.

import { useEffect, useState } from "react";
import { useStudioText } from "../../i18n";
import type { Level, LevelObject, Zone, ZoneKind } from "../../model";
import type { EditorStore } from "../../editor/store";
import { findObject, findZone, moveObject, patchItem, patchZone, placeZone, setObjectLook, type ItemRef } from "../../editor/zoneOps";
import type { TileImage } from "../render";
import { ZONE_SWATCH } from "./kinds";
import { LevelThumb } from "./LevelThumb";
import { boxOf } from "./select";
import { useUiState } from "./state";
import type { Role } from "./catalog";
import { OwnSprite, useOwnSheet } from "./ownSprites";

export interface PropertiesProps {
  store: EditorStore;
  level: Level;
  version: number;
  images: Map<string, TileImage>;
  kinds: readonly ZoneKind[];
  zoneLabel: (z: Zone) => string;
  objectInfo: (o: LevelObject) => { name: string; sprite: string; role: Role };
  /** The game's own characters, for a pickup's picture. */
  characters: readonly { id: string; name: string }[];
  backgroundName: string;
  onDuplicate: (ref: ItemRef) => void;
  onDelete: (ref: ItemRef) => void;
  onChangeSprite: (name: string) => void;
  onFlip: (name: string) => void;
  onReplaceBackground: () => void;
  onRemoveBackground: () => void;
}

export function PropertiesPanel(p: PropertiesProps) {
  const t = useStudioText();
  const s = useUiState();
  const sel = s.sel;
  const zone = sel?.kind === "zone" ? findZone(p.level, sel.id) : undefined;
  const object = sel?.kind === "object" ? findObject(p.level, sel.id) : undefined;
  const kind = zone ? t.props.zone : object ? t.roles[p.objectInfo(object).role] : sel?.kind === "bg" ? t.props.background : "";

  return (
    <section className="studio-props" aria-labelledby="studio-props-title">
      <div className="studio-props-head">
        <span id="studio-props-title" className="mdn-kicker">
          {t.properties}
        </span>
        {kind && <span className="studio-props-kind">{kind}</span>}
      </div>
      {zone ? (
        <ZoneProps {...p} zone={zone} />
      ) : object ? (
        <ObjectProps {...p} object={object} />
      ) : sel?.kind === "bg" ? (
        <>
          <LevelThumb level={p.level} images={p.images} w={Math.max(120, s.rightW - 28)} h={Math.round((Math.max(120, s.rightW - 28) * 9) / 16)} version={p.version} />
          <div className="studio-props-title studio-ellipsis">{p.backgroundName}</div>
          <div className="studio-props-actions">
            <button type="button" className="btn btn-secondary" onClick={p.onReplaceBackground}>
              {t.props.replace}
            </button>
            <button type="button" className="btn btn-secondary is-danger" onClick={p.onRemoveBackground}>
              {t.props.remove}
            </button>
          </div>
        </>
      ) : (
        <p className="studio-muted">{t.nothingSelected}</p>
      )}
    </section>
  );
}

function ZoneProps({ store, level, kinds, zone, zoneLabel, onDuplicate, onDelete }: PropertiesProps & { zone: Zone }) {
  const t = useStudioText();
  const label = t.undoLabels.kind;
  const merge = (field: string) => `zone:${zone.id}:${field}`;
  const shown = kinds.includes(zone.kind) ? kinds : [...kinds, zone.kind];
  return (
    <>
      <NameField key={zone.id} value={zoneLabel(zone)} label={t.props.name} onChange={(v) => patchItem(store, level.id, { kind: "zone", id: zone.id }, { name: v }, t.groupUndo.rename, merge("name"))} />
      <div className="studio-props-kinds" role="radiogroup" aria-label={t.thisIs}>
        {shown.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={zone.kind === k} className="studio-chip" onClick={() => patchZone(store, level.id, zone.id, { kind: k }, label)}>
            <span className="mdn-swatch" style={{ background: ZONE_SWATCH[k] }} aria-hidden="true" />
            {t.zoneKinds[k].name}
          </button>
        ))}
      </div>
      <p className="studio-props-hint">{t.zoneKinds[zone.kind].hint}</p>
      <div className="studio-props-fields is-4">
        {(["x", "y", "w", "h"] as const).map((f) => (
          <NumberField key={`${zone.id}:${f}`} label={t.props[f]} value={zone[f]} step={16} onCommit={(v) => placeZone(store, level.id, zone.id, { [f]: v }, t.props.nudge, merge(f))} />
        ))}
      </div>
      {zone.kind === "breakable" && (
        <div className="studio-props-fields is-4">
          <NumberField key={`${zone.id}:hp`} label={t.props.hits} value={zone.hp ?? 3} step={1} min={1} max={99} onCommit={(v) => patchZone(store, level.id, zone.id, { hp: v }, t.props.hits, merge("hp"))} />
        </div>
      )}
      <div className="studio-props-actions">
        <button type="button" className="btn btn-secondary" onClick={() => onDuplicate({ kind: "zone", id: zone.id })}>
          {t.props.duplicate}
        </button>
        <button type="button" className="btn btn-secondary is-danger" onClick={() => onDelete({ kind: "zone", id: zone.id })}>
          {t.props.delete}
        </button>
      </div>
    </>
  );
}

function ObjectProps({ store, level, object, objectInfo, characters, onChangeSprite, onFlip, onDelete }: PropertiesProps & { object: LevelObject }) {
  const t = useStudioText();
  const s = useUiState();
  const info = objectInfo(object);
  const box = boxOf(object);
  const sheet = useOwnSheet(object);
  const merge = (field: string) => `object:${object.name}:${field}`;
  const scale = Math.min(2, 56 / Math.max(box.w, box.h));
  return (
    <>
      <div className="studio-props-object">
        <div className="studio-props-thumb" aria-hidden="true">
          {sheet ? (
            <span className="studio-pick-own">
              <OwnSprite sheet={sheet} flip={object.facing === "left"} />
            </span>
          ) : (
            <span className={`studio-pick-sprite is-${info.role}`} style={{ width: box.w * scale, height: box.h * scale, transform: object.facing === "left" ? "scaleX(-1)" : undefined }} />
          )}
        </div>
        <div className="studio-props-object-text">
          <NameField
            key={object.name}
            value={info.name}
            label={t.props.name}
            onChange={(v) => patchItem(store, level.id, { kind: "object", id: object.name }, { name: v }, t.groupUndo.rename, merge("name"))}
          />
          <span className="studio-props-meta">{t.props.meta(t.roles[info.role], info.sprite, box.w, box.h)}</span>
        </div>
      </div>
      <button type="button" className="btn btn-secondary" onClick={() => onChangeSprite(object.name)}>
        {t.props.changeSprite}
      </button>
      <div className="studio-props-fields is-2">
        {(["x", "y"] as const).map((f) => (
          <NumberField
            key={`${object.name}:${f}`}
            label={t.props[f]}
            value={object[f]}
            step={object.type === "crate" ? 16 : s.grid}
            onCommit={(v) => moveObject(store, level.id, object.name, f === "x" ? v : object.x, f === "y" ? v : object.y, t.props.nudge, merge(f))}
          />
        ))}
      </div>
      {object.type === "pickup" && (
        <label className="studio-props-field">
          {t.props.look}
          <select className="input" value={typeof object.look === "string" ? object.look : ""} onChange={(e) => setObjectLook(store, level.id, object.name, e.target.value || null, t.props.look)}>
            <option value="">{t.props.engineIcon}</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.id}
              </option>
            ))}
          </select>
          <span className="studio-props-meta">{t.props.lookHelp}</span>
        </label>
      )}
      <div className="studio-props-actions">
        <button type="button" className="btn btn-secondary" onClick={() => onFlip(object.name)}>
          {object.facing === "left" ? t.menu.lookRight : t.menu.lookLeft}
        </button>
        <button type="button" className="btn btn-secondary is-danger" onClick={() => onDelete({ kind: "object", id: object.name })}>
          {t.props.delete}
        </button>
      </div>
    </>
  );
}

/** The name field: it shows the name in use; emptied, the automatic name comes back once the field is left. */
function NameField({ value, label, onChange }: { value: string; label: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(value);
  }, [value, editing]);
  return (
    <input
      className="input studio-props-name"
      aria-label={label}
      value={text}
      onFocus={() => setEditing(true)}
      onBlur={() => setEditing(false)}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value);
      }}
    />
  );
}

/** A number field: valid numbers change the game as they are typed; leaving it shows the value the game kept. */
function NumberField({ label, value, step, min, max, onCommit }: { label: string; value: number; step: number; min?: number; max?: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);
  return (
    <label className="studio-props-field">
      {label}
      <input
        className="input tabular"
        type="number"
        step={step}
        min={min}
        max={max}
        value={text}
        onFocus={() => setEditing(true)}
        onBlur={() => {
          setEditing(false);
          setText(String(value));
        }}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(v)) onCommit(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v)));
        }}
      />
    </label>
  );
}
