// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Loads the tileset pictures the canvas draws with: a project's own (from
// IndexedDB by hash) and the starter ones (public/willy-maker/tiles/).

import { useEffect, useState } from "react";
import type { Project } from "../model";
import { assetUrl } from "../io/assets";
import { CITY_TILESET, SKY_TILESET } from "../templates/tiles";
import type { TileImage } from "./render";

const STARTER_URLS: Record<string, string> = { [CITY_TILESET.id]: CITY_TILESET.url, [SKY_TILESET.id]: SKY_TILESET.url };
const cache = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(url: string): Promise<HTMLImageElement | null> {
  const hit = cache.get(url);
  if (hit) return hit;
  const p = new Promise<HTMLImageElement | null>((resolve) => {
    if (typeof Image === "undefined") return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  cache.set(url, p);
  return p;
}

const STARTERS = [
  { id: CITY_TILESET.id, tile: CITY_TILESET.tile, columns: CITY_TILESET.columns },
  { id: SKY_TILESET.id, tile: SKY_TILESET.tile, columns: SKY_TILESET.columns },
];

async function load(list: { id: string; tile: number; columns: number; url: string | null }[]): Promise<Map<string, TileImage>> {
  const out = new Map<string, TileImage>();
  await Promise.all(
    list.map(async (ts) => {
      if (!ts.url) return;
      const img = await loadImage(ts.url);
      if (img) out.set(ts.id, { img, tile: ts.tile, columns: ts.columns || Math.max(1, Math.floor(img.naturalWidth / ts.tile)) });
    }),
  );
  return out;
}

export function useStarterImages(): Map<string, TileImage> {
  const [images, setImages] = useState<Map<string, TileImage>>(() => new Map());
  useEffect(() => {
    let alive = true;
    void load(STARTERS.map((s) => ({ ...s, url: STARTER_URLS[s.id]! }))).then((m) => alive && setImages(m));
    return () => {
      alive = false;
    };
  }, []);
  return images;
}

export function useProjectImages(project: Project): Map<string, TileImage> {
  const key = project.tilesets.map((t) => `${t.id}=${t.image ?? ""}`).join("|");
  const [images, setImages] = useState<Map<string, TileImage>>(() => new Map());
  useEffect(() => {
    let alive = true;
    void (async () => {
      const list = await Promise.all(
        project.tilesets.map(async (t) => ({ id: t.id, tile: t.tile, columns: t.columns ?? 0, url: (await assetUrl(t.image)) ?? STARTER_URLS[t.id] ?? null })),
      );
      const m = await load(list);
      if (alive) setImages(m);
    })();
    return () => {
      alive = false;
    };
    // the key names every tileset and picture
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return images;
}
