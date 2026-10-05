// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PICTURE_BANDS,
  PICTURE_STYLES,
  isPictureBands,
  isPictureStyle,
  type PictureBands,
  type PictureSettings,
  type PictureStyle,
} from "@go-link/shared";

// How this browser draws the game. Each viewer's own choice (kept in
// localStorage, never sent anywhere) wins; a viewer who never chose gets
// the room's default, set by its host (room_state.picture), else the
// site's default.

export { PICTURE_BANDS, PICTURE_STYLES };
export type { PictureBands, PictureSettings, PictureStyle };

export const STYLE_KEY = "go-link.picture-style";
export const BANDS_KEY = "go-link.picture-bands";

/** The site's default picture: smooth, with the game's colors glowing beside it. */
export const DEFAULT_STYLE: PictureStyle = "smooth";
export const DEFAULT_BANDS: PictureBands = "ambient";
export const SITE_DEFAULT: PictureSettings = { style: DEFAULT_STYLE, bands: DEFAULT_BANDS };

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage disabled: the choice lasts while the page lives
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // storage disabled: nothing was kept
  }
}

/** The viewer's own choice, as far as it goes (unknown values are dropped). */
export function readSavedPicture(): Partial<PictureSettings> {
  const style = read(STYLE_KEY);
  const bands = read(BANDS_KEY);
  return {
    ...(isPictureStyle(style) ? { style } : {}),
    ...(isPictureBands(bands) ? { bands } : {}),
  };
}

/** Who wins: the viewer's own choice, then the room's default, then the site's. */
export function resolvePicture(saved: Partial<PictureSettings>, room: PictureSettings | null | undefined): PictureSettings {
  const base = room ?? SITE_DEFAULT;
  return { style: saved.style ?? base.style, bands: saved.bands ?? base.bands };
}

/** The picture this viewer sees in a room with that default (none: the site's). */
export function readPictureSettings(room?: PictureSettings | null): PictureSettings {
  return resolvePicture(readSavedPicture(), room);
}

/** The event that tells every mounted control a setting changed. */
const CHANGE_EVENT = "go-link:picture";

export function writePictureSettings(next: PictureSettings): void {
  write(STYLE_KEY, next.style);
  write(BANDS_KEY, next.bands);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Forgets the viewer's own choice: the room's default, or the site's, applies again. */
export function clearPictureSettings(): void {
  remove(STYLE_KEY);
  remove(BANDS_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Whether two picture settings are the same. */
export function samePicture(a: PictureSettings | null | undefined, b: PictureSettings | null | undefined): boolean {
  return !!a && !!b && a.style === b.style && a.bands === b.bands;
}

/**
 * Whether the GPU renderer is needed at all: the smooth style on black
 * bands is exactly what the <video> element draws, so it stays as it is.
 */
export function needsRenderer(s: PictureSettings): boolean {
  return s.style !== "smooth" || s.bands !== "black";
}

export interface PictureChoice {
  /** The viewer chose a picture of their own (it wins over the room's default). */
  saved: boolean;
  /** Forgets the viewer's choice. */
  reset: () => void;
}

/**
 * The picture this viewer sees, shared by every component that uses it:
 * room is the room's default (room_state.picture), if any.
 */
export function usePictureSettings(
  room?: PictureSettings | null,
): [PictureSettings, (next: Partial<PictureSettings>) => void, PictureChoice] {
  const [saved, setSaved] = useState(readSavedPicture);
  useEffect(() => {
    const sync = () => setSaved(readSavedPicture());
    window.addEventListener(CHANGE_EVENT, sync);
    // Another tab changed them.
    const storage = (e: StorageEvent) => (e.key === STYLE_KEY || e.key === BANDS_KEY || e.key === null) && sync();
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", storage);
    };
  }, []);
  const roomStyle = room?.style;
  const roomBands = room?.bands;
  const settings = resolvePicture(saved, roomStyle && roomBands ? { style: roomStyle, bands: roomBands } : null);
  const update = useCallback(
    (next: Partial<PictureSettings>) => {
      const current = readPictureSettings(roomStyle && roomBands ? { style: roomStyle, bands: roomBands } : null);
      writePictureSettings({ ...current, ...next });
    },
    [roomStyle, roomBands],
  );
  const choice = useMemo<PictureChoice>(
    () => ({ saved: saved.style !== undefined || saved.bands !== undefined, reset: clearPictureSettings }),
    [saved.style, saved.bands],
  );
  return [settings, update, choice];
}

/** Whether the viewer asked the system for less motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}
