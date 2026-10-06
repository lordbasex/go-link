// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// "Choose a sprite": the catalog in three tabs (heroes, enemies, objects)
// as cards with a picture of the sprite at its size, its name and what it
// is. A click picks a card and a double click confirms it at once; the
// footer places it in the level or gives it to the selected object.
// "Upload image or sheet…" goes to the Characters workspace, where pictures
// become the game's own characters.

import { useEffect, useRef } from "react";
import { Upload } from "lucide-react";
import { useStudioText } from "../../i18n";
import type { CatalogItem } from "./catalog";
import type { PickerState, PickerTab } from "./state";
import { OwnSprite, useOwnSheet } from "./ownSprites";

const TABS: readonly PickerTab[] = ["heroes", "enemies", "objects"];

/** A card's picture: the game's own character when one draws it, else a box of the part's size. */
function PickSprite({ it, scale }: { it: CatalogItem; scale: number }) {
  const sheet = useOwnSheet(it.part.kind === "object" ? { type: it.part.type, ...it.part.props } : null);
  if (sheet)
    return (
      <span className="studio-pick-own">
        <OwnSprite sheet={sheet} />
      </span>
    );
  return <span className={`studio-pick-sprite is-${it.role}`} style={{ width: it.w * scale, height: it.h * scale }} />;
}

export function SpritePicker({ picker, items, onTab, onChoose, onConfirm, onCancel, onUpload }: { picker: PickerState; items: CatalogItem[]; onTab: (tab: PickerTab) => void; onChoose: (id: string) => void; onConfirm: (id?: string) => void; onCancel: () => void; onUpload: () => void }) {
  const t = useStudioText();
  const dialog = useRef<HTMLDivElement>(null);
  const shown = items.filter((i) => i.tab === picker.tab);

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>("[aria-pressed='true'], .studio-pick-card")?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [onCancel]);

  return (
    <div className="mdn-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div ref={dialog} className="mdn-dialog studio-picker" role="dialog" aria-modal="true" aria-labelledby="studio-picker-title">
        <div className="studio-dialog-kicker">{picker.mode === "change" ? t.picker.kickerChange : t.picker.kickerPlace}</div>
        <div className="studio-picker-head">
          <h2 id="studio-picker-title" className="studio-dialog-title">
            {t.picker.title}
          </h2>
          <div className="seg" role="tablist" aria-label={t.picker.title}>
            {TABS.map((tab) => (
              <button key={tab} type="button" role="tab" aria-selected={picker.tab === tab} aria-pressed={picker.tab === tab} onClick={() => onTab(tab)}>
                {t.picker.tabs[tab]}
              </button>
            ))}
          </div>
          <span className="studio-spacer" />
          <button type="button" className="btn btn-secondary" onClick={onUpload}>
            <Upload size={16} aria-hidden="true" />
            {t.picker.upload}
          </button>
        </div>
        <div className="studio-pick-grid" role="tabpanel">
          {shown.map((it) => {
            const scale = Math.min(2, 80 / Math.max(it.w, it.h));
            return (
              <button
                key={it.id}
                type="button"
                className="studio-pick-card"
                aria-pressed={picker.chosen === it.id}
                onClick={() => onChoose(it.id)}
                onDoubleClick={() => onConfirm(it.id)}
              >
                <span className="studio-pick-thumb">
                  <PickSprite it={it} scale={scale} />
                </span>
                <span className="studio-pick-name">{it.name}</span>
                <span className="studio-pick-meta">
                  {t.roles[it.role]} · {it.w}×{it.h}
                </span>
              </button>
            );
          })}
        </div>
        <div className="studio-dialog-foot">
          <span className="studio-muted">{t.picker.hint}</span>
          <span className="studio-spacer" />
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {t.picker.cancel}
          </button>
          <button type="button" className="btn btn-primary" disabled={!picker.chosen} onClick={() => onConfirm()}>
            {picker.mode === "change" ? t.picker.use : t.picker.place}
          </button>
        </div>
      </div>
    </div>
  );
}
