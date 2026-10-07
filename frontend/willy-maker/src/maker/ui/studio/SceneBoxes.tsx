// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The background's scenes on the canvas (Level.scenes, editor/scenes.ts),
// shown while the background is selected: a box for each scene's visible
// part, the picked one in the accent color. Dragging a box moves the scene
// (over or under its neighbours: a later scene is drawn over an earlier
// one), dragging the picked box's left or right edge cuts that edge off, so
// a seam can be hidden under the next picture. While dragging, the picture
// itself follows the pointer; on release the background is laid out again.

import { useEffect, useRef, useState } from "react";
import type { BackgroundScene, Level } from "../../model";
import { getAsset } from "../../io/assets";
import { sceneBox } from "../../editor/scenes";
import { useStudioText } from "../../i18n";
import { useStudioUi, useUiState } from "./state";

/** A scene's picture for the canvas: an object URL and its size, loaded once per asset. */
const urls = new Map<string, Promise<{ url: string; w: number; h: number } | null>>();
function pictureOf(asset: string): Promise<{ url: string; w: number; h: number } | null> {
  let p = urls.get(asset);
  if (!p) {
    p = (async () => {
      const stored = await getAsset(asset);
      if (!stored || typeof URL.createObjectURL !== "function") return null;
      const url = URL.createObjectURL(new Blob([stored.bytes as BlobPart], { type: stored.type || "image/png" }));
      const img = new Image();
      img.src = url;
      await img.decode().catch(() => undefined);
      return img.naturalWidth ? { url, w: img.naturalWidth, h: img.naturalHeight } : null;
    })();
    urls.set(asset, p);
  }
  return p;
}

type Drag = { id: string; mode: "move" | "left" | "right"; x0: number; y0: number; start: BackgroundScene; moved: boolean };

export function SceneBoxes({ level, z, onChange }: { level: Level; z: number; onChange: (scenes: BackgroundScene[]) => void }) {
  const t = useStudioText();
  const ui = useStudioUi();
  const picked = useUiState().scene;
  const scenes = level.scenes ?? [];
  const [pics, setPics] = useState<Map<string, { url: string; w: number; h: number }>>(new Map());
  const [draft, setDraftState] = useState<BackgroundScene | null>(null);
  const draftRef = useRef<BackgroundScene | null>(null);
  const setDraft = (d: BackgroundScene | null) => {
    draftRef.current = d;
    setDraftState(d);
  };
  const drag = useRef<Drag | null>(null);

  const assets = scenes.map((s) => s.asset).join(",");
  useEffect(() => {
    let live = true;
    void Promise.all(scenes.map(async (s) => [s.asset, await pictureOf(s.asset)] as const)).then((all) => {
      if (live) setPics(new Map(all.filter((a): a is readonly [string, { url: string; w: number; h: number }] => !!a[1])));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]);

  const down = (e: React.PointerEvent, s: BackgroundScene, mode: Drag["mode"]) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    ui.set({ scene: s.id });
    drag.current = { id: s.id, mode, x0: e.clientX, y0: e.clientY, start: { ...s }, moved: false };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = Math.round((ev.clientX - d.x0) / z);
      const dy = Math.round((ev.clientY - d.y0) / z);
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 2) return;
      d.moved = true;
      const s0 = d.start;
      if (d.mode === "move") setDraft({ ...s0, x: s0.x + dx, dy: ev.shiftKey ? s0.dy : s0.dy + dy });
      else if (d.mode === "left") setDraft({ ...s0, cropL: Math.max(0, (s0.cropL ?? 0) + dx) });
      else setDraft({ ...s0, cropR: Math.max(0, (s0.cropR ?? 0) - dx) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const d = drag.current;
      const cur = draftRef.current;
      drag.current = null;
      setDraft(null);
      if (d?.moved && cur) onChange(scenes.map((x) => (x.id === cur.id ? cur : { ...x })));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return (
    <div className="studio-scene-boxes">
      {scenes.map((s0, i) => {
        const s = draft?.id === s0.id ? draft : s0;
        const pic = pics.get(s.asset);
        if (!pic) return null;
        const b = sceneBox(level, s, pic);
        const sel = picked === s.id;
        const dragging = draft?.id === s.id;
        return (
          <div
            key={s.id}
            className={`studio-scene-box${sel ? " is-picked" : ""}${dragging ? " is-dragging" : ""}`}
            style={{ left: b.x * z, top: b.y * z, width: b.w * z, height: b.h * z, zIndex: i + 1 + (dragging ? 100 : 0) }}
            title={t.props.sceneDragHint}
            onPointerDown={(e) => down(e, s0, "move")}
          >
            {dragging && <img src={pic.url} alt="" draggable={false} style={{ left: -(b.x - s.x) * z, width: b.full * z, height: b.h * z }} />}
            <span className="studio-scene-tag">
              {i + 1}. {s.name}
            </span>
            {sel && (
              <>
                <span className="studio-scene-edge is-left" title={t.props.sceneCropHint} onPointerDown={(e) => down(e, s0, "left")} />
                <span className="studio-scene-edge is-right" title={t.props.sceneCropHint} onPointerDown={(e) => down(e, s0, "right")} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
