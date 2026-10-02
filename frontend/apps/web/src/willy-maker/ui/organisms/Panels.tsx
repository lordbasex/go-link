// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The Build screen's panels: the project tree, the parts palette, the
// inspector, the layers, the board limits, the warnings and the minimap.

import { useEffect, useRef, useState } from "react";
import { useCore } from "../../i18n";
import { CELL, layerGrid, newLevel, objectLayer, TAGS, type Level, type LevelObject, type Project, type TagLayer, type TileLayer } from "../../model";
import { CPS1 } from "../../board/cps1";
import { BOSS_KINDS, CIVILIAN_KINDS, CRATE_CONTENTS, ENEMY_KINDS, PART_GROUPS, PARTS, PICKUP_ITEMS, type Part, type PartGroup } from "../../editor/parts";
import { deleteObject, nameFree, updateObject } from "../../editor/ops";
import { optionSupport, partSupport, type Support } from "../../editor/support";
import type { Reach } from "../../editor/reach";
import type { EditorStore } from "../../editor/store";
import { applyAutoArt } from "../../editor/autoArt";
import { CRATE_HP, rulesWith } from "../../engine/rules";
import { drawOverview, paletteFrom, type TileImage, type View } from "../render";
import { Capsule, Eyebrow, IconButton, Meter, Swatch } from "../atoms";
import { LayerRow, PartButton, PropRow, StatusBadge, supportHelp } from "../molecules";
import { IconPlus, IconTrash, IconWarn } from "../icons";

export function ProjectTree({ store, project, levelId, onLevel }: { store: EditorStore; project: Project; levelId: string; onLevel: (id: string) => void }) {
  const t = useCore();
  const [asking, setAsking] = useState<string | null>(null);
  const add = () => {
    const n = project.levels.length + 1;
    let id = `level-${n}`;
    for (let k = n; project.levels.some((l) => l.id === id); k++) id = `level-${k + 1}`;
    store.editProject(t.tree.addLevel, (p) => {
      const level = newLevel({ id, name: t.tree.newLevelName(n), w: 384 * 4, h: 224, players: p.settings.players });
      for (const l of level.layers) if (l.kind === "tiles") l.tileset = l.id === "far" ? "ts-sky" : l.id === "play" ? "ts-city" : undefined;
      const tags = level.layers.find((l): l is TagLayer => l.kind === "tags")!;
      const play = level.layers.find((l): l is TileLayer => l.id === "play")!;
      const tg = layerGrid(level, tags);
      const pg = layerGrid(level, play);
      applyAutoArt(tg, pg, 0, 0, tg.cols - 1, tg.rows - 1);
      pg.commit();
      p.levels.push(level);
      p.settings.levels.push(id);
    });
    onLevel(id);
  };
  return (
    <nav className="wm-tree" aria-label={t.tree.project}>
      <Eyebrow>{t.tree.project}</Eyebrow>
      <div className="wm-tree-title">{project.title}</div>
      <div className="wm-dim wm-small">
        {t.tree.genre}: {t.genres[project.genre]?.name ?? t.genres["platform-shooter"].name}
      </div>
      <div className="wm-tree-group">
        <span className="wm-dim">{t.tree.levels}</span>
        <IconButton className="is-xs" label={t.tree.addLevel} onClick={add}>
          <IconPlus />
        </IconButton>
      </div>
      <ul className="wm-tree-levels">
        {project.levels.map((l, i) => (
          <li key={l.id} className={l.id === levelId ? "is-on" : ""}>
            <button type="button" aria-current={l.id === levelId ? "true" : undefined} onClick={() => onLevel(l.id)}>
              {l.id === levelId ? "●" : "○"} {i + 1} · {l.name}
            </button>
            {project.levels.length > 1 && (
              <IconButton className="is-xs" label={t.tree.deleteLevel} onClick={() => setAsking(l.id)}>
                <IconTrash />
              </IconButton>
            )}
            {asking === l.id && (
              <div className="wm-ask" role="alert">
                <span>{t.tree.deleteLevelAsk(l.name)}</span>
                <span className="wm-row">
                  <Capsule size="sm" onClick={() => setAsking(null)}>
                    {t.home.cancel}
                  </Capsule>
                  <Capsule
                    size="sm"
                    tone="danger"
                    onClick={() => {
                      setAsking(null);
                      const next = project.levels.find((x) => x.id !== l.id)!.id;
                      store.editProject(t.tree.deleteLevel, (p) => {
                        p.levels = p.levels.filter((x) => x.id !== l.id);
                        p.settings.levels = p.settings.levels.filter((x) => x !== l.id);
                      });
                      onLevel(next);
                    }}
                  >
                    {t.home.deleteYes}
                  </Capsule>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="wm-tree-group">
        <span className="wm-dim">{t.tree.characters}</span>
        <span className="wm-mono wm-dim">{project.characters.length}</span>
      </div>
      <div className="wm-tree-group">
        <span className="wm-dim">{t.tree.tilesets}</span>
        <span className="wm-mono wm-dim">{project.tilesets.length}</span>
      </div>
    </nav>
  );
}

function TileButton({ n, img, on, onClick, label }: { n: number; img: TileImage; on: boolean; onClick: () => void; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext?.("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 32, 32);
    const sx = ((n - 1) % img.columns) * img.tile;
    const sy = Math.floor((n - 1) / img.columns) * img.tile;
    ctx.drawImage(img.img, sx, sy, img.tile, img.tile, 0, 0, 32, 32);
  }, [n, img]);
  return (
    <button type="button" className={`wm-tile${on ? " is-on" : ""}`} aria-pressed={on} aria-label={label} title={label} onClick={onClick}>
      <canvas ref={ref} width={32} height={32} aria-hidden="true" />
    </button>
  );
}

export function PartsPalette({ partId, onPart, level, activeLayerId, images }: { partId: string | null; onPart: (id: string) => void; level: Level; activeLayerId: string; images: Map<string, TileImage> }) {
  const t = useCore();
  const [group, setGroup] = useState<PartGroup>("terrain");
  const active = level.layers.find((l) => l.id === activeLayerId);
  const tileLayer = active?.kind === "tiles" ? active : level.layers.find((l): l is TileLayer => l.id === "play" && l.kind === "tiles");
  const img = tileLayer?.kind === "tiles" ? images.get(tileLayer.tileset ?? "") : undefined;
  const label = (p: Part) => {
    if (p.kind === "tag") return t.tags[p.tag];
    if (p.kind === "crate") return t.objects.crate;
    if (p.kind === "object") {
      if (p.type === "player_start") return `${t.objects.player_start} ${String(p.props.player)}`;
      const k = (p.props.kind ?? p.props.item) as keyof typeof t.kinds | undefined;
      return k && t.kinds[k] ? t.kinds[k] : t.objects[p.type];
    }
    return t.parts.tile(p.tile);
  };
  const swatch = (p: Part) => (p.kind === "tag" ? <Swatch kind="tag" name={p.tag} /> : p.kind === "crate" ? <Swatch kind="tag" name="crate" /> : p.kind === "object" ? <Swatch kind="object" name={p.type} /> : null);
  return (
    <section className="wm-parts" aria-label={t.parts.title}>
      <Eyebrow>{t.parts.title}</Eyebrow>
      <div className="wm-row is-wrap" role="tablist" aria-label={t.parts.title}>
        {PART_GROUPS.map((g) => (
          <button key={g} type="button" role="tab" aria-selected={group === g} className={`wm-cap is-sm${group === g ? " is-on" : ""}`} onClick={() => setGroup(g)}>
            {t.parts.groups[g]}
          </button>
        ))}
      </div>
      {group === "tiles" ? (
        img ? (
          <div className="wm-tiles" role="group" aria-label={t.parts.groups.tiles}>
            {Array.from({ length: Math.min(256, Math.floor((img.img as HTMLImageElement).naturalHeight / img.tile) * img.columns || 0) }, (_, i) => i + 1).map((n) => (
              <TileButton key={n} n={n} img={img} on={partId === `tile:${n}`} onClick={() => onPart(`tile:${n}`)} label={t.parts.tile(n)} />
            ))}
          </div>
        ) : (
          <p className="wm-dim wm-small">{t.parts.noTiles}</p>
        )
      ) : (
        <div className="wm-partgrid">
          {PARTS.filter((p) => p.group === group).map((p) => (
            <PartButton key={p.id} on={partId === p.id} swatch={swatch(p)} label={label(p)} help={supportHelp(t, partSupport(p.id)) ?? (p.kind === "tag" ? t.tagsHelp[p.tag] : undefined)} badge={<StatusBadge support={partSupport(p.id)} tip={false} />} onClick={() => onPart(p.id)} />
          ))}
        </div>
      )}
      <p className="wm-dim wm-small">{group === "tiles" ? t.parts.tilesHint : t.parts.hint}</p>
    </section>
  );
}

/**
 * A number field. What is typed stays as typed while it is out of range
 * (typing 64 into a field whose minimum is 16 passes through 6), and is
 * kept in range when the field is left (experiment 1, case C: clamping
 * every keystroke turned 64 into 164).
 */
export function NumberInput({ value, onChange, min, max, step = 1, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label: string }) {
  const shown = Number.isFinite(value) ? value : 0;
  const [text, setText] = useState<string | null>(null);
  const clamp = (v: number) => Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v));
  return (
    <input
      className="wm-input is-sm wm-num"
      type="number"
      aria-label={label}
      value={text ?? shown}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const raw = e.target.value;
        const v = Number(raw);
        if (raw !== "" && Number.isFinite(v) && v === clamp(v)) {
          setText(null);
          if (v !== shown) onChange(v);
        } else setText(raw);
      }}
      onBlur={() => {
        if (text === null) return;
        const v = Number(text);
        setText(null);
        if (text !== "" && Number.isFinite(v) && clamp(v) !== shown) onChange(clamp(v));
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

/**
 * A select of kinds, items or crate contents: options the game does not
 * play yet say so, and the chosen one shows the badge with the reason.
 */
function Select({ value, options, onChange, label, support }: { value: string; options: readonly string[]; onChange: (v: string) => void; label: string; support?: (option: string) => Support }) {
  const t = useCore();
  const status = support?.(value);
  return (
    <span className="wm-prop-soon">
      <select className="wm-input is-sm" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {t.kinds[o as keyof typeof t.kinds] ?? o}
            {support?.(o).status === "soon" ? ` · ${t.support.soon}` : ""}
          </option>
        ))}
      </select>
      {status && <StatusBadge support={status} />}
    </span>
  );
}

export function Inspector({ store, level, selected, cell, onSelect }: { store: EditorStore; level: Level; selected: string | null; cell: { c: number; r: number } | null; onSelect: (name: string | null) => void }) {
  const t = useCore();
  const o = selected ? objectLayer(level).items.find((i) => i.name === selected) : undefined;
  const [name, setName] = useState(o?.name ?? "");
  useEffect(() => setName(o?.name ?? ""), [o?.name]);
  const set = (patch: Partial<LevelObject>) => o && updateObject(store, level.id, o.name, patch, t.objects[o.type]);

  if (!o) {
    const tags = level.layers.find((l): l is TagLayer => l.kind === "tags");
    if (cell && tags) {
      const tag = TAGS[layerGrid(level, tags).get(cell.c, cell.r)] ?? "air";
      const key = `${cell.c},${cell.r}`;
      const props = tags.props?.[key] ?? {};
      const setProp = (k: string, v: number) =>
        store.editLevel(t.tags[tag], level.id, (l) => {
          const tl = l.layers.find((x): x is TagLayer => x.kind === "tags")!;
          tl.props = { ...(tl.props ?? {}), [key]: { ...(tl.props?.[key] ?? {}), [k]: v } };
        });
      return (
        <section className="wm-inspector" aria-label={t.inspector.title(t.tags[tag])}>
          <Eyebrow>{t.inspector.title(t.inspector.cell(t.tags[tag], cell.c, cell.r))}</Eyebrow>
          <p className="wm-dim wm-small">{t.tagsHelp[tag]}</p>
          <StatusBadge support={partSupport(`tag:${tag}`)} />
          {tag === "breakable" && (
            <PropRow label={t.inspector.hp}>
              <NumberInput label={t.inspector.hp} value={Number(props.hp ?? 3)} min={1} max={99} onChange={(v) => setProp("hp", v)} />
            </PropRow>
          )}
          {tag === "hazard" && (
            <PropRow label={t.inspector.damage}>
              <NumberInput label={t.inspector.damage} value={Number(props.damage ?? 1)} min={1} max={9} onChange={(v) => setProp("damage", v)} />
            </PropRow>
          )}
        </section>
      );
    }
    return (
      <section className="wm-inspector" aria-label={t.inspector.level}>
        <Eyebrow>{t.inspector.title(t.inspector.level)}</Eyebrow>
        <PropRow label={t.inspector.levelName}>
          <input className="wm-input is-sm" defaultValue={level.name} key={level.id + level.name} maxLength={60} onBlur={(e) => e.target.value.trim() && e.target.value !== level.name && store.editLevel(t.tree.renameLevel, level.id, (l) => (l.name = e.target.value.trim()))} />
        </PropRow>
        <PropRow label={t.tree.genre}>
          <span>{t.genres[store.project.genre]?.name ?? t.genres["platform-shooter"].name}</span>
        </PropRow>
        <PropRow label={t.inspector.levelSize}>
          <span className="wm-mono">
            {level.size.w} × {level.size.h}
          </span>
        </PropRow>
        <PropRow label={t.inspector.forwardOnly}>
          <input type="checkbox" checked={level.camera.forwardOnly} onChange={(e) => store.editLevel(t.inspector.camera, level.id, (l) => (l.camera.forwardOnly = e.target.checked))} />
        </PropRow>
        <PropRow label={t.inspector.backtrack}>
          <NumberInput label={t.inspector.backtrack} value={level.camera.backtrack} min={0} max={384} step={8} onChange={(v) => store.editLevel(t.inspector.camera, level.id, (l) => (l.camera.backtrack = v))} />
        </PropRow>
        <PropRow label={t.inspector.sections}>
          <span className="wm-mono">{t.inspector.sectionsCount(level.sections.length)}</span>
        </PropRow>
        <p className="wm-dim wm-small">{t.inspector.none}</p>
      </section>
    );
  }

  const ok = nameFree(level, name, o.name);
  return (
    <section className="wm-inspector" aria-label={t.inspector.title(t.objects[o.type])}>
      <Eyebrow>{t.inspector.title(t.objects[o.type])}</Eyebrow>
      {o.type === "checkpoint" && <StatusBadge support={partSupport("checkpoint:checkpoint")} />}
      <PropRow label={t.inspector.name}>
        <input
          className={`wm-input is-sm wm-mono${ok ? "" : " is-bad"}`}
          value={name}
          maxLength={40}
          aria-invalid={!ok}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (ok && name !== o.name) {
              set({ name });
              onSelect(name);
            } else setName(o.name);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      </PropRow>
      <span className={`wm-small ${ok ? "wm-dim" : "wm-bad"}`}>{ok ? t.inspector.nameHelp : t.inspector.nameTaken}</span>
      <div className="wm-grid2 is-tight">
        <PropRow label={t.inspector.x}>
          <NumberInput label={t.inspector.x} value={o.x} min={0} max={level.size.w} step={8} onChange={(x) => set({ x })} />
        </PropRow>
        <PropRow label={t.inspector.y}>
          <NumberInput label={t.inspector.y} value={o.y} min={0} max={level.size.h} step={8} onChange={(y) => set({ y })} />
        </PropRow>
      </div>
      {o.type === "exit" && (
        <div className="wm-grid2 is-tight">
          <PropRow label={t.inspector.w}>
            <NumberInput label={t.inspector.w} value={Number(o.w ?? 2 * CELL)} min={CELL} max={level.size.w} step={CELL} onChange={(w) => set({ w })} />
          </PropRow>
        </div>
      )}
      {(o.type === "camera_lock" || o.type === "boss") && (
        <div className="wm-grid2 is-tight">
          <PropRow label={t.inspector.w}>
            <NumberInput label={t.inspector.w} value={Number(o.w ?? 384)} min={CELL} max={level.size.w} step={CELL} onChange={(w) => set({ w })} />
          </PropRow>
          <PropRow label={t.inspector.h}>
            <NumberInput label={t.inspector.h} value={Number(o.h ?? 224)} min={CELL} max={level.size.h} step={CELL} onChange={(h) => set({ h })} />
          </PropRow>
        </div>
      )}
      {o.type === "player_start" && (
        <PropRow label={t.inspector.player}>
          <NumberInput label={t.inspector.player} value={Number(o.player ?? 1)} min={1} max={4} onChange={(player) => set({ player })} />
        </PropRow>
      )}
      {(o.type === "enemy" || o.type === "civilian" || o.type === "boss") && (
        <PropRow label={t.inspector.kind}>
          <Select label={t.inspector.kind} value={String(o.kind ?? "")} options={o.type === "enemy" ? ENEMY_KINDS : o.type === "civilian" ? CIVILIAN_KINDS : BOSS_KINDS} support={(k) => optionSupport("kind", k, o.type)} onChange={(kind) => set({ kind })} />
        </PropRow>
      )}
      {o.type === "enemy" && optionSupport("kind", String(o.kind ?? ""), "enemy").shared && <p className="wm-dim wm-small">{t.support.shared}</p>}
      {o.type === "enemy" && (
        <>
          <PropRow label={t.inspector.facing}>
            <select className="wm-input is-sm" aria-label={t.inspector.facing} value={String(o.facing ?? "left")} onChange={(e) => set({ facing: e.target.value })}>
              <option value="left">{t.inspector.left}</option>
              <option value="right">{t.inspector.right}</option>
            </select>
          </PropRow>
          <PropRow label={t.inspector.patrol}>
            <NumberInput label={t.inspector.patrol} value={Number(o.patrol ?? 96)} min={0} max={1024} step={16} onChange={(patrol) => set({ patrol })} />
          </PropRow>
          <PropRow label={t.inspector.hp}>
            <NumberInput label={t.inspector.hp} value={Number(o.hp ?? rulesWith(store.project.settings.rules).enemyHp)} min={1} max={99} onChange={(hp) => set({ hp })} />
          </PropRow>
        </>
      )}
      {o.type === "crate" && (
        <>
          <PropRow label={t.inspector.breakable}>
            <input type="checkbox" aria-label={t.inspector.breakable} title={t.inspector.breakableHelp} checked={o.breakable !== false} onChange={(e) => set({ breakable: e.target.checked })} />
          </PropRow>
          {o.breakable !== false && (
            <PropRow label={t.inspector.hp}>
              <NumberInput label={t.inspector.hp} value={Number(o.hp ?? CRATE_HP)} min={1} max={9} onChange={(hp) => set({ hp })} />
            </PropRow>
          )}
          <PropRow label={t.inspector.contents}>
            <Select label={t.inspector.contents} value={String(o.contents ?? "nothing")} options={CRATE_CONTENTS} support={(c) => optionSupport("contents", c)} onChange={(contents) => set({ contents })} />
          </PropRow>
        </>
      )}
      {o.type === "pickup" && (
        <PropRow label={t.inspector.item}>
          <Select label={t.inspector.item} value={String(o.item ?? "bazooka")} options={PICKUP_ITEMS} support={(i) => optionSupport("item", i)} onChange={(item) => set({ item })} />
        </PropRow>
      )}
      <Capsule
        size="sm"
        tone="danger"
        onClick={() => {
          deleteObject(store, level.id, o.name, t.inspector.delete);
          onSelect(null);
        }}
      >
        <IconTrash /> {t.inspector.delete}
      </Capsule>
    </section>
  );
}

const BASE_LAYERS = new Set(["far", "mid", "play", "collision", "objects", "text"]);

export function LayersPanel({ store, level, activeLayerId, onActive }: { store: EditorStore; level: Level; activeLayerId: string; onActive: (id: string) => void }) {
  const t = useCore();
  const rows = [...level.layers].reverse();
  const active = level.layers.find((l) => l.id === activeLayerId);
  const edit = (label: string, fn: (l: Level) => void) => store.editLevel(label, level.id, fn);
  return (
    <section className="wm-layers" aria-label={t.layers.title}>
      <Eyebrow>{t.layers.title}</Eyebrow>
      <ul>
        {rows.map((layer, i) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            active={layer.id === activeLayerId}
            first={i === 0}
            last={i === rows.length - 1}
            onActivate={() => onActive(layer.id)}
            onToggleVisible={() => edit(t.layers.title, (l) => {
              const x = l.layers.find((y) => y.id === layer.id)!;
              x.visible = x.visible === false;
            })}
            onToggleLock={() => edit(t.layers.title, (l) => {
              const x = l.layers.find((y) => y.id === layer.id)!;
              x.locked = !x.locked;
            })}
            onMove={(dir) =>
              edit(t.layers.title, (l) => {
                const idx = l.layers.findIndex((y) => y.id === layer.id);
                const to = idx + dir;
                if (to < 0 || to >= l.layers.length) return;
                [l.layers[idx], l.layers[to]] = [l.layers[to]!, l.layers[idx]!];
              })
            }
            onRename={(name) => edit(t.layers.rename, (l) => (l.layers.find((y) => y.id === layer.id)!.name = name))}
          />
        ))}
      </ul>
      <div className="wm-row is-wrap">
        <Capsule
          size="sm"
          title={t.layers.addTip}
          onClick={() => {
            let n = level.layers.length + 1;
            while (level.layers.some((l) => l.id === `layer-${n}`)) n++;
            const id = `layer-${n}`;
            edit(t.layers.addTip, (l) => {
              const cells = Math.ceil(l.size.w / 16) * Math.ceil(l.size.h / 16);
              const at = l.layers.findIndex((y) => y.kind === "tags");
              l.layers.splice(at < 0 ? l.layers.length : at, 0, { id, kind: "tiles", grid: 16, tileset: "ts-city", data: `rle:0*${cells}`, name: t.layers.newName(n), visible: true, locked: false, opacity: 1 });
            });
            onActive(id);
          }}
        >
          <IconPlus /> {t.layers.add}
        </Capsule>
        {active && (
          <label className="wm-opacity">
            <span>{t.layers.opacity}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round((active.opacity ?? 1) * 100)}
              onChange={(e) => edit(t.layers.opacity, (l) => (l.layers.find((y) => y.id === active.id)!.opacity = Number(e.target.value) / 100))}
            />
            <span className="wm-mono">{Math.round((active.opacity ?? 1) * 100)} %</span>
          </label>
        )}
        {active && !BASE_LAYERS.has(active.id) && (
          <IconButton
            className="is-sm"
            label={t.layers.remove}
            onClick={() => {
              edit(t.layers.remove, (l) => (l.layers = l.layers.filter((y) => y.id !== active.id)));
              onActive("collision");
            }}
          >
            <IconTrash />
          </IconButton>
        )}
      </div>
    </section>
  );
}

export function MetersPanel({ project }: { project: Project }) {
  const t = useCore();
  return (
    <section className="wm-meters" aria-label={t.meters.title}>
      <Eyebrow>{t.meters.title}</Eyebrow>
      {CPS1.meters(project).map((m) => (
        <Meter
          key={m.id}
          label={t.meters[m.id]}
          value={m.unit === "bytes" ? t.meters.mb(m.used / 1048576, m.max / 1048576) : `${m.used} / ${m.max}`}
          ratio={m.max ? m.used / m.max : 0}
          level={m.level}
        />
      ))}
    </section>
  );
}

/** A warning from outside the level (the game settings and menus), with its own "Go to". */
export interface ExtraWarning {
  key: string;
  text: string;
  go: () => void;
}

export function WarningsPanel({ reach, onGo, extra = [] }: { reach: Reach | null; onGo: (x: number, y: number) => void; extra?: ExtraWarning[] }) {
  const t = useCore();
  if (!reach && !extra.length) return null;
  const items = [
    ...(reach?.ledges ?? []).map((l) => ({ key: `l${l.x0},${l.y}`, text: t.canvas.ledge(l.rise), go: () => onGo(l.x0, l.y) })),
    ...(reach?.objects ?? []).map((o) => ({ key: `o${o.name}`, text: t.canvas.unreached(o.name), go: () => onGo(o.x, o.y) })),
    ...extra,
  ];
  return (
    <section className="wm-warnings" aria-label={t.warnings.title}>
      <Eyebrow>{t.warnings.title}</Eyebrow>
      {items.length === 0 ? (
        <p className="wm-dim wm-small">{t.warnings.none}</p>
      ) : (
        <ul>
          {items.slice(0, 30).map((w) => (
            <li key={w.key}>
              <IconWarn />
              <span>{w.text}</span>
              <Capsule size="sm" onClick={w.go}>
                {t.warnings.go}
              </Capsule>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Minimap({ level, version, images, view, onView }: { level: Level; version: number; images: Map<string, TileImage>; view: View; onView: (x: number, y: number) => void }) {
  const t = useCore();
  const ref = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(800);
  const h = 40;
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setW(Math.max(200, Math.round(el.getBoundingClientRect().width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext?.("2d");
    if (!canvas || !ctx) return;
    const pal = paletteFrom(canvas);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // stretch to the strip's width; the height keeps the level's proportion of it
    ctx.save();
    ctx.scale(1, h / ((w / level.size.w) * level.size.h));
    drawOverview(ctx, level, w, (w / level.size.w) * level.size.h, pal, images);
    ctx.restore();
    const s = w / level.size.w;
    const sy = h / level.size.h;
    // sections
    ctx.fillStyle = pal.screen;
    for (const sec of level.sections) ctx.fillRect(sec.x0 * s, 0, 1, h);
    // the view
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.max(1, view.x * s), Math.max(1, view.y * sy), Math.min(w - 2, (view.w / view.zoom) * s), Math.min(h - 2, (view.h / view.zoom) * sy));
  }, [level, version, images, view, w]);
  const go = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onView(((e.clientX - r.left) / r.width) * level.size.w, ((e.clientY - r.top) / r.height) * level.size.h);
  };
  const screens = Math.round(level.size.w / 384);
  return (
    <div className="wm-minimap">
      <div className="wm-minimap-head wm-small">
        <span className="wm-mono">{t.minimap.size(level.size.w, level.size.h, screens)}</span>
        <span className="wm-dim">{level.sections.map((s, i) => `${i + 1} ${s.name}`).join(" · ")}</span>
      </div>
      <canvas
        ref={ref}
        width={w}
        height={h}
        style={{ width: "100%", height: h }}
        role="slider"
        tabIndex={0}
        aria-label={t.minimap.label}
        aria-valuemin={0}
        aria-valuemax={level.size.w}
        aria-valuenow={Math.round(view.x)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          go(e);
        }}
        onPointerMove={(e) => e.buttons && go(e)}
        onKeyDown={(e) => {
          const step = e.key === "ArrowRight" ? 384 : e.key === "ArrowLeft" ? -384 : 0;
          if (step) {
            e.preventDefault();
            onView(view.x + view.w / view.zoom / 2 + step, view.y + view.h / view.zoom / 2);
          }
        }}
      />
    </div>
  );
}
