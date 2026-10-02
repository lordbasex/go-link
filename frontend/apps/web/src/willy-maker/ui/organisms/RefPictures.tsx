// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Reference pictures for the image AI prompt helper (T-29): a photo or a
// drawing of the character or the place, kept with the game, copied to the
// clipboard one by one before the message (a chat AI takes a pasted
// picture, not a picture and text pasted together).

import { useEffect, useState, type ClipboardEvent, type DragEvent } from "react";
import { getAsset, putAsset } from "../../io/assets";
import { MAX_REFS } from "../../prompts/imagePrompt";
import type { PromptMessages } from "../../i18n/prompt.en";

/** A stored picture as a PNG blob no larger than an image AI takes in (the clipboard only carries PNG). */
export async function refPng(ref: string, max = 1536): Promise<Blob | null> {
  const a = await getAsset(ref);
  if (!a || typeof createImageBitmap === "undefined") return null;
  const bmp = await createImageBitmap(new Blob([a.bytes as BlobPart], { type: a.type }));
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob((b) => r(b), "image/png"));
}

function Thumb({ id, label, onRemove }: { id: string; label: string; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    let live = true;
    void getAsset(id).then((a) => {
      if (!a || !live) return;
      u = URL.createObjectURL(new Blob([a.bytes as BlobPart], { type: a.type }));
      setUrl(u);
    });
    return () => {
      live = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [id]);
  return (
    <span className="wm-ref">
      {url ? <img src={url} alt={label} /> : <span className="wm-ref-empty" aria-label={label} />}
      <button type="button" className="wm-help wm-ref-x" aria-label={`${label}: ✕`} data-tip="✕" onClick={onRemove}>
        ×
      </button>
    </span>
  );
}

export function RefPictures({ refs, onChange, t }: { refs: string[]; onChange: (refs: string[]) => void; t: PromptMessages }) {
  const [busy, setBusy] = useState(false);
  const add = async (files: Iterable<File>) => {
    const picked = [...files].filter((f) => f.type.startsWith("image/")).slice(0, MAX_REFS - refs.length);
    if (!picked.length) return;
    setBusy(true);
    const added: string[] = [];
    for (const f of picked) added.push(await putAsset(new Uint8Array(await f.arrayBuffer()), f.type));
    setBusy(false);
    onChange([...new Set([...refs, ...added])].slice(0, MAX_REFS));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    void add(e.dataTransfer.files);
  };
  const onPaste = (e: ClipboardEvent) => {
    if (e.clipboardData.files.length) {
      e.preventDefault();
      void add(e.clipboardData.files);
    }
  };
  return (
    <div className="wm-refs" onDragOver={(e) => e.preventDefault()} onDrop={onDrop} onPaste={onPaste}>
      <span className="wm-field-label">{t.refs.title}</span>
      <p className="wm-dim wm-small">{t.refs.help}</p>
      <div className="wm-row is-wrap">
        {refs.map((r, i) => (
          <Thumb key={r} id={r} label={t.refs.picture(i + 1)} onRemove={() => onChange(refs.filter((x) => x !== r))} />
        ))}
        {refs.length < MAX_REFS && (
          <label className="wm-cap is-sm wm-ref-add">
            {busy ? t.refs.adding : t.refs.add}
            <input type="file" accept="image/*" multiple className="wm-sr" onChange={(e) => void add(e.target.files ?? [])} />
          </label>
        )}
      </div>
    </div>
  );
}
