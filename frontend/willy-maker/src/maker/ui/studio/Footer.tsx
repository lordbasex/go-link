// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The footer (28 px): the cursor's place on the level, what is selected,
// the canvas hints, the shortcuts and whether the game is saved.

import { useStudioText } from "../../i18n";
import { MOD_NAME } from "./state";

export type SaveState = "saved" | "saving" | "failed";

export function Footer({ cursor, selection, save, onShortcuts }: { cursor: { x: number; y: number } | null; selection: string; save: SaveState; onShortcuts: () => void }) {
  const t = useStudioText();
  return (
    <footer className="studio-footer">
      <span className="studio-cursor tabular">{cursor ? `x ${cursor.x}  y ${cursor.y}` : "—"}</span>
      <span className="studio-ellipsis">{selection}</span>
      <span className="studio-spacer" />
      <span className="studio-ellipsis">{t.footHint(MOD_NAME)}</span>
      <button type="button" className="studio-keys-btn" aria-haspopup="dialog" onClick={onShortcuts}>
        {t.shortcuts} <strong>?</strong>
      </button>
      <span className={`studio-save is-${save}`} role="status">
        {t.save[save]}
      </span>
    </footer>
  );
}
