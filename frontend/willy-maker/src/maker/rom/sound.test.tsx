// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { newProject } from "../model";
import { MUSIC_SCREENS, packSound, QS_RATE, SFX, SOUND_DATA_ADDR, screenSongs } from "./sound";

const u16 = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);

describe("the QSound sound (T-26)", () => {
  it("lays out the driver's data: effects, instruments, note pitches and one song per screen", () => {
    const p = newProject({ title: "Dead Air", players: 2 });
    const s = packSound(p);
    const d = s.data;
    expect([d[0], d[1]]).toEqual([0x51, 0x53]); // "QS"
    expect(d[6]).toBe(Object.keys(SFX).length);
    expect(d[7]).toBe(MUSIC_SCREENS.length);
    // middle C plays at pitch 0x1000, an octave up at 0x2000
    const pitches = u16(d, 12) - SOUND_DATA_ADDR;
    expect(u16(d, pitches + 60 * 2)).toBe(0x1000);
    expect(u16(d, pitches + 72 * 2)).toBe(0x2000);
    // every effect entry lies inside one 64 KB bank of the samples, with sound in it
    const fx = u16(d, 4) - SOUND_DATA_ADDR;
    for (let i = 0; i < d[6]!; i++) {
      const e = fx + i * 12;
      const bank = d[e]!;
      const start = u16(d, e + 2);
      const end = u16(d, e + 4);
      expect(end).toBeGreaterThan(start);
      const at = (bank << 16) + start;
      expect(s.samples.subarray(at + 1, (bank << 16) + end).some((v) => v !== 0)).toBe(true);
    }
    expect(s.stats.songs).toBe(5);
    expect(QS_RATE).toBe(24096);
  });
  it("is the same bytes for the same game, and follows the screens' music slots", () => {
    const p = newProject({ title: "Dead Air", players: 2 });
    expect(packSound(p).data).toEqual(packSound(p).data);
    expect(screenSongs(p)).toEqual(["title", "stage", "clear", "continue", "game-over"]);
    p.settings.menus.title.music = "none";
    const s = packSound(p);
    const songs = u16(s.data, 8) - SOUND_DATA_ADDR;
    expect(u16(s.data, songs)).toBe(0); // no title song: silence
    expect(s.stats.songs).toBe(4);
  });
});
