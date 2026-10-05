// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { SkinPhone } from "../skins/SkinPhone";
import { deviceOf, compute, placementOf } from "../skins/layout";
import { complete } from "../skins/model";
import { smokeSkin } from "../skins/builtin";

/** The default skin on a phone in portrait, drawn by the editor's own renderer: the skin editor's card picture. */
export function SkinThumb() {
  const base = smokeSkin();
  if (!base) return null;
  const skin = complete(base, base);
  const dev = deviceOf("iphone17").portrait;
  const p = placementOf(skin.layout.portrait);
  if (!p) return null;
  const l = compute(p, dev, false, 4 / 3, 6, 2);
  return (
    <span className="skin-thumb" style={{ aspectRatio: `${dev.w} / ${dev.h}` }}>
      <SkinPhone skin={skin} orient="portrait" dev={dev} layout={l} held={false} picture={null} background={null} />
    </span>
  );
}
