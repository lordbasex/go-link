// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Attaches the starter tilesets' pictures (public/willy-maker/tiles/) to a
// project made from a template: each is fetched once, stored by hash and
// referenced from its tileset.

import type { Project } from "../model";
import { CITY_TILESET, SKY_TILESET } from "../templates/tiles";
import { putAsset } from "./assets";

const STARTERS: Record<string, string> = { [CITY_TILESET.id]: CITY_TILESET.url, [SKY_TILESET.id]: SKY_TILESET.url };

/** Returns true when every starter tileset has its picture. */
export async function attachStarterImages(p: Project): Promise<boolean> {
  let ok = true;
  for (const ts of p.tilesets) {
    const url = STARTERS[ts.id];
    if (!url || ts.image) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      ts.image = await putAsset(new Uint8Array(await res.arrayBuffer()), "image/png");
    } catch {
      ok = false;
    }
  }
  return ok;
}
