// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The tools panel: in full (tools, insert, first steps) or as the 52 px
// icon rail, whose zone and insert buttons open a flyout menu. Its right
// edge is dragged to resize it; dragged narrow, it becomes the rail.

import { Box, Check, ChevronsLeft, ChevronsRight, Eraser, Ghost, Hand, Image, LampFloor, Mountain, MousePointer2, Sparkles, SquareDashed, SquarePlus, User, type LucideIcon } from "lucide-react";
import { useStudioText } from "../../i18n";
import { RAIL_W, useStudioUi, useUiState, type PickerTab, type StudioTool } from "./state";
import { ResizeHandle } from "./ResizeHandle";

const TOOLS: readonly { id: StudioTool; key: string; icon: LucideIcon }[] = [
  { id: "select", key: "V", icon: MousePointer2 },
  { id: "zone", key: "B", icon: SquareDashed },
  { id: "erase", key: "E", icon: Eraser },
  { id: "hand", key: "H", icon: Hand },
];

export interface LeftPanelProps {
  /** Done flags of the four first steps. */
  steps: readonly boolean[];
  hasBackground: boolean;
  onInsertBackground: () => void;
  /** A far background (a skyline behind, at half speed). */
  onInsertFar: () => void;
  onInsertFront: () => void;
  onInsert: (tab: PickerTab) => void;
  /** The prompts to make art with an image AI (background, characters, objects). */
  onPrompt: () => void;
}

export function LeftPanel({ steps, hasBackground, onInsertBackground, onInsertFar, onInsertFront, onInsert, onPrompt }: LeftPanelProps) {
  const done = steps.filter(Boolean).length;
  const s = useUiState();
  if (s.leftHidden) return null;
  return s.leftCompact ? <IconRail done={done} total={steps.length} /> : <ToolsPanel steps={steps} hasBackground={hasBackground} onInsertBackground={onInsertBackground} onInsertFar={onInsertFar} onInsertFront={onInsertFront} onInsert={onInsert} onPrompt={onPrompt} />;
}

function ToolsPanel({ steps, hasBackground, onInsertBackground, onInsertFar, onInsertFront, onInsert, onPrompt }: LeftPanelProps) {
  const t = useStudioText();
  const ui = useStudioUi();
  const s = useUiState();
  const current = steps.indexOf(false);
  const inserts: { label: string; icon: LucideIcon; run: () => void }[] = [
    { label: hasBackground ? t.insert.replaceBackground : t.insert.background, icon: Image, run: onInsertBackground },
    { label: t.insert.far, icon: Mountain, run: onInsertFar },
    { label: t.insert.front, icon: LampFloor, run: onInsertFront },
    { label: t.insert.character, icon: User, run: () => onInsert("heroes") },
    { label: t.insert.enemy, icon: Ghost, run: () => onInsert("enemies") },
    { label: t.insert.object, icon: Box, run: () => onInsert("objects") },
    { label: t.insert.prompt, icon: Sparkles, run: onPrompt },
  ];
  return (
    <aside className="studio-left">
      <ResizeHandle side="left" width={s.leftW} />
      <div className="studio-left-scroll">
        <div className="studio-left-head">
          <span className="mdn-kicker">{t.toolsHeading}</span>
          <button type="button" className="btn btn-icon studio-small" aria-label={t.compact} title={t.compact} onClick={() => ui.set({ leftCompact: true })}>
            <ChevronsLeft size={16} />
          </button>
        </div>
        <div className="studio-rows" role="toolbar" aria-label={t.toolsHeading} aria-orientation="vertical">
          {TOOLS.map(({ id, key, icon: Icon }) => (
            <button key={id} type="button" className={`studio-row${s.tool === id ? " is-on" : ""}`} aria-pressed={s.tool === id} onClick={() => ui.set({ tool: id })}>
              <Icon size={16} aria-hidden="true" />
              <span className="studio-row-label">{t.tools[id]}</span>
              <kbd className="studio-row-key">{key}</kbd>
            </button>
          ))}
        </div>
        <div className="studio-hsep" />
        <div className="mdn-kicker studio-section-head">{t.insertHeading}</div>
        <div className="studio-rows">
          {inserts.map(({ label, icon: Icon, run }) => (
            <button key={label} type="button" className="studio-row" onClick={run}>
              <Icon size={16} aria-hidden="true" />
              <span className="studio-row-label">{label}</span>
            </button>
          ))}
        </div>
        <p className="studio-note">{t.insertNote}</p>
        <div className="studio-spacer" />
        <div className="studio-hsep" />
        <div className="mdn-kicker studio-section-head">{t.stepsHeading}</div>
        <ol className="studio-steps">
          {t.steps.map((st, i) => (
            <li key={i} className={steps[i] ? "is-done" : i === current ? "is-current" : undefined} aria-current={i === current ? "step" : undefined}>
              <span className="studio-step-badge" aria-hidden="true">
                {steps[i] ? <Check size={12} strokeWidth={3} /> : i + 1}
              </span>
              <span className="studio-step-text">
                <span className="studio-step-title">{st.title}</span>
                {i === current && <span className="studio-step-hint">{st.hint}</span>}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}

function IconRail({ done, total }: { done: number; total: number }) {
  const t = useStudioText();
  const ui = useStudioUi();
  const s = useUiState();
  const tip = { select: t.railTips.select, zone: t.railTips.zone, erase: t.railTips.erase, hand: t.railTips.hand };
  const fly = (e: React.MouseEvent<HTMLButtonElement>, kind: "flyZone" | "flyInsert") => {
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    ui.set((st) => ({ menu: { x: r.right + 4, y: r.top, target: { kind } }, tool: kind === "flyZone" ? "zone" : st.tool }));
  };
  return (
    <aside className="studio-rail" style={{ width: RAIL_W }}>
      <ResizeHandle side="left" width={RAIL_W} />
      <button type="button" className="btn btn-icon studio-rail-expand" aria-label={t.expand} title={t.expand} onClick={() => ui.set({ leftCompact: false })}>
        <ChevronsRight size={16} />
      </button>
      <div className="studio-rail-sep" />
      {TOOLS.map(({ id, icon: Icon }) => {
        const flyout = id === "zone";
        return (
          <button
            key={id}
            type="button"
            className={`studio-rail-btn${s.tool === id ? " is-on" : ""}`}
            aria-label={tip[id]}
            title={tip[id]}
            aria-pressed={s.tool === id}
            aria-haspopup={flyout ? "menu" : undefined}
            onClick={flyout ? (e) => fly(e, "flyZone") : () => ui.set({ tool: id })}
            onContextMenu={flyout ? (e) => fly(e, "flyZone") : (e) => e.preventDefault()}
          >
            <Icon size={18} aria-hidden="true" />
            {flyout && <span className="studio-rail-more" aria-hidden="true" />}
          </button>
        );
      })}
      <div className="studio-rail-sep" />
      <button type="button" className="studio-rail-btn" aria-label={t.railTips.insert} title={t.railTips.insert} aria-haspopup="menu" onClick={(e) => fly(e, "flyInsert")} onContextMenu={(e) => fly(e, "flyInsert")}>
        <SquarePlus size={18} aria-hidden="true" />
        <span className="studio-rail-more" aria-hidden="true" />
      </button>
      <div className="studio-spacer" />
      <div className="studio-rail-steps tabular" title={t.stepsDone}>
        {done}/{total}
      </div>
    </aside>
  );
}
