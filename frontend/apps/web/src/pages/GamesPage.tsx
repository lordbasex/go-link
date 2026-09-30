// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { t } from "../i18n";
import { GamepadIcon, MusicIcon, SoundOffIcon, SoundOnIcon } from "../components/Icons";
import { HeroTile, PageHero } from "../components/ui/PageHero";
import { GAMES, GAME_IDS, type GameId } from "../games";
import { addKeys, addPad, addTouch, emptyInput, emptyTouch, nextFrame, type FrameInput } from "../games/input";
import { readPalette } from "../games/palette";
import { BOARD_H, BOARD_W, type Hud } from "../games/types";
import { identify } from "../controllers/controllerModels";
import { ChipSound } from "../games/sound";
import { setSfxSink, type SfxAt, type SfxEvent } from "../games/sfx";
import { BoardFx } from "../games/fx";
import { GameTouchPad } from "../components/GameTouchPad";
import { MAX_SPEED, type RacerState } from "../games/racer";

/**
 * /tools/games: six short games that test a controller while you play.
 * Each game's rules live in src/games (no DOM); this page reads the
 * controllers and the keyboard, runs the chosen game on a canvas and shows
 * its score and measurements. Nothing is stored: the best score only lives
 * while the page is open.
 */

/** The best score of each game, in memory only. */
const best = new Map<GameId, number>();

/** The games' sound chip, shared by every game while the page is open (its switches are not stored). */
const chip = new ChipSound();

const isGame = (v: string | null): v is GameId => !!v && (GAME_IDS as readonly string[]).includes(v);

export function GamesPage() {
  const [params, setParams] = useSearchParams();
  const g = params.get("g");
  const id = isGame(g) ? g : null;
  return (
    <div className="page page-frame games-page">
      <PageHero
        tile={
          <HeroTile>
            <GamepadIcon size={30} />
          </HeroTile>
        }
        eyebrow={t.games.eyebrow}
        title={id ? t.games.list[id].title : t.games.title}
        subtitle={id ? t.games.list[id].how : t.games.intro}
        actions={
          id ? (
            <button type="button" className="button button-secondary" onClick={() => setParams({})}>
              ← {t.games.back}
            </button>
          ) : (
            <Link to="/tools" className="button button-secondary">
              ← {t.tools.title}
            </Link>
          )
        }
      />
      <div className={`page-body${id ? " game-page-body" : ""}`}>
        {id ? (
          <>
            <GameStage key={id} id={id} />
            <GameRules id={id} />
          </>
        ) : (
          <GamePicker
            onPick={(g) => {
              chip.unlock();
              setParams({ g });
            }}
          />
        )}
      </div>
    </div>
  );
}

function GamePicker({ onPick }: { onPick: (id: GameId) => void }) {
  return (
    <ul className="games-grid">
      {GAME_IDS.map((id, i) => {
        const info = t.games.list[id];
        return (
          <li key={id}>
            <button type="button" className="card game-card" onClick={() => onPick(id)}>
              <span className="game-card-head">
                <span className="game-card-num">{i + 1}</span>
                <span className="game-card-name">
                  <strong>{info.title}</strong>
                  <span className="small muted">{info.uses}</span>
                </span>
                <span className="game-card-chip mono">{info.measure}</span>
              </span>
              <GameThumb id={id} />
              <span className="game-card-foot">
                <span className="small muted">{info.how}</span>
                <span className="button button-primary button-compact">{t.games.play}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Sizes a canvas to its box and the screen's pixels, drawing the board scaled with square pixels. */
function fitCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(BOARD_W, Math.round(canvas.clientWidth * dpr));
  const h = Math.round((w * BOARD_H) / BOARD_W);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(w / BOARD_W, 0, 0, h / BOARD_H, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** A game's first screen, drawn once as its card's picture. */
function GameThumb({ id }: { id: GameId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const ctx = fitCanvas(canvas);
      if (!ctx) return;
      const game = GAMES[id];
      const s = game.create(7);
      // A few frames in, so the picture shows the game moving.
      const inp = emptyInput();
      let now = 0;
      for (let i = 0; i < 40; i++) game.step(s, nextFrame(inp, inp, (now += 16), now - 16));
      game.draw(ctx, s, readPalette(canvas), now);
    };
    draw();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(draw);
    ro?.observe(canvas);
    return () => ro?.disconnect();
  }, [id]);
  return (
    <span className="game-screen stage-tokens" aria-hidden="true">
      <canvas ref={ref} />
    </span>
  );
}

const PLAY_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter", "KeyZ", "KeyX", "KeyA", "KeyS", "KeyQ", "KeyW", "KeyE", "KeyR"]);

function GameStage({ id }: { id: GameId }) {
  const game = GAMES[id];
  const info = t.games.list[id];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** The on-screen pad's state, read by the game loop like the keyboard. */
  const touch = useRef(emptyTouch());
  const swipe = useRef<{ x: number; y: number } | null>(null);
  /** The board's effects handler, set by the game loop (it knows the colors). */
  const onFx = useRef<((e: SfxEvent, at?: SfxAt) => void) | null>(null);
  // Phones and tablets get the touch pad; any touch on a hybrid screen shows it too.
  const [touchPad, setTouchPad] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches);
  useEffect(() => {
    if (touchPad) return;
    const seen = (e: PointerEvent) => e.pointerType === "touch" && setTouchPad(true);
    window.addEventListener("pointerdown", seen);
    return () => window.removeEventListener("pointerdown", seen);
  }, [touchPad]);
  const [hud, setHud] = useState<Hud>(() => game.hud(game.create(1)));
  const [pad, setPad] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [muted, setMuted] = useState(chip.muted);
  const [music, setMusic] = useState(chip.musicOn);
  const [audible, setAudible] = useState(chip.ready);

  // Sound: this game's music and effects; the browser only lets audio start
  // after a click or a key, so any of them unlocks it.
  useEffect(() => {
    setSfxSink((e, at) => {
      chip.fx(e);
      onFx.current?.(e, at);
    });
    chip.play(id);
    const unlock = () => {
      chip.unlock();
      window.setTimeout(() => setAudible(chip.ready), 50);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      setSfxSink(null);
      chip.play(null);
      chip.engineAt(null);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const keys = new Set<string>();
    // A tap shorter than a frame still counts: a key let go before any
    // frame saw it stays held for that one frame.
    const unseen = new Set<string>();
    const released = new Set<string>();
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey || !PLAY_KEYS.has(e.code)) return;
      e.preventDefault();
      if (!keys.has(e.code)) unseen.add(e.code);
      keys.add(e.code);
    };
    const up = (e: KeyboardEvent) => {
      if (unseen.has(e.code)) released.add(e.code);
      else keys.delete(e.code);
    };
    const blur = () => {
      keys.clear();
      unseen.clear();
      released.clear();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);

    let state = game.create(Math.floor(Math.random() * 1e9));
    let prev: FrameInput | null = null;
    let last: number | null = null;
    let lastHud = 0;
    let padName: string | null = null;
    let pal = readPalette(canvas);
    const reduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const fx = new BoardFx(reduced);
    onFx.current = (e, at) => fx.on(e, at, pal, performance.now());
    let ctx = fitCanvas(canvas);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => (ctx = fitCanvas(canvas)));
    ro?.observe(canvas);
    const theme = new MutationObserver(() => (pal = readPalette(canvas)));
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    let raf = 0;
    const loop = (now: number) => {
      const input = emptyInput();
      let name: string | null = null;
      for (const gp of navigator.getGamepads?.() ?? []) {
        if (!gp || !gp.connected) continue;
        addPad(input, gp);
        name ??= identify(gp.id).modelName || gp.id;
      }
      addKeys(input, keys);
      addTouch(input, touch.current);
      unseen.clear();
      for (const k of released) keys.delete(k);
      released.clear();
      const f = nextFrame(prev, input, now, last);
      prev = input;
      last = now;
      const h = game.hud(state);
      if (h.over && f.pressed.has("start")) state = game.create(Math.floor(Math.random() * 1e9));
      else if (!document.hidden) game.step(state, f);
      if (ctx) {
        // A shake moves the whole board; its uncovered edge stays the board's color.
        const [dx, dy] = fx.offset(now);
        if (dx || dy) {
          ctx.fillStyle = pal.bg;
          ctx.fillRect(0, 0, BOARD_W, BOARD_H);
          ctx.save();
          ctx.translate(dx, dy);
        }
        game.draw(ctx, state, pal, now);
        if (dx || dy) ctx.restore();
        fx.draw(ctx, pal, now);
      }
      if (id === "racer") {
        const r = state as RacerState;
        chip.engineAt(r.done ? 0 : r.speed / MAX_SPEED);
      }
      if (now - lastHud > 100 || name !== padName) {
        lastHud = now;
        const nh = game.hud(state);
        if (nh.score > (best.get(id) ?? 0)) best.set(id, nh.score);
        setHud(nh);
        if (name !== padName) {
          padName = name;
          setPad(name);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      theme.disconnect();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      onFx.current = null;
    };
  }, [game, id, round]);

  const flash = hud.flash && performance.now() - hud.flash.at < 1200 ? hud.flash : null;
  return (
    <div className={`game-stage${touchPad ? " has-touch" : ""}`}>
      <div className="game-bar">
        <span className="game-score">
          <span className="small muted">{t.games.score}</span> <strong className="mono">{hud.score}</strong>
        </span>
        <span className="game-score">
          <span className="small muted">{t.games.best}</span> <strong className="mono">{best.get(id) ?? 0}</strong>
        </span>
        <span className="game-card-chip mono" title={t.games.measures}>
          {info.measure}
        </span>
        <span className="game-bar-spacer" />
        {!audible && !muted && <span className="small muted game-sound-hint">{t.games.soundHint}</span>}
        <button
          type="button"
          className={`icon-button${music && !muted ? " is-on" : ""}`}
          aria-pressed={music}
          aria-label={t.games.music}
          data-tip={music ? t.games.musicOff : t.games.musicOn}
          onClick={() => {
            chip.setMusic(!music);
            setMusic(!music);
          }}
        >
          <MusicIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-pressed={!muted}
          aria-label={t.games.sound}
          data-tip={muted ? t.games.soundOn : t.games.soundOff}
          onClick={() => {
            chip.unlock();
            chip.setMuted(!muted);
            setMuted(!muted);
            window.setTimeout(() => setAudible(chip.ready), 50);
          }}
        >
          {muted ? <SoundOffIcon /> : <SoundOnIcon />}
        </button>
        <button type="button" className="button button-secondary button-compact" onClick={() => setRound((r) => r + 1)}>
          {t.games.restart}
        </button>
      </div>
      {hud.move && (
        <p className="game-move">
          {t.games.doMove(t.games.moves[hud.move])} <span className="mono">{hud.motion}</span>
        </p>
      )}
      <div
        className="game-screen is-big stage-tokens"
        onPointerDown={(e) => {
          if (e.pointerType !== "touch") return;
          swipe.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          // A swipe on the board turns the snake (a direction for one frame).
          const from = swipe.current;
          swipe.current = null;
          if (!from || id !== "snake") return;
          const dx = e.clientX - from.x;
          const dy = e.clientY - from.y;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
          touch.current.tappedDirs.add(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
        }}
      >
        <canvas ref={canvasRef} role="img" aria-label={t.games.board(info.title)} />
        {hud.over && (
          <div className="game-overlay" role="status">
            <strong>{t.games.over}</strong>
            <span>{t.games.again}</span>
          </div>
        )}
        {hud.cleared && (
          <div className="game-overlay is-quiet" role="status">
            <strong>{t.games.cleared}</strong>
          </div>
        )}
        {hud.launch && <div className="game-hint">{t.games.launch}</div>}
        {hud.ready && <div className="game-hint">{t.games.ready}</div>}
        {flash && (
          <div key={flash.at} className={`game-flash is-${flash.kind}`} role="status">
            {t.games.flash[flash.kind]}
            {flash.ms !== null && flash.kind !== "miss" ? ` ${flash.ms} ms` : ""}
          </div>
        )}
      </div>
      {touchPad && <GameTouchPad id={id} touch={touch.current} />}
      {hud.drift != null && (
        <p className="game-notice" role="status">
          {t.games.drift(hud.drift.toFixed(2))}
        </p>
      )}
      <dl className="game-stats">
        {hud.stats.map((s) => (
          <div key={s.key}>
            <dt>{t.games.stats[s.key]}</dt>
            <dd className="mono">{s.value}</dd>
          </div>
        ))}
      </dl>
      <p className="small muted">{pad ? t.games.padOn(pad) : t.games.noPad}</p>
      {!touchPad && <p className="small muted">{t.games.keys}</p>}
    </div>
  );
}

/** The chosen game's rules beside the board: goal, controls, points and what the result says about the controller. */
function GameRules({ id }: { id: GameId }) {
  const r = t.games.rules;
  const g = r.games[id];
  return (
    <aside className="card game-rules" aria-labelledby="game-rules-title">
      <h2 id="game-rules-title" className="card-title">
        {r.title}
      </h2>
      <section>
        <h3>{r.goal}</h3>
        <p>{g.goal}</p>
      </section>
      <section className="game-rules-controls">
        <h3>{r.controls}</h3>
        <table className="game-rules-keys">
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">{r.controls}</span>
              </th>
              <th scope="col">{r.pad}</th>
              <th scope="col">{r.keys}</th>
            </tr>
          </thead>
          <tbody>
            {g.controls.map(([what, padKey, key]) => (
              <tr key={what}>
                <th scope="row">{what}</th>
                <td>{padKey}</td>
                <td className="mono">{key}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="game-rules-touch">{g.touch}</p>
        <p className="small muted">{r.buttonsNote}</p>
      </section>
      <section>
        <h3>{r.points}</h3>
        <p>{g.points}</p>
      </section>
      <section className="game-rules-tells">
        <h3>{r.tells}</h3>
        <p>{g.tells}</p>
      </section>
    </aside>
  );
}
