// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Play inside the editor: the game's real play mode (the engine play mode
// and the ROM share, drawn as the board's 384 × 224 screen) fills the
// canvas area, under a bar with what the keys do and the game's state.
// The options bar's debug chips drive its overlays: the screen frame, the
// collision, the hitboxes, the camera, the FPS and slow motion.

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useStudioText } from "../../i18n";
import { BUILTIN_HERO, type Level, type Project } from "../../model";
import type { GameSnapshot, LevelView } from "../../engine";
import { layoutOf } from "../../board/cps1";
import { heroHeights, playerSlots, runTapMs } from "../../game/settings";
import { menuText } from "../../game/menus";
import { effects, projectSongs, screenSongs } from "../../rom/sound";
import type { TileImage } from "../render";
import { levelArt } from "../levelArt";
import { useUiState } from "./state";

const PlayView = lazy(() => import("../../play").then((m) => ({ default: m.PlayView })));

export function PlayStage({ project: p, level, images, onSnapshot }: { project: Project; level: Level; images: Map<string, TileImage>; onSnapshot?: (s: GameSnapshot) => void }) {
  const t = useStudioText();
  const s = useUiState();
  const [view, setView] = useState<LevelView | null>(null);
  const [snap, setSnap] = useState<GameSnapshot | null>(null);

  // the engine's view of the level, as the game starts (the engine is its own chunk)
  useEffect(() => {
    let live = true;
    void import("../../engine").then((m) => live && setView(m.levelFromProject(level)));
    return () => {
      live = false;
    };
  }, [level]);

  const art = useMemo(() => levelArt(level, images), [level, images]);
  // the game's settings as the play view takes them, made once per change of the game: a new array on
  // every render (each snapshot renders this) would start the game again (PlayView remakes it on a new rule)
  const game = useMemo(
    () => ({
      heights: heroHeights(p),
      variants: playerSlots(p).map((x) => x.variant),
      heroes: playerSlots(p).map((x) => (x.character === BUILTIN_HERO ? null : (p.characters.find((c) => c.id === x.character) ?? null))),
      music: screenSongs(p),
      sound: { effects: effects(p), songs: projectSongs(p) },
      texts: {
        start: menuText(p, "hud", "join"),
        ammo: menuText(p, "hud", "ammo"),
        cleared: menuText(p, "hud", "cleared"),
        rescued: menuText(p, "hud", "rescued"),
        over: menuText(p, "gameOver", "heading"),
        overLine: menuText(p, "gameOver", "line"),
      },
    }),
    [p],
  );
  const embedded = useMemo(
    () => ({
      overlays: { collision: s.debug.collision, hitboxes: s.debug.hitboxes, camera: s.debug.camera, fps: s.debug.fps },
      slow: s.debug.slow,
      onSnapshot: (shot: GameSnapshot) => {
        setSnap(shot);
        onSnapshot?.(shot);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.debug],
  );

  const p1 = snap?.players.find((x) => x.active) ?? snap?.players[0];
  return (
    // the frame and player 1's place, for tests and tools that watch the game run
    <div className="studio-game" data-frame={snap?.frame} data-p1-x={p1?.x} data-outcome={snap?.outcome}>
      <div className="studio-game-bar" aria-live="off">
        <span className="studio-game-badge">{t.playing.badge}</span>
        <span className="studio-ellipsis">{t.playing.help}</span>
        <span className="studio-spacer" />
        {snap && <span className="tabular">{t.playing.hud(p1?.lives ?? 0, p1?.score ?? 0, snap.enemiesLeft, snap.civilians.rescued, snap.civilians.total)}</span>}
      </div>
      <div className="studio-game-area">
        <div className={`studio-game-screen${s.debug.frame ? " has-frame" : ""}`}>
          {view ? (
            <Suspense fallback={<p className="studio-loading">{t.playing.loading}</p>}>
              <PlayView
                embedded={embedded}
                questions={p.quiz}
                level={view}
                players={Math.min(2, p.settings.players)}
                maxPlayers={p.settings.players}
                lives={p.settings.dip.lives}
                rules={p.settings.rules}
                difficulty={p.settings.dip.difficulty}
                heights={game.heights}
                runTapMs={runTapMs(p)}
                combo={layoutOf(p).buttons < 3}
                variants={game.variants}
                heroes={game.heroes}
                art={art}
                characters={p.characters}
                music={game.music}
                sound={game.sound}
                texts={game.texts}
              />
            </Suspense>
          ) : (
            <p className="studio-loading">{t.playing.loading}</p>
          )}
          {s.debug.frame && <span className="studio-game-frame-label">{t.frameLabel}</span>}
          {snap?.outcome === "cleared" && <div className="studio-game-won">{t.playing.cleared}</div>}
        </div>
      </div>
    </div>
  );
}
