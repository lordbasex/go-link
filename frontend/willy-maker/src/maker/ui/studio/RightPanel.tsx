// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The right panel: Properties on top and Layers below, resized from its
// left edge (PropertiesPanel; Layers holds the new group button, the zones'
// opacity and the list, LayersPanel).

import type { ReactNode } from "react";
import { FolderPlus } from "lucide-react";
import { useStudioText } from "../../i18n";
import { useStudioUi, useUiState } from "./state";
import { ResizeHandle } from "./ResizeHandle";

export function RightPanel({ properties, layers, onNewGroup }: { properties: ReactNode; layers: ReactNode; onNewGroup: () => void }) {
  const t = useStudioText();
  const ui = useStudioUi();
  const s = useUiState();
  if (s.rightHidden) return null;
  return (
    <aside className="studio-right">
      <ResizeHandle side="right" width={s.rightW} />
      {properties}
      <section className="studio-layers" aria-labelledby="studio-layers-title">
        <div className="studio-layers-head">
          <span id="studio-layers-title" className="mdn-kicker studio-grow">
            {t.layers}
          </span>
          <button type="button" className="btn btn-icon btn-secondary studio-small" aria-label={t.newGroup} title={t.newGroup} onClick={onNewGroup}>
            <FolderPlus size={16} />
          </button>
          <label className="studio-opacity">
            <span>{t.zoneOpacity}</span>
            <input type="range" min={10} max={100} value={s.zoneOpacity} onChange={(e) => ui.set({ zoneOpacity: Number(e.target.value) })} />
          </label>
        </div>
        {layers}
        <p className="studio-layers-note">{t.layersNote}</p>
      </section>
    </aside>
  );
}
