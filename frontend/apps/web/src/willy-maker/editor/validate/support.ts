// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Level 1 rules for parts the play engine does not use yet
// (docs/willy-maker/validation.md): `part.soon` warns about every placed
// object, and every level with water, whose part is "coming soon" in
// editor/support.ts; `part.shared` notes, once per level, that all enemy
// kinds play the same way for now. Warnings and notes never block the
// AI pack. The texts come from the core i18n (`support`), the same ones
// the editor's badges show.

import { CELL, objectLayer, tagGrid, TAG_NUMBER, type Level, type Project } from "../../model";
import { coreEn, type CoreMessages } from "../../i18n/core.en";
import { coreEs } from "../../i18n/core.es";
import { corePt } from "../../i18n/core.pt";
import { objectSupport, partSupport, type SupportReason } from "../support";
import type { Check } from ".";

const LANGS: Record<"en" | "es" | "pt", CoreMessages> = { en: coreEn, es: coreEs, pt: corePt };

const levelName = (l: Level, i: number) => l.name?.trim() || `${i + 1}`;

function texts(fn: (t: CoreMessages) => string): Check["texts"] {
  return { en: fn(LANGS.en), es: fn(LANGS.es), pt: fn(LANGS.pt) };
}

export function supportChecks(p: Project): Check[] {
  const out: Check[] = [];
  let soon = 0;
  p.levels.forEach((level, i) => {
    const name = levelName(level, i);
    let items: ReturnType<typeof objectLayer>["items"] = [];
    try {
      items = objectLayer(level).items;
    } catch {
      items = [];
    }
    const warn = (reason: SupportReason, what: string, x?: number, y?: number, object?: string) => {
      soon++;
      out.push({
        id: "part.soon",
        severity: "warning",
        msg: "part.soon",
        params: { level: name, name: what, reason },
        texts: texts((t) => t.support.soonCheck(name, what, t.support.reasons[reason])),
        target: { tab: "build", level: level.id, x, y, object },
      });
    };
    for (const o of items) {
      const s = objectSupport(o);
      if (s.status === "soon" && s.reason) warn(s.reason, String(o.name), o.x, o.y, o.name);
    }
    // water is a collision tag: one warning for the level, at its first cell
    try {
      const g = tagGrid(level);
      const at = g.cells.indexOf(TAG_NUMBER.water);
      const water = partSupport("tag:water");
      if (at >= 0 && water.status === "soon" && water.reason) warn(water.reason, "water", (at % g.cols) * CELL, Math.floor(at / g.cols) * CELL);
    } catch {
      // a broken collision layer is reported by the other rules
    }
    const enemies = items.filter((o) => o.type === "enemy" && objectSupport(o).shared);
    if (enemies.length) {
      const kinds = [...new Set(enemies.map((o) => String(o.kind ?? "")))];
      const kindNames = (t: CoreMessages) => kinds.map((k) => t.kinds[k as keyof typeof t.kinds] ?? k).join(", ");
      out.push({
        id: "part.shared",
        severity: "info",
        msg: "part.shared",
        params: { level: name, n: enemies.length, kinds: kinds.join(", ") },
        texts: texts((t) => t.support.sharedCheck(name, enemies.length, kindNames(t))),
        target: { tab: "build", level: level.id, x: enemies[0]!.x, y: enemies[0]!.y, object: enemies[0]!.name },
      });
    }
  });
  if (p.levels.length && !soon) out.push({ id: "part.soon", severity: "ok", msg: "part.soon.ok", params: {}, texts: texts((t) => t.support.soonOk) });
  return out;
}
