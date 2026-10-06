// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EditorStore } from "../editor/store";
import { reviewProject } from "../editor/validate";
import { LangProvider } from "../i18n";
import { gameEn } from "../i18n/game.en";
import { cleanSound, newProject, migrateProject, ownSlot, type OwnSong } from "../model";
import { abcToSong } from "../rom/abc";
import { compileSong, effects, packSound, projectSongs, screenSongs, songProblem, SOUND_DATA_MAX, soundDataBytes } from "../rom/sound";
import { CUMPARSITA_ABC, tangoSongs } from "../rom/soundLibrary";
import { applyTangoPack, clearSound, removeSong, screenSlot, setEffect } from "./soundOps";
import { SoundCard } from "./SoundCard";

const song = (line: string, extra: Partial<OwnSong> = {}): OwnSong => ({ id: "s", name: "S", tempo: 31, loop: 0, channels: [{ inst: "bandoneon", pan: 16, line }], ...extra });

describe("a game's own sound", () => {
  it("reads only what it can from a file", () => {
    expect(cleanSound(null)).toBeUndefined();
    const s = cleanSound({
      effects: { shot: { volume: 500, layers: [{ kind: "tone", wave: "laser", from: 1e9, to: 100, seconds: 9, decay: 2 }, { kind: "bogus" }] }, bad: { layers: [] } },
      songs: [{ id: "a", name: "A", tempo: 1000, channels: [{ inst: "violin", pan: 99, line: "c5" }] }, { id: "a", channels: [] }, { id: "bad id!", channels: [] }],
      clear: "own:a",
    })!;
    expect(s.effects!.shot).toEqual({ volume: 100, layers: [{ kind: "tone", wave: "square", from: 12000, to: 100, seconds: 2, decay: 2, noise: 0 }] });
    expect(s.effects!.bad).toBeUndefined();
    expect(s.songs).toEqual([{ id: "a", name: "A", tempo: 120, loop: null, channels: [{ inst: "violin", pan: 32, line: "c5" }] }]);
    expect(s.clear).toBe("own:a");
  });

  it("says what keeps a song from playing", () => {
    expect(songProblem(song("a4 . . - c5 bb3 f#5"))).toBeNull();
    expect(songProblem(song("a4 h9"))).toMatch(/bad note h9/);
    expect(songProblem(song("a4", { channels: [{ inst: "kazoo", pan: 16, line: "a4" }] }))).toMatch(/kazoo/);
    expect(songProblem(song("a4 . . .", { loop: 9 }))).toMatch(/loop row 9/);
    expect(compileSong(song("a4 . - c5")).rows.map((r) => r[0]![0])).toEqual([69, 0, 0xff, 72]);
  });

  it("puts in the tango pack: its songs on every screen and its effects, and takes it out again", () => {
    const p = newProject({ title: "T" });
    const store = new EditorStore(p);
    const before = effects(p).shot.data;
    applyTangoPack(store, "pack");
    const q = store.project;
    expect(screenSlot(q, "title")).toBe(ownSlot("la-cumparsita"));
    expect(screenSlot(q, "clear")).toBe(ownSlot("tango-clear"));
    expect(screenSongs(q)).toEqual(["own:la-cumparsita", "own:tango-stage", "own:tango-clear", "own:tango-continue", "own:tango-over"]);
    expect(effects(q).shot.data).not.toEqual(before);
    expect(Object.keys(projectSongs(q))).toEqual(expect.arrayContaining(["own:la-cumparsita", "own:tango-title", "stage"]));
    // every song of the pack plays, and the music fits the chip with room to spare
    for (const s of tangoSongs()) expect(songProblem(s)).toBeNull();
    expect(soundDataBytes(q)).toBeLessThan(SOUND_DATA_MAX);
    expect(reviewProject(q).checks.find((c) => c.id === "sound.size")?.severity).toBe("ok");
    // a removed song's screen goes back to its built-in tune
    removeSong(store, "tango-stage", "rm");
    expect(screenSlot(store.project, "hud")).toBe("stage");
    setEffect(store, "shot", null, "fx");
    expect(store.project.settings.sound?.effects?.shot).toBeUndefined();
    clearSound(store, "clear");
    expect(store.project.settings.sound).toBeUndefined();
    expect(screenSlot(store.project, "title")).toBe("title");
    store.undo();
    expect(screenSlot(store.project, "title")).toBe(ownSlot("la-cumparsita"));
  });

  it("counts the driver's data as packSound writes it, and survives a save", () => {
    const p = newProject({ title: "T" });
    const store = new EditorStore(p);
    applyTangoPack(store, "pack");
    const q = migrateProject(JSON.parse(JSON.stringify(store.project)));
    expect(soundDataBytes(q)).toBe(packSound(q).data.length);
    expect(packSound(q).stats.songs).toBe(5);
  });

  it("stops Create ROM in the review when a song cannot play or the music does not fit", () => {
    const p = newProject({ title: "T" });
    p.settings.sound = { songs: [song("a4 zz")] };
    expect(reviewProject(p).checks.find((c) => c.id === "sound.song")).toMatchObject({ severity: "error", params: { name: "S" } });
    const long = Array.from({ length: 1100 }, () => "a4").join(" ");
    p.settings.sound = { songs: Array.from({ length: 8 }, (_, k) => ({ ...song(long), id: `s${k}`, channels: Array.from({ length: 8 }, () => ({ inst: "lead", pan: 16, line: long })) })) };
    p.settings.menus.title = { ...p.settings.menus.title, music: ownSlot("s0") };
    expect(reviewProject(p).checks.find((c) => c.id === "sound.size")?.severity).toBe("error");
  });
});

describe("ABC notation", () => {
  it("reads notes, lengths, the key, accidentals in a bar, rests, ties and chords", () => {
    const s = abcToSong("X:1\nT:Test\nM:4/4\nL:1/8\nK:G\n\"G\"G2 F2 ^c2 c2 | z4 A4- | A2 [GB]2 z4 |]", { id: "t" });
    const tune = s.channels[0]!.line.split(" ");
    // L:1/8, so G2 is a quarter: 4 rows. F is F# in G major; ^c holds for the rest of the bar
    expect([0, 4, 8, 12].map((r) => tune[r])).toEqual(["g4", "f#4", "c#5", "c#5"]);
    expect([16, 24, 25].map((r) => tune[r])).toEqual(["-", "a4", "."]);
    // the tie holds A over the bar line; the chord's top note is the tune, its lowest the second voice
    expect(tune.slice(32, 37)).toEqual([".", ".", ".", ".", "b4"]);
    expect(s.channels[1]!.line.split(" ")[36]).toBe("g4");
    // a G chord: bass on the 3-3-2, stabs on the beats
    expect(s.channels[2]!.line.split(" ").slice(0, 13).filter((x) => x !== ".")).toEqual(["g2", "d3", "g3"]);
    expect(s.channels[3]!.line.split(" ").slice(0, 4)).toEqual(["b4", ".", "-", "."]);
  });

  it("plays a pickup once and repeats |: :| parts, three notes of a triplet in the time of two", () => {
    const s = abcToSong("M:4/4\nL:1/8\nK:Am\nE |: \"Am\"A2 B2 (3cBA A2 :| e8 |]", { id: "r", loop: true, tango: false });
    expect(s.loop).toBe(2);
    const tune = s.channels[0]!.line.split(" ");
    expect(tune.length).toBe(2 + 16 * 3);
    expect(tune.slice(2, 18)).toEqual(tune.slice(18, 34));
    expect(tune.slice(10, 14)).toEqual(["c5", "b4", "a4", "."]);
  });

  it("makes La Cumparsita: its three parts, the third repeated, in a minor", () => {
    const s = abcToSong(CUMPARSITA_ABC, { id: "c", loop: true });
    expect(songProblem(s)).toBeNull();
    const rows = compileSong(s).rows.length;
    // the pickup, 48 bars and the "chan-chan" (two hits and a breath)
    expect(rows).toBe(2 + 16 * 48 + 16);
    const bass = s.channels[2]!.line.split(" ");
    expect(bass.slice(-16).filter((x) => x !== "." && x !== "-")).toEqual(["e2", "a2"]);
    // the first part has no second voice: the violin holds E7's third; the bass drags into the Am of bar 3
    expect(s.channels[1]!.line.split(" ")[2]).toBe("g#5");
    expect(bass[2 + 16 + 15]).toBe("g#2");
    expect(s.channels[0]!.line.split(" ").slice(0, 6)).toEqual(["e4", "e4", "e4", ".", "-", "."]);
  });

  it("says when a text has no notes", () => {
    expect(() => abcToSong("X:1\nT:Nothing\nK:C\n", { id: "n" })).toThrow("no notes");
  });
});

describe("the Sound card", () => {
  it("puts in the tango pack, lists its songs and the music of each screen", () => {
    const store = new EditorStore(newProject({ title: "T" }));
    const view = () => (
      <LangProvider value="en">
        <SoundCard store={store} project={store.project} />
      </LangProvider>
    );
    const { rerender } = render(view());
    expect(screen.getByText(gameEn.sound.songsEmpty)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: gameEn.sound.tango }));
    rerender(view());
    expect(screen.getByRole("combobox", { name: gameEn.sound.screens.title })).toHaveValue("own:la-cumparsita");
    expect(screen.getByRole("combobox", { name: gameEn.sound.effects.shot })).toHaveValue("revolver");
    expect(screen.getByText("La Cumparsita", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Sound data: \d+\.\d of 16 KB/);
  });
});
