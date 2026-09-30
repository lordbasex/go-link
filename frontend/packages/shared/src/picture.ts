// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Picture styles: how a browser draws the game (see docs/web.md, "Picture
// styles"). Each viewer picks their own; the host may give a room a
// default, which the device sends in room_state.picture.

export const PICTURE_STYLES = ["smooth", "sharp", "crt", "edges"] as const;
export const PICTURE_BANDS = ["black", "ambient", "frame"] as const;
export type PictureStyle = (typeof PICTURE_STYLES)[number];
export type PictureBands = (typeof PICTURE_BANDS)[number];

export interface PictureSettings {
  style: PictureStyle;
  bands: PictureBands;
}

export function isPictureStyle(v: unknown): v is PictureStyle {
  return typeof v === "string" && (PICTURE_STYLES as readonly string[]).includes(v);
}

export function isPictureBands(v: unknown): v is PictureBands {
  return typeof v === "string" && (PICTURE_BANDS as readonly string[]).includes(v);
}

/**
 * Reads a room's default picture ({style, bands} from room_state or
 * device_status): null when absent or when either value is unknown.
 */
export function parseRoomPicture(v: unknown): PictureSettings | null {
  if (typeof v !== "object" || v === null) return null;
  const { style, bands } = v as Record<string, unknown>;
  return isPictureStyle(style) && isPictureBands(bands) ? { style, bands } : null;
}

/**
 * The owner's room_action that sets a room's default picture; null
 * clears it (the site's default). id is the device's room id, or "test"
 * for the test pattern room.
 */
export function roomPictureAction(id: string, picture: PictureSettings | null) {
  return { type: "room_action", id, action: "picture", style: picture?.style ?? "", bands: picture?.bands ?? "" } as const;
}
