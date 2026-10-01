// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The Characters screen (organism): drop a sheet, check the detected
// frames, give them to animations, size the character and fit its colors
// to the board, then save it into the project. The shell passes the
// project and takes the changed one back (and autosaves it).

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { ScaledFrame } from "@go-link/cps1";
import { InputError, inputErrorText, type CharacterRole, type Project } from "../model";
import { useCore, useWmLang } from "../i18n";
import { assetsPersistent, getAsset, putAsset } from "../io/assets";
import { checkSheetFile, checkSheetImage, SHEET_MAX_BYTES } from "./sheetInput";
import { detectFigures, feetPivot, gridBoxes, keyBackground, type Box, type KeyResult, type Rgba } from "./detect";
import { analyzeZones, applyMask, packAtlas, scaleFor, scaleFrames, sourceHeight, type DraftAnim, type SourceFrame } from "./convert";
import { draftOf, emptyDraft, removeCharacter, saveCharacter, type Draft, type ImportedCharacter } from "./character";
import { decodeImage, encodePng } from "./image";
import { ANIMS, DEFAULT_HEIGHT, HEIGHTS } from "./presets";
import { fmt, useSpritesText } from "./text";
import { SheetView, type BoxLabel } from "./ui/SheetView";
import { AnimationPanel, animList } from "./ui/AnimationPanel";
import { BoardPanel } from "./ui/BoardPanel";
import "./sprites.css";

export interface CharactersScreenProps {
  project: Project;
  /** Called with the whole project after a character is saved or deleted. */
  onChange(next: Project): void;
  /** The character to open first (a new one when missing). */
  characterId?: string | null;
}

interface Sheet {
  img: Rgba;
  url: string;
  key: KeyResult;
}

const ROLES: CharacterRole[] = ["hero", "enemy", "civilian", "boss"];
const ZOOMS = [1, 2, 4];

/** Frames from boxes: ids f1, f2… after the highest id so far, pivots on the feet. */
function framesFrom(boxes: Box[], mask: Uint8Array, w: number, start = 1): SourceFrame[] {
  return boxes.map((b, i) => ({ id: `f${start + i}`, ...b, ...feetPivot(mask, w, b) }));
}

const nextNumber = (frames: SourceFrame[]) => frames.reduce((m, f) => Math.max(m, Number(f.id.slice(1)) || 0), 0) + 1;

function detect(sheet: Sheet, d: Pick<Draft, "mode" | "grid">): SourceFrame[] {
  const { w, h } = sheet.img;
  const boxes = d.mode === "grid" ? gridBoxes(sheet.key.mask, w, h, d.grid.w, d.grid.h) : detectFigures(sheet.key.mask, w, h);
  return framesFrom(boxes, sheet.key.mask, w);
}

export function CharactersScreen({ project, onChange, characterId = null }: CharactersScreenProps) {
  const t = useSpritesText();
  const core = useCore();
  const lang = useWmLang();
  const [loadWhy, setLoadWhy] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => {
    const ch = project.characters.find((c) => c.id === characterId) as ImportedCharacter | undefined;
    if (!ch) return emptyDraft();
    // a character the importer did not make opens with its name and role
    return draftOf(ch) ?? { ...emptyDraft(), id: ch.id, name: ch.name, role: ch.role, height: ch.height };
  });
  const [openId, setOpenId] = useState<string | null>(characterId);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<string | null>("idle");
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState<"" | "loading" | "saving">("");
  const [status, setStatus] = useState<"" | "saved" | "error" | "loadError" | "needName" | "needFrames">("");
  const [dirty, setDirty] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const sourceBytes = useRef<{ bytes: Uint8Array; type: string } | null>(null);

  useEffect(() => {
    let live = true;
    assetsPersistent().then((p) => live && setPersistent(p));
    return () => {
      live = false;
    };
  }, []);

  const edit = useCallback((fn: (d: Draft) => Draft) => {
    setDraft((d) => fn(d));
    setDirty(true);
    setStatus("");
  }, []);

  /** Decodes a sheet and keys its background. */
  const loadSheet = useCallback(async (bytes: Uint8Array, type: string, tolerance: number): Promise<Sheet> => {
    const img = await decodeImage(bytes, type);
    const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type }));
    return { img, url, key: keyBackground(img, { tolerance }) };
  }, []);

  // reopening a saved character: its source sheet comes from storage
  useEffect(() => {
    const ref = draft.sheet;
    if (!ref || sheet || sourceBytes.current) return;
    let live = true;
    setBusy("loading");
    (async () => {
      try {
        const asset = await getAsset(ref);
        if (!asset) throw new Error("missing");
        const s = await loadSheet(asset.bytes, asset.type, draft.tolerance);
        if (live) setSheet(s);
      } catch {
        if (live) setStatus("loadError");
      } finally {
        if (live) setBusy("");
      }
    })();
    return () => {
      live = false;
    };
  }, [draft.sheet, draft.tolerance, sheet, loadSheet]);

  const sheetUrl = sheet?.url;
  useEffect(
    () => () => {
      if (sheetUrl) URL.revokeObjectURL(sheetUrl);
    },
    [sheetUrl],
  );

  const openFile = async (file: File) => {
    setBusy("loading");
    setStatus("");
    setLoadWhy(null);
    try {
      if (file.size > SHEET_MAX_BYTES) throw new InputError("file.too-big", { mb: Math.round(file.size / 1048576), max: SHEET_MAX_BYTES / 1048576 });
      const bytes = new Uint8Array(await file.arrayBuffer());
      // checked before the browser decodes it: format, size from the header
      const type = checkSheetFile(bytes, file.type);
      let s: Sheet;
      try {
        s = await loadSheet(bytes, type, draft.tolerance);
      } catch {
        throw new InputError("image.unreadable");
      }
      try {
        checkSheetImage(s.img, s.key);
      } catch (e) {
        URL.revokeObjectURL(s.url);
        throw e;
      }
      sourceBytes.current = { bytes, type };
      setSheet(s);
      const frames = detect(s, draft);
      const sheetRef = await putAsset(bytes, type);
      // a full or blocked IndexedDB keeps the picture only for this page: say so
      assetsPersistent().then(setPersistent);
      edit((d) => ({
        ...d,
        sheet: sheetRef,
        file: file.name,
        frames,
        name: d.name || file.name.replace(/\.[a-z0-9]+$/i, "").replace(/^\d+[_-]?/, "").replace(/[_-]+/g, " "),
        anims: Object.fromEntries(Object.entries(d.anims).map(([k, a]) => [k, { ...a, frames: [] }])),
      }));
      setSelected(new Set());
    } catch (e) {
      setStatus("loadError");
      setLoadWhy(core.pictureError(inputErrorText(core.inputErrors, e)));
    } finally {
      setBusy("");
    }
  };

  const redetect = (patch: Partial<Pick<Draft, "mode" | "grid" | "tolerance">>) => {
    const next = { ...draft, ...patch };
    let s = sheet;
    if (s && patch.tolerance !== undefined) {
      s = { ...s, key: keyBackground(s.img, { tolerance: next.tolerance }) };
      setSheet(s);
    }
    edit((d) => ({
      ...d,
      ...patch,
      frames: s ? detect(s, next) : d.frames,
      anims: s ? Object.fromEntries(Object.entries(d.anims).map(([k, a]) => [k, { ...a, frames: [] }])) : d.anims,
    }));
    setSelected(new Set());
  };

  // ---- derived: board pictures, zones (deferred so dragging stays smooth)
  const keyed = useMemo(() => (sheet ? applyMask(sheet.img, sheet.key.mask) : null), [sheet]);
  const deferred = useDeferredValue(draft);
  const scale = useMemo(() => scaleFor(deferred.frames, deferred.anims, deferred.height), [deferred.frames, deferred.anims, deferred.height]);
  const scaled = useMemo(() => (keyed ? scaleFrames(keyed, deferred.frames, scale) : []), [keyed, deferred.frames, scale]);
  const zones = useMemo(() => (scaled.length ? analyzeZones(scaled) : null), [scaled]);
  const shown = useMemo(() => {
    const m = new Map<string, ScaledFrame>();
    if (zones) deferred.frames.forEach((f, i) => zones.frames[i] && m.set(f.id, zones.frames[i]!));
    return m;
  }, [zones, deferred.frames]);

  const list = animList(draft.role, draft.anims);
  const colorOf = useCallback((name: string) => Math.max(0, list.findIndex((p) => p.name === name)) % 8, [list]);
  const numberOf = useCallback((id: string) => draft.frames.findIndex((f) => f.id === id) + 1, [draft.frames]);
  const labels = useMemo(() => {
    const m = new Map<string, BoxLabel>();
    for (const [name, a] of Object.entries(draft.anims)) a.frames.forEach((id, i) => m.has(id) || m.set(id, { text: `${name} ${i + 1}`, color: colorOf(name) }));
    return m;
  }, [draft.anims, colorOf]);

  const select = (id: string | null, additive: boolean) => {
    setSelected((cur) => {
      if (!id) return new Set();
      if (!additive) return new Set([id]);
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setFrames = (frames: SourceFrame[]) => edit((d) => ({ ...d, frames }));

  const deleteSelected = () => {
    edit((d) => ({
      ...d,
      frames: d.frames.filter((f) => !selected.has(f.id)),
      anims: Object.fromEntries(Object.entries(d.anims).map(([k, a]) => [k, { ...a, frames: a.frames.filter((f) => !selected.has(f)) }])),
    }));
    setSelected(new Set());
  };

  const addBox = () => {
    if (!sheet) return;
    const { w, h } = sheet.img;
    const last = draft.frames.find((f) => selected.has(f.id)) ?? draft.frames[draft.frames.length - 1];
    const bw = last?.w ?? Math.min(48, w);
    const bh = last?.h ?? Math.min(48, h);
    const x = last ? Math.min(w - bw, last.x + last.w + 4) : Math.max(0, (w - bw) >> 1);
    const y = last ? last.y : Math.max(0, (h - bh) >> 1);
    const id = `f${nextNumber(draft.frames)}`;
    edit((d) => ({ ...d, frames: [...d.frames, { id, x, y, w: bw, h: bh, px: bw >> 1, py: bh - 1 }] }));
    setSelected(new Set([id]));
  };

  const feetAll = () => {
    if (!sheet) return;
    const target = selected.size ? selected : new Set(draft.frames.map((f) => f.id));
    edit((d) => ({ ...d, frames: d.frames.map((f) => (target.has(f.id) ? { ...f, ...feetPivot(sheet.key.mask, sheet.img.w, f) } : f)) }));
  };

  const addSelected = (name: string) => {
    const preset = list.find((p) => p.name === name);
    const order = draft.frames.filter((f) => selected.has(f.id)).map((f) => f.id);
    edit((d) => {
      const a: DraftAnim = d.anims[name] ?? { frames: [], fps: preset?.fps ?? 10, loop: preset?.loop ?? true };
      return { ...d, anims: { ...d.anims, [name]: { ...a, frames: [...a.frames, ...order] } } };
    });
    setSelected(new Set());
  };

  const newCharacter = () => {
    setOpenId(null);
    setDraft(emptyDraft());
    setSheet(null);
    sourceBytes.current = null;
    setSelected(new Set());
    setDirty(false);
    setStatus("");
  };

  const openCharacter = (id: string) => {
    const ch = project.characters.find((c) => c.id === id) as ImportedCharacter | undefined;
    if (!ch) return;
    setOpenId(id);
    setSheet(null);
    sourceBytes.current = null;
    setSelected(new Set());
    setDirty(false);
    setStatus("");
    setDraft(draftOf(ch) ?? { ...emptyDraft(), id: ch.id, name: ch.name, role: ch.role, height: ch.height });
  };

  const save = async () => {
    if (!draft.name.trim()) return setStatus("needName");
    if (!draft.frames.length || !zones) return setStatus("needFrames");
    setBusy("saving");
    try {
      const atlas = packAtlas(zones.frames, deferred.frames.map((f) => f.id));
      const png = await encodePng(atlas.w, atlas.h, atlas.rgba);
      const ref = await putAsset(png, "image/png");
      const { project: next, character } = saveCharacter(project, { draft, atlas: ref, rects: atlas.rects, zones: zones.zones });
      onChange(next);
      setDraft((d) => ({ ...d, id: character.id }));
      setOpenId(character.id);
      setDirty(false);
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      setBusy("");
    }
  };

  const remove = () => {
    if (!draft.id) return;
    onChange(removeCharacter(project, draft.id));
    newCharacter();
  };

  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void openFile(file);
  };

  const one = draft.frames.find((f) => selected.size === 1 && selected.has(f.id));
  const presetId = HEIGHTS.find((p) => p.px === draft.height)?.id ?? "custom";
  const animName = active && draft.anims[active]?.frames.length ? active : (Object.keys(draft.anims).find((k) => draft.anims[k]!.frames.length) ?? null);
  const opened = openId ? (project.characters.find((c) => c.id === openId) as ImportedCharacter | undefined) : undefined;

  const filePicker = (
    <input
      ref={fileInput}
      type="file"
      accept="image/png,image/webp,image/gif,image/jpeg"
      className="wms-sr"
      aria-label={t.drop.pick}
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void openFile(f);
        e.target.value = "";
      }}
    />
  );

  return (
    <div className="wms" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <nav className="wms-list" aria-label={t.characters}>
        <span className="wms-h">{t.characters}</span>
        {project.characters.map((c) => (
          <button key={c.id} type="button" className={`wms-cap${openId === c.id ? " is-on" : ""}`} aria-pressed={openId === c.id} onClick={() => openCharacter(c.id)}>
            {c.name}
          </button>
        ))}
        <button type="button" className={`wms-cap${openId === null ? " is-on" : ""}`} onClick={newCharacter}>
          + {t.newCharacter}
        </button>
      </nav>
      {!persistent ? <p className="wms-alert">{t.storageWarn}</p> : null}
      <div className="wms-cols">
        <section className="wms-card wms-sheet-card" aria-labelledby="wms-sheet-title">
          {filePicker}
          <div className="wms-row">
            <span className="wms-h wms-accent" id="wms-sheet-title">
              {draft.id ? fmt(t.editTitle, { name: draft.name }) : `${t.newTitle}${draft.name ? ` · ${draft.name}` : ""}`}
            </span>
            <span className="wms-spacer" />
            {sheet ? (
              <button type="button" className="wms-cap" onClick={() => fileInput.current?.click()}>
                ⇪ {t.changeSheet}
              </button>
            ) : null}
          </div>
          {sheet ? (
            <>
              <h2 className="wms-title">{draft.frames.length ? fmt(t.found, { n: draft.frames.length }) : t.foundNone}</h2>
              <p className="wms-note">
                {t.foundHint}
                {sheet.key.magenta ? ` ${t.magentaKeyed}` : ""}
              </p>
              <SheetView
                url={sheet.url}
                w={sheet.img.w}
                h={sheet.img.h}
                frames={draft.frames}
                selected={selected}
                labels={labels}
                zoom={zoom}
                label={t.sheetLabel}
                frameLabel={(n) => fmt(t.frameLabel, { n })}
                onSelect={select}
                onChange={setFrames}
                onDelete={deleteSelected}
              />
              <div className="wms-row wms-wrap">
                <div className="wms-seg" role="group" aria-label={t.mode.label}>
                  {(["figures", "grid"] as const).map((m) => (
                    <button key={m} type="button" className={`wms-cap${draft.mode === m ? " is-on" : ""}`} aria-pressed={draft.mode === m} onClick={() => redetect({ mode: m })}>
                      {m === "figures" ? t.mode.figures : `${t.mode.grid} ${draft.grid.w}×${draft.grid.h}`}
                    </button>
                  ))}
                </div>
                {draft.mode === "grid" ? (
                  <>
                    <label className="wms-field wms-field-num">
                      <span>{t.gridW}</span>
                      <input type="number" min={8} max={512} step={8} value={draft.grid.w} onChange={(e) => redetect({ grid: { ...draft.grid, w: Math.max(4, Number(e.target.value) || 48) } })} />
                    </label>
                    <label className="wms-field wms-field-num">
                      <span>{t.gridH}</span>
                      <input type="number" min={8} max={512} step={8} value={draft.grid.h} onChange={(e) => redetect({ grid: { ...draft.grid, h: Math.max(4, Number(e.target.value) || 48) } })} />
                    </label>
                  </>
                ) : null}
                <label className="wms-field wms-field-num">
                  <span>{t.tolerance}</span>
                  <input type="number" min={0} max={128} value={draft.tolerance} onChange={(e) => redetect({ tolerance: Math.max(0, Math.min(128, Number(e.target.value) || 0)) })} />
                </label>
                <button type="button" className="wms-cap" onClick={feetAll}>
                  {t.feetAll}
                </button>
              </div>
              <div className="wms-row wms-wrap">
                <button type="button" className="wms-cap" onClick={addBox}>
                  + {t.addBox}
                </button>
                <button type="button" className="wms-cap" disabled={!selected.size} onClick={deleteSelected}>
                  {t.deleteBox}
                </button>
                <button type="button" className="wms-cap" onClick={() => setSelected(new Set(draft.frames.map((f) => f.id)))}>
                  {t.selectAll}
                </button>
                <button type="button" className="wms-cap" disabled={!selected.size} onClick={() => setSelected(new Set())}>
                  {t.selectNone}
                </button>
                <span className="wms-mono wms-dim">{selected.size ? fmt(t.selected, { n: selected.size }) : ""}</span>
                <span className="wms-spacer" />
                <div className="wms-seg" role="group" aria-label={t.zoom}>
                  {ZOOMS.map((z) => (
                    <button key={z} type="button" className={`wms-cap${zoom === z ? " is-on" : ""}`} aria-pressed={zoom === z} onClick={() => setZoom(z)}>
                      {z}×
                    </button>
                  ))}
                </div>
              </div>
              {one ? (
                <fieldset className="wms-box-edit">
                  <legend className="wms-h">
                    {t.box.title} · {numberOf(one.id)}
                  </legend>
                  {(["x", "y", "w", "h", "px", "py"] as const).map((k) => (
                    <label key={k} className="wms-field wms-field-num">
                      <span>{t.box[k]}</span>
                      <input type="number" min={k === "w" || k === "h" ? 1 : 0} value={one[k]} onChange={(e) => setFrames(draft.frames.map((f) => (f.id === one.id ? { ...f, [k]: Math.max(0, Math.round(Number(e.target.value) || 0)) } : f)))} />
                    </label>
                  ))}
                  <button type="button" className="wms-cap" onClick={feetAll}>
                    {t.box.feet}
                  </button>
                </fieldset>
              ) : null}
            </>
          ) : (
            <div className="wms-drop">
              {busy === "loading" ? (
                <p className="wms-title">{t.drop.loading}</p>
              ) : (
                <>
                  {opened && !draft.sheet ? <p className="wms-note">{fmt(t.notImported, { name: opened.name })}</p> : null}
                  <p className="wms-title">{t.drop.title}</p>
                  <button type="button" className="wms-cap is-on" onClick={() => fileInput.current?.click()}>
                    ⇪ {t.drop.pick}
                  </button>
                  <p className="wms-note">{t.drop.hint}</p>
                </>
              )}
              {status === "loadError" ? (
                <p className="wms-alert" role="alert">
                  {loadWhy ?? t.drop.error}
                </p>
              ) : null}
            </div>
          )}
        </section>

        <div className="wms-side">
          <section className="wms-card" aria-labelledby="wms-char-title">
            <h3 className="wms-h" id="wms-char-title">
              {t.character}
            </h3>
            <div className="wms-row wms-wrap">
              <label className="wms-field wms-grow">
                <span>{t.name}</span>
                <input type="text" value={draft.name} placeholder={t.namePlaceholder} onChange={(e) => edit((d) => ({ ...d, name: e.target.value }))} />
              </label>
              <label className="wms-field">
                <span>{t.role.label}</span>
                <select
                  value={draft.role}
                  onChange={(e) => {
                    const role = e.target.value as CharacterRole;
                    edit((d) => ({ ...d, role, height: d.frames.length || d.id ? d.height : DEFAULT_HEIGHT[role] }));
                    setActive(ANIMS[role][0]!.name);
                  }}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t.role[r]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="wms-row wms-wrap">
              <label className="wms-field">
                <span>{t.heightPreset}</span>
                <select
                  value={presetId}
                  onChange={(e) => {
                    const p = HEIGHTS.find((x) => x.id === e.target.value);
                    if (p) edit((d) => ({ ...d, height: p.px }));
                  }}
                >
                  {HEIGHTS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {t.heights[p.id as keyof typeof t.heights]}
                    </option>
                  ))}
                  {presetId === "custom" ? <option value="custom">{t.heights.custom}</option> : null}
                </select>
              </label>
              <label className="wms-field wms-field-num">
                <span>{t.height}</span>
                <input type="number" min={8} max={192} value={draft.height} onChange={(e) => edit((d) => ({ ...d, height: Math.max(8, Math.min(192, Math.round(Number(e.target.value) || 44))) }))} />
              </label>
            </div>
            <div className="wms-row wms-wrap">
              <button type="button" className="wms-cap is-on wms-save" disabled={busy === "saving" || !sheet} onClick={() => void save()}>
                {busy === "saving" ? t.saving : t.save}
              </button>
              {draft.id ? (
                <button type="button" className="wms-cap" onClick={remove}>
                  {t.delete}
                </button>
              ) : null}
              <span className="wms-status" role="status">
                {status === "saved" ? `✓ ${t.saved}` : status === "error" ? t.saveError : status === "needName" ? t.needName : status === "needFrames" ? t.needFrames : dirty ? `• ${t.unsaved}` : ""}
              </span>
            </div>
          </section>

          <AnimationPanel
            t={t}
            role={draft.role}
            anims={draft.anims}
            active={active}
            selectedCount={selected.size}
            thumbs={shown}
            numberOf={numberOf}
            colorOf={colorOf}
            onActive={setActive}
            onChange={(anims) => edit((d) => ({ ...d, anims }))}
            onAddSelected={addSelected}
          />

          <BoardPanel
            t={t}
            lang={lang}
            animName={animName}
            anim={animName ? (deferred.anims[animName] ?? null) : null}
            frames={shown}
            height={draft.height}
            sourceHeight={sourceHeight(deferred.frames, deferred.anims)}
            zones={zones}
            swapColors={draft.swapColors}
            onToggleSwap={(hex) => edit((d) => ({ ...d, swapColors: d.swapColors.includes(hex) ? d.swapColors.filter((c) => c !== hex) : [...d.swapColors, hex] }))}
          />
        </div>
      </div>
    </div>
  );
}

