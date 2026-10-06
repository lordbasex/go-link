// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// How zones and objects look on the canvas (docs/willy-maker/editor.md):
// each zone kind has its own fill and border in ink or accent, scaled by
// the zoom; objects are boxes the size of their sprite (heroes ink,
// enemies accent, the rest outlined), with a small square eye on the side
// they face. Selected items get an accent outline, and a selected zone a
// handle to resize it.

import type { CSSProperties } from "react";
import type { LevelObject, Zone, ZoneKind } from "../../model";
import { roleOf } from "./catalog";
import { OwnSprite, useOwnSheet } from "./ownSprites";

const INK = "var(--color-text)";
const RED = "var(--color-accent)";
const mix = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`;

/** A zone kind's fill and borders at zoom z. */
export function zoneStyle(kind: ZoneKind, z: number): CSSProperties {
  switch (kind) {
    case "floor":
      return { background: mix(INK, 55), borderTop: `3px solid ${INK}` };
    case "platform":
      return { background: mix(INK, 18), borderTop: `4px solid ${INK}` };
    case "ladder":
      return { background: `repeating-linear-gradient(180deg, ${INK} 0 2px, transparent 2px ${6 * z}px)`, borderLeft: `2px solid ${INK}`, borderRight: `2px solid ${INK}` };
    case "crate": {
      const x = `transparent 47%, ${INK} 47% 53%, transparent 53%`;
      return { background: `linear-gradient(45deg, ${x}), linear-gradient(-45deg, ${x}), ${mix(INK, 25)}`, border: `2px solid ${INK}` };
    }
    case "breakable":
      return { background: mix(INK, 22), border: `2px dashed ${INK}` };
    case "hazard":
      return { background: `repeating-linear-gradient(45deg, ${RED} 0 ${3 * z}px, ${mix(RED, 25)} ${3 * z}px ${6 * z}px)`, border: `2px solid ${RED}` };
    case "water":
      return { background: `repeating-linear-gradient(0deg, ${mix(INK, 30)} 0 2px, ${mix(INK, 10)} 2px ${5 * z}px)`, border: `2px dotted ${INK}` };
  }
}

export function ZoneBox({ zone, z, label, selected, showLabel }: { zone: Zone; z: number; label: string; selected: boolean; showLabel: boolean }) {
  return (
    <div
      className={`studio-zone${selected ? " is-selected" : ""}`}
      data-zone={zone.id}
      style={{ left: zone.x * z, top: zone.y * z, width: zone.w * z, height: zone.h * z, ...zoneStyle(zone.kind, z) }}
    >
      {showLabel && <span className={`studio-zone-label${zone.kind === "hazard" ? " is-hazard" : ""}`}>{label}</span>}
      {selected && <div className="studio-handle" data-handle={zone.id} />}
    </div>
  );
}

export function ObjectBox({ o, box, z, label, selected, showLabel }: { o: LevelObject; box: { x: number; y: number; w: number; h: number }; z: number; label: string; selected: boolean; showLabel: boolean }) {
  const role = roleOf(o);
  const helper = o.type === "camera_lock" || o.type === "checkpoint" || o.type === "exit" || o.type === "platform";
  const left = o.facing === "left";
  // the game's own character draws it, as in play mode and the ROM
  const sheet = useOwnSheet(o);
  return (
    <div className={`studio-object${selected ? " is-selected" : ""}`} data-object={o.name} style={{ left: box.x * z, top: box.y * z, width: box.w * z, height: box.h * z }}>
      <div className={`studio-object-body is-${helper ? "helper" : role}${sheet ? " has-sprite" : ""}`} style={{ transform: left ? "scaleX(-1)" : undefined }}>
        {sheet ? <OwnSprite sheet={sheet} board={{ z, w: box.w, h: box.h }} /> : !helper && <div className="studio-object-eye" style={{ top: box.h * z * 0.18, right: box.w * z * 0.18, width: 3 * z, height: 3 * z }} />}
      </div>
      {showLabel && <span className="studio-object-label">{label}</span>}
    </div>
  );
}
