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
import { editorBoard, PixelEditor, type EditorFrame, type EditorLayer } from "./ui/PixelEditor";
import { boardOf } from "../board/cps1";
import { colorsOf } from "./pixels";
import { cleanShapes } from "./vector";
import { BoardPanel } from "./ui/BoardPanel";
import { drawArt } from "../ui/render";
import { useProjectImages } from "../ui/useTileImages";
import "./sprites.css";
import { characterSheetPlan } from "../prompts/imagePrompt";
import { rowsOf } from "./rows";
import { appendSheet } from "./append";

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

/** Found frames numbered after the drawn ones, so no two share an id. */
function renumber(found: SourceFrame[], drawn: SourceFrame[]): SourceFrame[] {
  if (!drawn.length) return found;
  const start = nextNumber(drawn);
  return found.map((f, i) => ({ ...f, id: `f${start + i}` }));
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
  const appendInput = useRef<HTMLInputElement>(null);
  const [appended, setAppended] = useState("");
  const sourceBytes = useRef<{ bytes: Uint8Array; type: string } | null>(null);
  // frames drawn by hand in the pixel editor (by frame id), at their size on the board; saved as the frame's `edit`
  const [edits, setEdits] = useState<ReadonlyMap<string, ScaledFrame>>(new Map());
  // and the layers they were drawn in (by frame id), when they have more than one or a shirt
  const [layerEdits, setLayerEdits] = useState<ReadonlyMap<string, EditorLayer[]>>(new Map());
  // the animation open in the pixel editor, and the frame it opened on
  const [editing, setEditing] = useState<{ anim: string; start: number } | null>(null);

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

  // reopening a saved character: the frames edited by hand come from storage too
  const editRefs = draft.frames.flatMap((f) => (f.edit && !edits.has(f.id) ? [[f.id, f.edit] as const] : []));
  const editKey = editRefs.map(([id, e]) => `${id}:${e.ref}`).join("|");
  useEffect(() => {
    if (!editRefs.length) return;
    let live = true;
    void Promise.all(
      editRefs.map(async ([id, e]) => {
        const asset = await getAsset(e.ref).catch(() => null);
        if (!asset) return null;
        const img = await decodeImage(asset.bytes, asset.type).catch(() => null);
        if (!img) return null;
        // its layers, when it was drawn in more than one
        const layers: EditorLayer[] = [];
        for (const l of e.layers ?? []) {
          const a = await getAsset(l.ref).catch(() => null);
          const pic = a ? await decodeImage(a.bytes, a.type).catch(() => null) : null;
          if (!pic) return [id, { w: img.w, h: img.h, rgba: new Uint8Array(img.data), px: e.px, py: e.py }, null] as const;
          // a vector layer's shapes come back with it
          layers.push({ name: l.name, pic: { w: pic.w, h: pic.h, rgba: new Uint8Array(pic.data) }, visible: l.visible, locked: l.locked, shirt: !!l.shirt, ...(Array.isArray(l.shapes) ? { shapes: cleanShapes(l.shapes) } : {}) });
        }
        return [id, { w: img.w, h: img.h, rgba: new Uint8Array(img.data), px: e.px, py: e.py }, layers.length ? layers : null] as const;
      }),
    ).then((pairs) => {
      if (!live) return;
      setEdits((cur) => {
        const next = new Map(cur);
        for (const p of pairs) if (p) next.set(p[0], p[1]);
        return next;
      });
      setLayerEdits((cur) => {
        const next = new Map(cur);
        for (const p of pairs) if (p?.[2]) next.set(p[0], p[2]);
        return next;
      });
    });
    return () => {
      live = false;
    };
    // the refs to load, not the array, decide
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editKey]);

  const sheetUrl = sheet?.url;
  useEffect(
    () => () => {
      if (sheetUrl) URL.revokeObjectURL(sheetUrl);
    },
    [sheetUrl],
  );

  const openFile = async (file: File) => {
    setAppended("");
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
      // the frames drawn in the pixel editor stay with their animations; the sheet's are found again
      const drawn = new Set(draft.frames.filter((f) => f.drawn).map((f) => f.id));
      // a full or blocked IndexedDB keeps the picture only for this page: say so
      assetsPersistent().then(setPersistent);
      edit((d) => ({
        ...d,
        sheet: sheetRef,
        file: file.name,
        frames: [...renumber(frames, d.frames.filter((f) => f.drawn)), ...d.frames.filter((f) => f.drawn)],
        name: d.name || file.name.replace(/\.[a-z0-9]+$/i, "").replace(/^\d+[_-]?/, "").replace(/[_-]+/g, " "),
        anims: Object.fromEntries(Object.entries(d.anims).map(([k, a]) => [k, { ...a, frames: a.frames.filter((id) => drawn.has(id)) }])),
      }));
      setSelected(new Set());
    } catch (e) {
      setStatus("loadError");
      setLoadWhy(core.pictureError(inputErrorText(core.inputErrors, e)));
    } finally {
      setBusy("");
    }
  };

  /** One more picture under the sheet (an image AI's next message): its frames are added, the animations kept. */
  const appendFile = async (file: File) => {
    if (!sheet) return void openFile(file);
    setBusy("loading");
    setStatus("");
    setLoadWhy(null);
    try {
      if (file.size > SHEET_MAX_BYTES) throw new InputError("file.too-big", { mb: Math.round(file.size / 1048576), max: SHEET_MAX_BYTES / 1048576 });
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = checkSheetFile(bytes, file.type);
      let more: Sheet;
      try {
        more = await loadSheet(bytes, type, draft.tolerance);
      } catch {
        throw new InputError("image.unreadable");
      }
      URL.revokeObjectURL(more.url);
      const { sheet: joined, top } = appendSheet(applyMask(sheet.img, sheet.key.mask), applyMask(more.img, more.key.mask));
      const png = await encodePng(joined.w, joined.h, joined.rgba);
      const s = await loadSheet(png, "image/png", draft.tolerance);
      try {
        checkSheetImage(s.img, s.key);
      } catch (e) {
        URL.revokeObjectURL(s.url);
        throw e;
      }
      // the new picture's own boxes, moved under the sheet, numbered after the ones there
      const { w, h } = more.img;
      const boxes = draft.mode === "grid" ? gridBoxes(more.key.mask, w, h, draft.grid.w, draft.grid.h) : detectFigures(more.key.mask, w, h);
      const added = framesFrom(boxes, more.key.mask, w, nextNumber(draft.frames)).map((f) => ({ ...f, y: f.y + top }));
      sourceBytes.current = { bytes: png, type: "image/png" };
      setSheet(s);
      const ref = await putAsset(png, "image/png");
      edit((d) => ({ ...d, sheet: ref, file: `${d.file} + ${file.name}`, frames: [...d.frames, ...added] }));
      setSelected(new Set(added.map((f) => f.id)));
      setAppended(fmt(t.appended, { n: added.length, file: file.name }));
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
      frames: s ? [...renumber(detect(s, next), d.frames.filter((f) => f.drawn)), ...d.frames.filter((f) => f.drawn)] : d.frames,
      anims: s ? Object.fromEntries(Object.entries(d.anims).map(([k, a]) => [k, { ...a, frames: a.frames.filter((id) => d.frames.some((f) => f.id === id && f.drawn)) }])) : d.anims,
    }));
    setSelected(new Set());
  };

  // ---- derived: board pictures, zones (deferred so dragging stays smooth)
  const keyed = useMemo(() => (sheet ? applyMask(sheet.img, sheet.key.mask) : null), [sheet]);
  const deferred = useDeferredValue(draft);
  const sheetFrames = useMemo(() => deferred.frames.filter((f) => !f.drawn), [deferred.frames]);
  const scale = useMemo(() => scaleFor(sheetFrames, deferred.anims, deferred.height), [sheetFrames, deferred.anims, deferred.height]);
  const scaled = useMemo(() => (keyed ? scaleFrames(keyed, sheetFrames, scale) : null), [keyed, sheetFrames, scale]);
  // every frame on the board: a frame drawn by hand takes the place of its box's picture, a drawn one is only its pixels;
  // until the sheet (or a drawn frame's pixels) has loaded there is nothing to show
  const withEdits = useMemo(() => {
    const out = deferred.frames.map((f) => edits.get(f.id) ?? (f.drawn ? undefined : scaled?.[sheetFrames.indexOf(f)]));
    return out.every((f): f is ScaledFrame => !!f) ? out : [];
  }, [scaled, edits, deferred.frames, sheetFrames]);
  const zones = useMemo(() => (withEdits.length ? analyzeZones(withEdits) : null), [withEdits]);
  const shown = useMemo(() => {
    const m = new Map<string, ScaledFrame>();
    if (zones) deferred.frames.forEach((f, i) => zones.frames[i] && m.set(f.id, zones.frames[i]!));
    return m;
  }, [zones, deferred.frames]);

  const list = animList(draft.role, draft.anims, draft.hidden);
  const colorOf = useCallback((name: string) => Math.max(0, list.findIndex((p) => p.name === name)) % 8, [list]);
  const numberOf = useCallback((id: string) => draft.frames.findIndex((f) => f.id === id) + 1, [draft.frames]);
  const labels = useMemo(() => {
    const m = new Map<string, BoxLabel>();
    for (const [name, a] of Object.entries(draft.anims)) a.frames.forEach((id, i) => m.has(id) || m.set(id, { text: `${t.animNames[name] ?? name} ${i + 1}`, color: colorOf(name) }));
    return m;
  }, [draft.anims, colorOf, t]);

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

  // the sheet view changes the sheet's boxes; the drawn frames stay as they are
  const setFrames = (frames: SourceFrame[]) => edit((d) => ({ ...d, frames: [...frames, ...d.frames.filter((f) => f.drawn)] }));

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
    setEdits(new Map());
    setLayerEdits(new Map());
    setEditing(null);
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
    setEdits(new Map());
    setLayerEdits(new Map());
    setEditing(null);
    setOpenId(id);
    setSheet(null);
    sourceBytes.current = null;
    setSelected(new Set());
    setDirty(false);
    setStatus("");
    setDraft(draftOf(ch) ?? { ...emptyDraft(), id: ch.id, name: ch.name, role: ch.role, height: ch.height });
  };

  /** A new frame's size: the character's own (its first frame on the board), else its height and three quarters of it wide. */
  const newFrameSize = () => {
    const first = [...shown.values()][0];
    return first ? { w: first.w, h: first.h } : { w: Math.max(8, Math.round(draft.height * 0.75)), h: draft.height };
  };

  /** The pixel editor's animation back in the draft: its frames in order, new ones as drawn frames, drawn-on ones as edits. */
  const applyEditor = (anim: string, result: EditorFrame[]) => {
    let n = nextNumber(draft.frames);
    const ids = result.map((f) => f.id ?? `f${n++}`);
    const added: SourceFrame[] = result.flatMap((f, i) => (f.id ? [] : [{ id: ids[i]!, x: 0, y: 0, w: f.pic.w, h: f.pic.h, px: f.pic.px, py: f.pic.py, drawn: true }]));
    setEdits((cur) => {
      const next = new Map(cur);
      result.forEach((f, i) => f.changed && next.set(ids[i]!, { w: f.pic.w, h: f.pic.h, rgba: f.pic.rgba, px: f.pic.px, py: f.pic.py }));
      return next;
    });
    // the layers are kept when there is more than one, or a shirt
    setLayerEdits((cur) => {
      const next = new Map(cur);
      result.forEach((f, i) => {
        if (!f.changed) return;
        if (f.layers.length > 1 || f.layers.some((l) => l.shirt || l.shapes)) next.set(ids[i]!, f.layers);
        else next.delete(ids[i]!);
      });
      return next;
    });
    // a shirt layer's colors are the ones recolored for players 2 to 4
    const shirt = [...new Set(result.flatMap((f) => f.layers.filter((l) => l.shirt && l.visible).flatMap((l) => colorsOf(l.pic))))].map((c) => c.toUpperCase());
    const preset = list.find((p) => p.name === anim) ?? ANIMS[draft.role].find((p) => p.name === anim);
    edit((d) => ({
      ...d,
      frames: [...d.frames, ...added],
      anims: { ...d.anims, [anim]: { fps: d.anims[anim]?.fps ?? preset?.fps ?? 8, loop: d.anims[anim]?.loop ?? preset?.loop ?? true, frames: ids } },
      hidden: d.hidden.filter((h) => h !== anim),
      swapColors: [...new Set([...d.swapColors, ...shirt])],
    }));
    setActive(anim);
    setEditing(null);
  };

  /** A character drawn from nothing: its standing animation opens in the pixel editor with one blank frame. */
  const drawFromScratch = () => {
    newCharacter();
    setActive("idle");
    setEditing({ anim: "idle", start: 0 });
  };

  const save = async () => {
    if (!draft.name.trim()) return setStatus("needName");
    if (!draft.frames.length || !zones) return setStatus("needFrames");
    setBusy("saving");
    try {
      const atlas = packAtlas(zones.frames, deferred.frames.map((f) => f.id));
      const png = await encodePng(atlas.w, atlas.h, atlas.rgba);
      const ref = await putAsset(png, "image/png");
      // the frames drawn by hand keep their pixels with the character, to edit them again
      const frames = await Promise.all(
        draft.frames.map(async (f) => {
          const e = edits.get(f.id);
          if (!e) return f;
          const pic = await putAsset(await encodePng(e.w, e.h, e.rgba), "image/png");
          const ls = layerEdits.get(f.id);
          const layers = ls
            ? await Promise.all(
                ls.map(async (l) => ({
                  name: l.name,
                  ref: await putAsset(await encodePng(l.pic.w, l.pic.h, l.pic.rgba), "image/png"),
                  visible: l.visible,
                  locked: l.locked,
                  ...(l.shirt ? { shirt: true } : {}),
                  ...(l.shapes ? { shapes: l.shapes } : {}),
                })),
              )
            : undefined;
          return { ...f, edit: { ref: pic, w: e.w, h: e.h, px: e.px, py: e.py, ...(layers ? { layers } : {}) } };
        }),
      );
      const saved = { ...draft, frames };
      const { project: next, character } = saveCharacter(project, { draft: saved, atlas: ref, rects: atlas.rects, zones: zones.zones });
      setDraft((d) => ({ ...d, frames: d.frames.map((f) => frames.find((x) => x.id === f.id) ?? f) }));
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

  // a picture pasted anywhere on the tab (copied from an image AI's chat), unless a text field or the pixel editor takes the paste
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (editing) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable)) return;
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (!file) return;
      e.preventDefault();
      // with a sheet open, a pasted picture is the character's next one (its animations stay)
      void (sheet ? appendFile(file) : openFile(file));
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

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

  // the editor's preview "In the level": the first level's art at the frame's scale, its player start under the feet
  const images = useProjectImages(project);
  const level = project.levels?.[0];
  const startAt = level?.layers.flatMap((l) => (l.kind === "objects" ? l.items : [])).find((o) => o.type === "player_start");
  const backdrop = useMemo(
    () =>
      level
        ? (ctx: CanvasRenderingContext2D, w: number, h: number, zoom: number, feetX: number, feetY: number) => {
            const fx = startAt ? startAt.x : 48;
            const fy = startAt ? startAt.y : level.size.h - 32;
            drawArt(ctx, level, { x: fx - feetX / zoom, y: fy - feetY / zoom, zoom, w, h }, 1, images);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
          }
        : undefined,
    [level, startAt, images],
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
              <>
                <button type="button" className="wms-cap" data-tip={t.addPictureTip} onClick={() => appendInput.current?.click()}>
                  + {t.addPicture}
                </button>
                <button type="button" className="wms-cap" onClick={() => fileInput.current?.click()}>
                  ⇪ {t.changeSheet}
                </button>
              </>
            ) : null}
            <input
              ref={appendInput}
              type="file"
              accept="image/png,image/webp,image/gif,image/jpeg"
              className="wms-sr"
              aria-label={t.addPicture}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void appendFile(f);
                e.target.value = "";
              }}
            />
          </div>
          {sheet ? (
            <>
              <h2 className="wms-title">{draft.frames.length ? fmt(t.found, { n: draft.frames.length }) : t.foundNone}</h2>
              {appended ? (
                <p className="wms-note" role="status">
                  {appended}
                </p>
              ) : null}
              <p className="wms-note">
                {t.foundHint}
                {sheet.key.magenta ? ` ${t.magentaKeyed}` : ""}
              </p>
              <SheetView
                url={sheet.url}
                w={sheet.img.w}
                h={sheet.img.h}
                frames={draft.frames.filter((f) => !f.drawn)}
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
                  {opened && !draft.sheet && !draft.frames.length ? <p className="wms-note">{fmt(t.notImported, { name: opened.name })}</p> : null}
                  <p className="wms-title">{t.drop.title}</p>
                  <button type="button" className="wms-cap is-on" onClick={() => fileInput.current?.click()}>
                    ⇪ {t.drop.pick}
                  </button>
                  <p className="wms-note">{t.drop.hint}</p>
                  {!draft.frames.length && (
                    <>
                      <p className="wms-note">{t.pixel.drawScratchHint}</p>
                      <button type="button" className="wms-cap" onClick={drawFromScratch}>
                        {t.pixel.drawScratch}
                      </button>
                    </>
                  )}
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
              <button type="button" className="wms-cap is-on wms-save" disabled={busy === "saving" || (!sheet && !withEdits.length)} onClick={() => void save()}>
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
            onActive={setActive}
            onEditFrame={(id) => active && setEditing({ anim: active, start: Math.max(0, draft.anims[active]?.frames.indexOf(id) ?? 0) })}
            onDrawFrames={(name) => setEditing({ anim: name, start: 0 })}
            edited={new Set(edits.keys())}
            onChange={(anims) => edit((d) => ({ ...d, anims }))}
            onAddSelected={addSelected}
            hidden={draft.hidden}
            onHidden={(hidden) => edit((d) => ({ ...d, hidden }))}
            plan={draft.frames.length ? characterSheetPlan(project.settings.imagePrompts?.character, draft.role) : []}
            onRows={(k) => {
              // the frames no animation has yet (a picture just added) go to the message's animations still empty
              const used = new Set(Object.values(draft.anims).flatMap((a) => a.frames));
              const free = draft.frames.filter((f) => !used.has(f.id));
              const adding = free.length > 0 && free.length < draft.frames.length;
              const all = characterSheetPlan(project.settings.imagePrompts?.character, draft.role)[k] ?? [];
              const plan = adding ? all.filter((a) => !draft.anims[a.name]?.frames.length) : all;
              const rows = rowsOf(adding ? free : draft.frames);
              const n = Math.min(rows.length, plan.length);
              edit((d) => {
                const anims = { ...d.anims };
                for (let i = 0; i < n; i++) {
                  const a = plan[i]!;
                  const preset = ANIMS[d.role].find((p) => p.name === a.name);
                  anims[a.name] = { frames: rows[i]!.map((f) => f.id), fps: anims[a.name]?.fps ?? preset?.fps ?? 10, loop: a.loop };
                }
                return { ...d, anims, hidden: d.hidden.filter((h) => !plan.some((a) => a.name === h)) };
              });
              if (plan[0]) setActive(plan[0].name);
              const done = fmt(t.byRowsDone, { list: plan.slice(0, n).map((a, i) => `${t.animNames[a.name] ?? a.name} ${rows[i]!.length}`).join(", ") });
              return rows.length === plan.length ? done : `${done} ${fmt(t.byRowsMismatch, { rows: rows.length, anims: plan.length })}`;
            }}
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
      {editing && (
        <PixelEditor
          t={t.pixel}
          anim={t.animNames[editing.anim] ?? editing.anim}
          fps={draft.anims[editing.anim]?.fps ?? list.find((p) => p.name === editing.anim)?.fps ?? 8}
          frames={(draft.anims[editing.anim]?.frames ?? []).flatMap((id) => (shown.get(id) ? [{ id, pic: shown.get(id)!, layers: layerEdits.get(id) }] : []))}
          start={editing.start}
          size={newFrameSize()}
          palette={zones ? [...new Set(zones.zones.flatMap((z) => z.palette))] : []}
          board={editorBoard(boardOf(project))}
          backdrop={backdrop}
          onCancel={() => setEditing(null)}
          onApply={(result) => applyEditor(editing.anim, result)}
        />
      )}
    </div>
  );
}
