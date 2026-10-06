// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The Sound card's changes to a game (settings.sound and the menus' music
// slots), each a command on the editor store: one undo step.

import type { EditorStore } from "../editor/store";
import { ownSlot, ownSongId, type GameSound, type OwnSong, type Project, type SongChannel } from "../model";
import { EFFECT_PRESETS, TANGO_EFFECTS, TANGO_SCREENS, tangoSongs, type EffectPresetId } from "../rom/soundLibrary";

/** The screens whose music the card sets: the four menu screens the engine plays and the level clear. */
export const SOUND_SCREENS = ["title", "hud", "clear", "continue", "gameOver"] as const;
export type SoundScreen = (typeof SOUND_SCREENS)[number];

const menuMusic = (p: Project, screen: Exclude<SoundScreen, "clear">) => (p.settings.menus as unknown as Record<string, { music?: string } | undefined>)[screen];

/** The music slot a screen plays (as screenSongs reads it). */
export function screenSlot(p: Project, screen: SoundScreen): string {
  if (screen === "clear") return p.settings.sound?.clear ?? "clear";
  const d = { title: "title", hud: "stage", continue: "continue", gameOver: "game-over" }[screen];
  return menuMusic(p, screen)?.music ?? d;
}

const sound = (p: Project): GameSound => (p.settings.sound ??= {});

export function setScreenSong(store: EditorStore, screen: SoundScreen, slot: string, label: string): void {
  store.editProject(label, (p) => {
    if (screen === "clear") {
      sound(p).clear = slot;
      return;
    }
    const menus = p.settings.menus as unknown as Record<string, { music?: string }>;
    menus[screen] = { ...(menus[screen] ?? {}), music: slot };
  });
}

/** An effect's own recipe from a preset, or back to the built-in one with null. */
export function setEffect(store: EditorStore, id: string, preset: EffectPresetId | null, label: string): void {
  store.editProject(label, (p) => {
    const effects = { ...(sound(p).effects ?? {}) };
    if (preset) effects[id] = JSON.parse(JSON.stringify(EFFECT_PRESETS[preset]));
    else delete effects[id];
    sound(p).effects = effects;
  });
}

/** The preset an effect's recipe is, or "custom" for one edited by hand, or null for the built-in one. */
export function effectPreset(p: Project, id: string): EffectPresetId | "custom" | null {
  const own = p.settings.sound?.effects?.[id];
  if (!own) return null;
  const json = JSON.stringify(own);
  return (Object.keys(EFFECT_PRESETS) as EffectPresetId[]).find((k) => JSON.stringify(EFFECT_PRESETS[k]) === json) ?? "custom";
}

/** The tango pack: its songs (replacing ones with the same id), its effects and its music on every screen. */
export function applyTangoPack(store: EditorStore, label: string): void {
  store.editProject(label, (p) => {
    const s = sound(p);
    const pack = tangoSongs();
    s.songs = [...(s.songs ?? []).filter((x) => !pack.some((y) => y.id === x.id)), ...pack];
    const effects = { ...(s.effects ?? {}) };
    for (const [id, preset] of Object.entries(TANGO_EFFECTS)) effects[id] = JSON.parse(JSON.stringify(EFFECT_PRESETS[preset]));
    s.effects = effects;
    s.clear = ownSlot(TANGO_SCREENS.clear);
    const menus = p.settings.menus as unknown as Record<string, { music?: string }>;
    for (const screen of ["title", "hud", "continue", "gameOver"] as const) menus[screen] = { ...(menus[screen] ?? {}), music: ownSlot(TANGO_SCREENS[screen]) };
  });
}

/** A new song of one silent channel, with an id no other song has. */
export function addSong(store: EditorStore, name: string, label: string): string {
  let id = "";
  store.editProject(label, (p) => {
    const songs = sound(p).songs ?? [];
    let n = songs.length + 1;
    while (songs.some((s) => s.id === `song-${n}`)) n++;
    id = `song-${n}`;
    sound(p).songs = [...songs, { id, name, tempo: 31, loop: 0, channels: [{ inst: "lead", pan: 16, line: "c5 . e5 . g5 . . . - . . . . . . ." }] }];
  });
  return id;
}

/** Typing in one field of a song is one undo step (its `merge` key). */
export function patchSong(store: EditorStore, id: string, patch: Partial<Omit<OwnSong, "id" | "channels">>, label: string): void {
  store.editProject(
    label,
    (p) => {
      sound(p).songs = (sound(p).songs ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s));
    },
    `song:${id}:${Object.keys(patch).join()}`,
  );
}

export function patchChannel(store: EditorStore, id: string, k: number, patch: Partial<SongChannel> | null, label: string): void {
  // typing notes in one channel is one undo step; adding or removing a channel is its own
  const merge = patch && Object.keys(patch).length === 1 && k >= 0 ? `channel:${id}:${k}:${Object.keys(patch)[0]}` : undefined;
  store.editProject(label, (p) => {
    sound(p).songs = (sound(p).songs ?? []).map((s) => {
      if (s.id !== id) return s;
      const channels = [...s.channels];
      if (patch === null) channels.splice(k, 1);
      else if (k >= channels.length) channels.push({ inst: "lead", pan: 16, line: ".", ...patch });
      else channels[k] = { ...channels[k]!, ...patch };
      return { ...s, channels };
    });
  }, merge);
}

/** Adds a song made elsewhere (an ABC tune), with an id no other song has. */
export function addOwnSong(store: EditorStore, song: OwnSong, label: string): string {
  let id = song.id;
  store.editProject(label, (p) => {
    const songs = sound(p).songs ?? [];
    let n = 2;
    while (songs.some((s) => s.id === id)) id = `${song.id}-${n++}`;
    sound(p).songs = [...songs, { ...song, id }];
  });
  return id;
}

/** Deletes a song; the screens that played it go back to their built-in tune. */
export function removeSong(store: EditorStore, id: string, label: string): void {
  store.editProject(label, (p) => {
    const s = sound(p);
    s.songs = (s.songs ?? []).filter((x) => x.id !== id);
    if (ownSongId(s.clear) === id) delete s.clear;
    const menus = p.settings.menus as unknown as Record<string, { music?: string }>;
    for (const screen of Object.keys(menus)) if (ownSongId(menus[screen]?.music) === id) menus[screen] = { ...menus[screen], music: undefined };
  });
}

/** Back to the built-in effects and music everywhere. */
export function clearSound(store: EditorStore, label: string): void {
  store.editProject(label, (p) => {
    const songs = new Set((p.settings.sound?.songs ?? []).map((s) => s.id));
    delete p.settings.sound;
    const menus = p.settings.menus as unknown as Record<string, { music?: string }>;
    for (const screen of Object.keys(menus)) {
      const id = ownSongId(menus[screen]?.music);
      if (id && songs.has(id)) menus[screen] = { ...menus[screen], music: undefined };
    }
  });
}
