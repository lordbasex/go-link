// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The Game tab's Sound card: the tango pack in one click, each effect from
// a preset (or built in), the music of each screen, and the game's own
// songs in the tracker form the QSound driver plays (rom/sound.ts), each
// heard right here with play mode's own player.

import { useEffect, useMemo, useState } from "react";
import type { EditorStore } from "../editor/store";
import { ownSlot, type OwnSong, type Project } from "../model";
import { PlayAudio } from "../play/audio";
import { compileSong, effects, INSTRUMENT_IDS, projectSongs, SFX, songProblem, SOUND_DATA_MAX, soundDataBytes, type SfxId } from "../rom/sound";
import { EFFECT_PRESETS, type EffectPresetId } from "../rom/soundLibrary";
import { abcToSong } from "../rom/abc";
import { Capsule } from "../ui/atoms";
import { MUSIC_SLOTS } from "./menus";
import { addOwnSong, addSong, applyTangoPack, clearSound, effectPreset, patchChannel, patchSong, removeSong, screenSlot, setEffect, setScreenSong, SOUND_SCREENS } from "./soundOps";
import { useGameText, useMenusText } from "./texts";

const PRESETS = Object.keys(EFFECT_PRESETS) as EffectPresetId[];
const EFFECT_IDS = (Object.keys(SFX) as SfxId[]).sort((a, b) => SFX[a] - SFX[b]);

export function SoundCard({ store, project }: { store: EditorStore; project: Project }) {
  const t = useGameText().sound;
  const m = useMenusText();
  const audio = useMemo(() => new PlayAudio(), []);
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => () => audio.close(), [audio]);
  // the player always has the game's sound as it is now
  useEffect(() => audio.setSound({ effects: effects(project), songs: projectSongs(project) }), [audio, project]);
  const songs = project.settings.sound?.songs ?? [];
  const bytes = useMemo(() => soundDataBytes(project), [project]);

  const listen = (slot: string) => {
    audio.unlock();
    if (playing === slot) {
      audio.music(null);
      setPlaying(null);
      return;
    }
    audio.music(slot);
    setPlaying(slot);
    const song = projectSongs(project)[slot];
    // a song that plays once stops the button when it ends
    if (song && song.loop === null) {
      const ms = (song.rows.length * song.tempo * 1000) / 250 + 500;
      setTimeout(() => setPlaying((p) => (p === slot ? null : p)), ms);
    }
  };
  const hear = (id: SfxId) => {
    audio.unlock();
    // the first unlock makes the samples a moment later
    setTimeout(() => audio.effect(id), 30);
  };
  const slotName = (slot: string) => {
    const own = songs.find((s) => ownSlot(s.id) === slot);
    if (own) return own.name;
    if (slot === "clear") return t.clearFanfare;
    return (m.musicSlots as Record<string, string>)[slot] ?? slot;
  };

  return (
    <section className="wm-game-card wm-card" aria-labelledby="wm-sound-title">
      <h2 id="wm-sound-title" className="wm-h is-accent">
        {t.title}
      </h2>
      <p className="wm-dim wm-small">{t.help}</p>
      <div className="wm-row is-wrap">
        <Capsule tone="primary" size="sm" onClick={() => applyTangoPack(store, t.undo.pack)}>
          {t.tango}
        </Capsule>
        {project.settings.sound && (
          <Capsule size="sm" onClick={() => clearSound(store, t.undo.builtIn)}>
            {t.builtIn}
          </Capsule>
        )}
      </div>
      <p className="wm-dim wm-small">{t.tangoHelp}</p>

      <h3 className="wm-h">{t.screensTitle}</h3>
      <ul className="wm-game-binds">
        {SOUND_SCREENS.map((screen) => {
          const slot = screenSlot(project, screen);
          const options = [...MUSIC_SLOTS, ...(screen === "clear" ? ["clear"] : []), ...songs.map((s) => ownSlot(s.id))];
          return (
            <li key={screen}>
              <span className="wm-game-bind-name">{t.screens[screen]}</span>
              <select className="wm-input is-sm" aria-label={t.screens[screen]} value={slot} onChange={(e) => setScreenSong(store, screen, e.target.value, t.undo.screen)}>
                {options.map((o) => (
                  <option key={o} value={o}>
                    {slotName(o)}
                  </option>
                ))}
              </select>
              <Capsule size="sm" disabled={slot === "none"} aria-label={playing === slot ? t.stop : t.play(slotName(slot))} onClick={() => listen(slot)}>
                {playing === slot ? "■" : "▶"}
              </Capsule>
            </li>
          );
        })}
      </ul>

      <h3 className="wm-h">{t.effectsTitle}</h3>
      <ul className="wm-game-binds">
        {EFFECT_IDS.map((id) => {
          const preset = effectPreset(project, id);
          return (
            <li key={id}>
              <span className="wm-game-bind-name">{t.effects[id]}</span>
              <select className="wm-input is-sm" aria-label={t.effects[id]} value={preset ?? ""} onChange={(e) => setEffect(store, id, (e.target.value || null) as EffectPresetId | null, t.undo.effect)}>
                <option value="">{t.builtInEffect}</option>
                {preset === "custom" && <option value="custom">{t.custom}</option>}
                {PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {t.presets[p as keyof typeof t.presets] ?? p}
                  </option>
                ))}
              </select>
              <Capsule size="sm" aria-label={t.play(t.effects[id])} onClick={() => hear(id)}>
                ▶
              </Capsule>
            </li>
          );
        })}
      </ul>

      <h3 className="wm-h">{t.songsTitle}</h3>
      {!songs.length && <p className="wm-dim">{t.songsEmpty}</p>}
      {songs.map((song) => (
        <SongEditor key={song.id} store={store} song={song} playing={playing === ownSlot(song.id)} onListen={() => listen(ownSlot(song.id))} />
      ))}
      <div className="wm-row">
        <Capsule size="sm" onClick={() => addSong(store, t.newSongName, t.undo.song)}>
          {t.addSong}
        </Capsule>
      </div>
      <AbcImport onSong={(abc) => {
        const title = /^T:\s*(.+)$/m.exec(abc)?.[1]?.trim() || t.newSongName;
        const id = title.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "abc";
        addOwnSong(store, abcToSong(abc, { id, name: title.slice(0, 40), loop: true }), t.undo.song);
      }} />
      <p className={`wm-small ${bytes > SOUND_DATA_MAX ? "wm-bad" : "wm-dim"}`} role="status">
        {t.size((bytes / 1024).toFixed(1), String(SOUND_DATA_MAX / 1024))}
        {bytes > SOUND_DATA_MAX ? ` ${t.tooBig}` : ""}
      </p>
    </section>
  );
}

function AbcImport({ onSong }: { onSong: (abc: string) => void }) {
  const t = useGameText().sound;
  const [text, setText] = useState("");
  const [failed, setFailed] = useState(false);
  return (
    <details className="wm-sound-song">
      <summary>{t.abcTitle}</summary>
      <div className="wm-game-stack">
        <p className="wm-dim wm-small">{t.abcHelp}</p>
        <textarea className="wm-input wm-mono wm-sound-notes" rows={6} aria-label={t.abcLabel} value={text} onChange={(e) => (setText(e.target.value), setFailed(false))} />
        {failed && (
          <p className="wm-bad wm-small" role="alert">
            {t.abcFailed}
          </p>
        )}
        <div className="wm-row">
          <Capsule
            size="sm"
            disabled={!text.trim()}
            onClick={() => {
              try {
                onSong(text);
                setText("");
              } catch {
                setFailed(true);
              }
            }}
          >
            {t.abcAdd}
          </Capsule>
        </div>
      </div>
    </details>
  );
}

function SongEditor({ store, song, playing, onListen }: { store: EditorStore; song: OwnSong; playing: boolean; onListen: () => void }) {
  const t = useGameText().sound;
  const problem = songProblem(song);
  const rows = problem ? 0 : compileSong(song).rows.length;
  return (
    <details className="wm-sound-song" open={!!problem}>
      <summary>
        <strong>{song.name}</strong> <span className="wm-dim wm-small">{problem ? "!" : t.rows(rows)}</span>
      </summary>
      <div className="wm-game-stack">
        <div className="wm-row is-wrap">
          <label className="wm-field">
            <span className="wm-field-label">{t.name}</span>
            <input className="wm-input is-sm" value={song.name} maxLength={40} onChange={(e) => patchSong(store, song.id, { name: e.target.value }, t.undo.song)} />
          </label>
          <label className="wm-field" title={t.tempoHelp}>
            <span className="wm-field-label">{t.tempo}</span>
            <input className="wm-input is-sm" type="number" min={4} max={120} value={song.tempo} onChange={(e) => Number(e.target.value) >= 4 && patchSong(store, song.id, { tempo: Math.min(120, Math.round(Number(e.target.value))) }, t.undo.song)} />
          </label>
          <label className="wm-field">
            <span className="wm-field-label">{t.loop}</span>
            <input
              className="wm-input is-sm"
              type="number"
              min={0}
              placeholder={t.once}
              value={song.loop ?? ""}
              onChange={(e) => patchSong(store, song.id, { loop: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))) }, t.undo.song)}
            />
          </label>
          <Capsule size="sm" disabled={!!problem} aria-label={playing ? t.stop : t.play(song.name)} onClick={onListen}>
            {playing ? "■" : "▶"}
          </Capsule>
        </div>
        {song.channels.map((c, k) => (
          <fieldset key={k} className="wm-sound-channel">
            <legend className="wm-small">{t.channel(k + 1)}</legend>
            <div className="wm-row is-wrap">
              <select className="wm-input is-sm" aria-label={`${t.channel(k + 1)}: ${t.instrument}`} value={c.inst} onChange={(e) => patchChannel(store, song.id, k, { inst: e.target.value }, t.undo.channel)}>
                {INSTRUMENT_IDS.map((i) => (
                  <option key={i} value={i}>
                    {t.instruments[i]}
                  </option>
                ))}
              </select>
              <input className="wm-input is-sm wm-sound-pan" type="number" min={0} max={32} aria-label={`${t.channel(k + 1)}: ${t.pan}`} title={t.pan} value={c.pan} onChange={(e) => patchChannel(store, song.id, k, { pan: Math.max(0, Math.min(32, Math.round(Number(e.target.value) || 0))) }, t.undo.channel)} />
              <Capsule size="sm" onClick={() => patchChannel(store, song.id, k, null, t.undo.channel)}>
                {t.removeChannel}
              </Capsule>
            </div>
            <textarea className="wm-input wm-mono wm-sound-notes" rows={3} aria-label={`${t.channel(k + 1)}: ${t.notes}`} title={t.notesHelp} value={c.line} onChange={(e) => patchChannel(store, song.id, k, { line: e.target.value }, t.undo.channel)} />
          </fieldset>
        ))}
        <p className="wm-dim wm-small">{t.notesHelp}</p>
        {problem && (
          <p className="wm-bad wm-small" role="alert">
            {t.problem(problem)}
          </p>
        )}
        <div className="wm-row is-wrap">
          <Capsule size="sm" disabled={song.channels.length >= 8} onClick={() => patchChannel(store, song.id, song.channels.length, {}, t.undo.channel)}>
            {t.addChannel}
          </Capsule>
          <Capsule size="sm" tone="danger" onClick={() => removeSong(store, song.id, t.undo.song)}>
            {t.removeSong}
          </Capsule>
        </div>
      </div>
    </details>
  );
}
