// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// "Picture…" on the far or play layer (T-28): choose a picture of your own,
// see it fitted to the board (tiles, palettes, colors, the level's new
// width) and use it as the layer's background in one undo step.

import { useEffect, useRef, useState } from "react";
import { useCore } from "../../i18n";
import type { Level } from "../../model";
import type { EditorStore } from "../../editor/store";
import { applyPicture, preparePicture, type PictureLayer, type PictureOptions, type PreparedPicture } from "../../editor/pictureImport";
import { putAsset } from "../../io/assets";
import { decodeImage, encodePng } from "../../sprites/image";
import type { Rgba } from "../../editor/picture";
import type { TileImage } from "../render";
import { Capsule } from "../atoms";
import { tilesetPixels } from "../studio/background";

export function PictureDialog({ store, level, layer, images, onClose }: { store: EditorStore; level: Level; layer: PictureLayer; images: Map<string, TileImage>; onClose: (applied: boolean) => void }) {
  const t = useCore().picture;
  const [file, setFile] = useState<Rgba | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<PreparedPicture | null>(null);
  const [opts, setOpts] = useState<PictureOptions>({ layer, height: level.size.h, x: 0, repeat: false, grow: true, keyMagenta: layer === "play" });
  const [keep, setKeep] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const heights = Array.from({ length: Math.floor(level.size.h / 224) }, (_, i) => (i + 1) * 224).filter((h) => h <= level.size.h);
  if (!heights.includes(level.size.h)) heights.push(level.size.h);

  // fit again whenever the picture or an option changes
  useEffect(() => {
    if (!file) return;
    setBusy(true);
    const id = setTimeout(() => {
      try {
        const layerNow = level.layers.find((l) => l.kind === "tiles" && l.id === layer);
        const current = keep && layerNow && layerNow.kind === "tiles" ? tilesetPixels(images.get(layerNow.tileset ?? "")) : null;
        setPrepared(preparePicture(level, file, opts, current));
      } catch {
        setError(true);
      }
      setBusy(false);
    }, 30);
    return () => clearTimeout(id);
  }, [file, opts, keep, level, layer, images]);

  // the preview, at board scale (CSS makes it bigger, pixel for pixel)
  useEffect(() => {
    const c = canvas.current;
    if (!c || !prepared) return;
    const { w, h, keys } = prepared.preview;
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx || typeof ImageData === "undefined") return;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]!;
      if (k < 0) continue;
      data[i * 4] = ((k >> 8) & 15) * 17;
      data[i * 4 + 1] = ((k >> 4) & 15) * 17;
      data[i * 4 + 2] = (k & 15) * 17;
      data[i * 4 + 3] = 255;
    }
    ctx.putImageData(new ImageData(data, w, h), 0, 0);
  }, [prepared]);

  const choose = async (f: File | undefined) => {
    if (!f) return;
    setError(false);
    try {
      setFile(await decodeImage(new Uint8Array(await f.arrayBuffer()), f.type || "image/png"));
    } catch {
      setError(true);
    }
  };

  // a picture pasted while the dialog is open (copied from an image AI's chat)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
      if (!f) return;
      e.preventDefault();
      void choose(f);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  const apply = async () => {
    if (!prepared) return;
    setBusy(true);
    const ts = prepared.fit.tileset;
    const ref = await putAsset(await encodePng(ts.w, ts.h, ts.data), "image/png");
    applyPicture(store, prepared, ref, t.undo);
    setBusy(false);
    onClose(true);
  };

  const s = prepared?.fit.stats;
  return (
    <div className="wm-picture-back" role="presentation" onPointerDown={(e) => e.target === e.currentTarget && onClose(false)}>
      <div className="wm-picture wm-card" role="dialog" aria-modal="true" aria-label={t.title(t.layers[layer])}>
        <h2 className="wm-wizard-q">{t.title(t.layers[layer])}</h2>
        <p className="wm-dim wm-small">{t.help}</p>
        {layer === "far" && <p className="wm-note wm-small">{t.farNote}</p>}
        <label className="wm-cap wm-picture-file">
          {t.choose}
          <input type="file" accept="image/*" className="wm-sr" onChange={(e) => void choose(e.target.files?.[0])} />
        </label>
        <div className="wm-picture-opts">
          <label className="wm-small">
            {t.height}{" "}
            <select className="wm-input is-sm" value={opts.height} onChange={(e) => setOpts({ ...opts, height: Number(e.target.value) })}>
              {heights.map((h) => (
                <option key={h} value={h}>
                  {t.heightN(h, h / 224)}
                </option>
              ))}
            </select>
          </label>
          <label className="wm-small">
            {t.x}{" "}
            <input className="wm-input is-sm" type="number" min={0} step={layer === "far" ? 32 : 16} value={opts.x} onChange={(e) => setOpts({ ...opts, x: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
          <label className="wm-small">
            {t.mode}{" "}
            <select className="wm-input is-sm" value={keep ? "add" : "replace"} onChange={(e) => setKeep(e.target.value === "add")}>
              <option value="replace">{t.replace}</option>
              <option value="add">{t.add}</option>
            </select>
          </label>
          <label className="wm-small">
            <input type="checkbox" checked={opts.keyMagenta === true} onChange={(e) => setOpts({ ...opts, keyMagenta: e.target.checked })} /> {t.keyMagenta}
          </label>
          <label className="wm-small">
            <input type="checkbox" checked={opts.repeat} onChange={(e) => setOpts({ ...opts, repeat: e.target.checked })} /> {t.repeat}
          </label>
          <label className="wm-small">
            <input type="checkbox" checked={opts.grow} disabled={opts.repeat} onChange={(e) => setOpts({ ...opts, grow: e.target.checked })} /> {t.grow}
          </label>
        </div>
        {error && (
          <p className="wm-note is-error wm-small" role="alert">
            {t.failed}
          </p>
        )}
        {busy && <p className="wm-dim wm-small" role="status">{t.working}</p>}
        {prepared && s && (
          <>
            <div className="wm-picture-preview">
              <canvas ref={canvas} aria-label={t.title(t.layers[layer])} />
            </div>
            <p className="wm-small">
              {prepared.picture.pixelSize > 1 ? t.pixelArt(prepared.picture.pixelSize) : t.scaled(prepared.picture.w, prepared.picture.h)} {t.stats(s)}
            </p>
            <p className="wm-dim wm-small">
              {t.approx(s.approximated, s.meanError)} {t.width(prepared.width, level.size.w)}
            </p>
          </>
        )}
        <div className="wm-wizard-foot">
          <Capsule size="lg" onClick={() => onClose(false)}>
            {t.cancel}
          </Capsule>
          <Capsule size="lg" tone="primary" disabled={!prepared || busy} onClick={() => void apply()}>
            {t.apply}
          </Capsule>
        </div>
      </div>
    </div>
  );
}
