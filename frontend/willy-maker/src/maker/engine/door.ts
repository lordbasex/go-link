// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The exit's door, drawn the same in play mode and in the ROM, so players
// always see where the level ends (experiment 1's verdict, T-05: two of
// three ROMs had an invisible exit). It stands on the exit's floor, in the
// middle of the exit zone, and is only drawn over empty cells.

export const DOOR_W = 32;
export const DOOR_H = 48;

/** The door's parts: what each pixel is. */
export const DoorPart = { None: 0, Frame: 1, Inside: 2, Lamp: 3, Handle: 4 } as const;
export type DoorPartValue = (typeof DoorPart)[keyof typeof DoorPart];

/** The door as rows of parts, DOOR_W x DOOR_H, the bottom row on the floor. */
export function doorParts(): DoorPartValue[][] {
  const rows: DoorPartValue[][] = [];
  for (let y = 0; y < DOOR_H; y++) {
    const row: DoorPartValue[] = [];
    for (let x = 0; x < DOOR_W; x++) {
      let v: DoorPartValue = DoorPart.None;
      // the green exit lamp above the door
      if (y < 5 && x >= 10 && x < 22) v = y === 0 || y === 4 || x === 10 || x === 21 ? DoorPart.Frame : DoorPart.Lamp;
      // the frame and the dark doorway
      else if (y >= 7) {
        if (x < 3 || x >= DOOR_W - 3 || y < 10) v = DoorPart.Frame;
        else v = DoorPart.Inside;
        if (v === DoorPart.Inside && x >= 21 && x < 24 && y >= 28 && y < 31) v = DoorPart.Handle;
      }
      row.push(v);
    }
    rows.push(row);
  }
  return rows;
}

/** Where the door goes for an exit zone: its left x and its top y (world px), on the 16 px grid the ROM's tiles use. */
export function doorAt(exit: { x: number; y: number; w: number }): { x: number; y: number } {
  return { x: Math.round((exit.x + (exit.w - DOOR_W) / 2) / 16) * 16, y: Math.floor(exit.y / 16) * 16 - DOOR_H };
}
