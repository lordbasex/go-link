// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// One run of the game on a page: loads the characters, builds the stage
// (the copy of the page, split into words and scanned into bodies), runs
// the loop (input, engine, effects, sound, camera, canvas) and puts the page
// back when it ends. The UI reads its state through a small store.

import { frameStyle, loadAtlas, muzzleOf, recolor, type Atlas } from "../assets/atlas";
import { enemyCount, type EnemyKind } from "../engine/enemy";
import { civilianCount } from "../engine/civilian";
import type { CivilianKind } from "../engine/civilian";
import { DestroySound } from "../audio/sound";
import { NO_CONTROLS, type Controls } from "../engine/controls";
import { Game, TIME_LIMIT, type GameEvent, type Stats } from "../engine/game";
import { AIM_ANIM, MUZZLES } from "../engine/player";
import { atomize } from "./atomize";
import { Effects } from "./effects";
import { Input } from "./input";
import { Renderer, readPalette } from "./render";
import { scan } from "./scan";
import { STAGE_Z, buildStage, type Stage } from "./stage";

export type Phase = "loading" | "briefing" | "playing" | "paused" | "complete" | "failed" | "error";

export interface SessionState {
  phase: Phase;
  stats: Stats;
  /** Each person of this run: their kind and whether they are free or rescued. */
  people: { kind: CivilianKind; state: "trapped" | "waiting" | "rescued" }[];
  muted: boolean;
  /** The page changed size while playing: resuming restarts. */
  resized: boolean;
  controller: string | null;
  /** Touch controls are shown (a touch screen). */
  touch: boolean;
  /** How many people and villains this page will have (for the briefing). */
  briefCounts: { people: number; enemies: number };
  /** Why the mission failed. */
  failure: "timeout" | "dead" | null;
}

const EMPTY_STATS: Stats = { time: 0, timeLeft: TIME_LIMIT, progress: 0, enemies: 0, defeated: 0, defeatedByKind: { robot: 0, blonde: 0, alien: 0 }, lives: 4, health: 100, chasing: 0, shots: 0, rockets: 0, rescued: 0, people: 0, byKind: { woman: 0, child: 0, baby: 0, elder: 0 }, destroyed: 0, left: 0 };
/** Empty sky above the page (more on phones, where the HUD takes two rows). */
const skyFor = (width: number) => (width < 700 ? 170 : 120);

export class Session {
  state: SessionState;
  private listeners = new Set<() => void>();
  private stage: Stage | null = null;
  private game: Game | null = null;
  private effects: Effects | null = null;
  private renderer: Renderer | null = null;
  private input: Input;
  readonly sound = new DestroySound();
  private atlases: { player: Atlas; npcs: Atlas; foes: Record<EnemyKind, Atlas[]> } | null = null;
  private raf = 0;
  private last = 0;
  private shakeAmt = 0;
  private scrollY = 0;
  private lastBreakAt = 0;
  private lastCrackAt = 0;
  private lastJetAt = 0;
  private lastAlertAt = 0;
  private hudAt = 0;
  private width = 0;
  private prevPause = false;
  private win: Window;

  constructor(
    private root: HTMLElement,
    private base: string,
    private reduced: boolean,
    private onExit: () => void,
    /** The Lag gang takes part (the game without enemies is the plain rescue). */
    private withEnemies = true,
    /** Text drawn on the canvas (the rest of the words are in the UI). */
    private texts: { help: string } = { help: "HELP!" },
  ) {
    this.win = root.ownerDocument.defaultView!;
    this.input = new Input(this.win);
    this.state = { phase: "loading", stats: EMPTY_STATS, people: [], muted: false, resized: false, controller: null, touch: this.win.matchMedia?.("(pointer: coarse)").matches ?? false, briefCounts: { people: 0, enemies: 0 }, failure: null };
    const h = root.getBoundingClientRect().height;
    this.state.briefCounts = { people: civilianCount(h), enemies: withEnemies ? enemyCount(h) : 0 };
    this.win.addEventListener("resize", this.onResize);
  }

  // The UI's store.
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = (): SessionState => this.state;
  private set(patch: Partial<SessionState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  get touchState() {
    return this.input.touch;
  }

  /** A person's picture for the interface (worried, or happy once rescued). */
  /** A villain's mugshot for the interface. */
  foeStyle(kind: EnemyKind, height: number): Record<string, string> {
    return this.atlases ? frameStyle(this.atlases.foes[kind][0]!, this.base, `idle_0`, height) : { width: `${Math.round(height * 0.6)}px`, height: `${height}px` };
  }

  /** The hero's portrait frame for the briefing. */
  heroStyle(height: number, frame: number): Record<string, string> {
    return this.atlases ? frameStyle(this.atlases.player, this.base, `idle_${frame}`, height) : { width: `${Math.round(height * 0.6)}px`, height: `${height}px` };
  }

  iconStyle(kind: CivilianKind, happy: boolean, height: number): Record<string, string> {
    return this.atlases ? frameStyle(this.atlases.npcs, this.base, `${kind}_${happy ? "happy" : "worried"}_0`, height) : { width: `${Math.round(height * 0.6)}px`, height: `${height}px` };
  }

  /** Loads the characters and shows the briefing, with the alarm. */
  async open(): Promise<void> {
    this.sound.unlock();
    this.sound.alarm(true);
    try {
      const [player, npcs, robot, blonde, alien] = await Promise.all(["player", "npcs", "robot", "blonde", "alien"].map((n) => loadAtlas(this.base, n)));
      // Each villain in four outfits: only the clothes' hue changes.
      const outfits = (a: Atlas, range: [number, number]) => [a, recolor(a, range, 100), recolor(a, range, 190), recolor(a, range, 280)];
      this.atlases = { player: player!, npcs: npcs!, foes: { robot: outfits(robot!, [180, 260]), blonde: outfits(blonde!, [330, 15]), alien: outfits(alien!, [250, 330]) } };
      this.set({ phase: "briefing" });
    } catch {
      this.set({ phase: "error" });
    }
    this.loop(performance.now());
  }

  /** From the briefing: builds the stage and starts the mission. */
  begin(): void {
    if (!this.atlases) return;
    this.teardownStage();
    this.win.scrollTo(0, 0);
    const stage = buildStage(this.root, { sky: skyFor(this.win.innerWidth) });
    atomize(stage.copy);
    const found = scan(stage.copy, { x: this.win.scrollX, y: this.win.scrollY }, { w: this.win.innerWidth, h: this.win.innerHeight });
    // Start on the page's first part, near the left: in the sky above the header.
    const spawn = { x: Math.min(220, stage.width * 0.2), y: stage.origin.y };
    this.game = new Game(found.bodies, { width: stage.width, height: stage.height }, spawn, { density: this.reduced ? 0.35 : 1, enemies: this.withEnemies });
    this.nodes = found.nodes;
    this.stage = stage;
    this.effects = new Effects(stage.layer, this.reduced);
    this.renderer = new Renderer(this.root.ownerDocument, STAGE_Z + 1, this.atlases.player, this.atlases.npcs, readPalette(this.root.ownerDocument.documentElement), this.atlases.foes);
    this.renderer.help = this.texts.help;
    // The bullets leave each aimed pose's real muzzle.
    const heroScale = this.renderer.heroScale();
    for (const aim of ["up45", "up", "down45", "down"] as const) {
      const mz = muzzleOf(this.atlases.player, AIM_ANIM[aim], heroScale);
      if (mz) MUZZLES[aim] = mz;
    }
    this.width = this.win.innerWidth;
    this.scrollY = 0;
    // A short siren burst on the way in, then the action music.
    this.sound.alarm(true, 1.2);
    this.sound.fast = false;
    window.setTimeout(() => this.state.phase === "playing" && this.sound.playMusic(true), 900);
    this.set({ phase: "playing", resized: false, failure: null, stats: this.game.stats(), people: this.people() });
  }

  private nodes: Element[] = [];

  pause(on: boolean): void {
    if (this.state.phase === "playing" && on) {
      this.set({ phase: "paused" });
      this.sound.playMusic(false);
    } else if (this.state.phase === "paused" && !on) {
      if (this.state.resized) return this.begin();
      this.set({ phase: "playing" });
      this.sound.playMusic(true);
      this.last = performance.now();
    }
  }

  setMuted(m: boolean): void {
    this.sound.setMuted(m);
    this.set({ muted: m });
  }

  /** Starts the mission again: a fresh copy of the page, new hiding places. */
  restart(): void {
    this.sound.playMusic(false);
    this.begin();
  }

  /** Puts the hero back on a floor above when he is stuck. */
  unstuck(): void {
    this.game?.unstuck();
  }

  /** After the mission: stay among the ruins. */
  keepPlaying(): void {
    if (this.state.phase === "complete") this.set({ phase: "playing" });
  }

  /** Leaves: the page comes back whole, at once. */
  exit(): void {
    this.win.cancelAnimationFrame(this.raf);
    this.win.removeEventListener("resize", this.onResize);
    this.teardownStage();
    this.input.dispose();
    this.sound.close();
    this.win.scrollTo(0, 0);
    this.onExit();
  }

  /** Debug help: where everyone is and what is left. */
  peek(): unknown {
    const g = this.game;
    if (!g) return null;
    const m = g.player.m;
    return {
      phase: this.state.phase,
      player: { x: m.x, y: m.y, onGround: m.onGround, ground: m.ground, face: g.player.face },
      civilians: g.civilians.map((c) => ({ kind: c.kind, x: c.m.x, y: c.m.y, state: c.state })),
      alive: g.world.alive,
      floor: g.world.floor,
      width: g.world.width,
      pieces: g.world.bodies.filter((b) => b.alive && b.kind !== "backdrop").map((b) => [b.x, b.y, b.w, b.h, b.id, b.kind, b.hp]),
      ray: (() => {
        const h = g.world.raycast(m.x + g.player.face * 6, m.y - 6, 0, 1, 1000);
        return h ? { ...h, body: g.world.bodies[h.id] && { kind: g.world.bodies[h.id]!.kind, x: g.world.bodies[h.id]!.x, y: g.world.bodies[h.id]!.y, w: g.world.bodies[h.id]!.w, h: g.world.bodies[h.id]!.h, hp: g.world.bodies[h.id]!.hp } } : null;
      })(),
      stats: g.stats(),
      // Pieces the game still counts but the page no longer shows (should stay 0).
      invisibleAlive: g.world.bodies.filter((b) => b.alive && b.kind !== "backdrop" && !(this.nodes[b.id] as Element & { checkVisibility?: (o: object) => boolean })?.checkVisibility?.({ opacityProperty: true, visibilityProperty: true })).map((b) => [b.id, b.kind, Math.round(b.x), Math.round(b.y)]),
    };
  }

  /** Debug help: moves the mission clock forward. */
  skipTime(seconds: number): void {
    if (this.game) this.game.time += seconds;
  }

  /** Debug help: controls from a script. */
  drive(c: Partial<Controls> | null): void {
    this.input.drive = c;
  }

  /** Test help (development builds only): everything broken and everyone saved. */
  finish(): void {
    if (!this.game) return;
    this.handle(this.game.finishForTest());
  }

  private teardownStage(): void {
    this.renderer?.dispose();
    this.renderer = null;
    this.stage?.restore();
    this.stage = null;
    this.game = null;
    this.effects = null;
  }

  private onResize = () => {
    this.renderer?.resize();
    if (!this.game || Math.abs(this.win.innerWidth - this.width) < 2) return;
    // The page reflowed: the copy no longer matches. Pause; resuming restarts.
    if (this.state.phase === "playing") this.sound.playMusic(false);
    this.set({ phase: this.state.phase === "complete" ? "complete" : "paused", resized: true });
  };

  private people(): SessionState["people"] {
    return (this.game?.civilians ?? []).map((c) => ({ kind: c.kind, state: c.state === "trapped" ? "trapped" : c.state === "waiting" ? "waiting" : "rescued" }));
  }

  /** A controller's Start (standard mapping button 9) is held. */
  private padStart(): boolean {
    return this.input.padStart;
  }

  private loop = (now: number) => {
    this.raf = this.win.requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, Math.max(0, (now - (this.last || now)) / 1000));
    this.last = now;
    const g = this.game;
    const read = this.input.read();
    const c: Controls = this.state.phase === "playing" || this.state.phase === "complete" ? read : NO_CONTROLS;
    // Esc (or Start) pauses the mission and resumes it; before and after it, Esc leaves.
    if (read.pause && !this.prevPause) {
      if (this.state.phase === "playing") this.pause(true);
      else if (this.state.phase === "paused") this.pause(false);
      // The briefing says "Press start": a controller's Start begins the mission (Esc still leaves).
      else if (this.state.phase === "briefing" && this.padStart()) this.begin();
      else return this.exit();
    }
    this.prevPause = read.pause;
    if (!g || !this.stage) return;
    if (this.state.phase === "playing") this.handle(g.step(dt, c));
    // Out of the page (should never happen): back onto a floor.
    const pm = g.player.m;
    if (!Number.isFinite(pm.x) || !Number.isFinite(pm.y) || pm.y > g.world.floor + 4) g.unstuck();
    // The last minute: the music hurries.
    if (this.state.phase === "playing" && !this.sound.fast && g.stats().timeLeft < 60) {
      this.sound.fast = true;
    }
    else if (this.state.phase === "complete") this.handle(g.step(dt, c).filter((e) => e.type !== "complete"));
    this.effects?.update(dt);
    // Camera: keep the hero a little above the middle of the window.
    const maxY = Math.max(0, this.stage.height + 40 - this.win.innerHeight);
    const target = Math.max(0, Math.min(maxY, g.player.m.y - this.win.innerHeight * 0.58));
    this.scrollY += (target - this.scrollY) * Math.min(1, dt * 7);
    if (Math.abs(this.win.scrollY - this.scrollY) > 0.5) this.win.scrollTo(0, Math.round(this.scrollY));
    // Shake the page and the canvas together.
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 40);
    const sh = this.reduced || this.shakeAmt <= 0 ? { x: 0, y: 0 } : { x: (Math.random() - 0.5) * this.shakeAmt, y: (Math.random() - 0.5) * this.shakeAmt };
    this.stage.layer.style.transform = sh.x || sh.y ? `translate(${sh.x.toFixed(1)}px, ${sh.y.toFixed(1)}px)` : "";
    const near = g.rescuable();
    this.renderer?.draw(g, this.win.scrollX, this.win.scrollY, sh, near ? g.civilians.indexOf(near) : -1, g.time);
    if (now - this.hudAt > 120) {
      this.hudAt = now;
      this.set({ stats: g.stats(), people: this.people(), controller: this.input.padName });
    }
  };

  private handle(events: GameEvent[]): void {
    const g = this.game;
    if (!g || !this.effects) return;
    const now = performance.now();
    for (const e of events) {
      switch (e.type) {
        case "shot":
          this.sound.play("gun", 0.55);
          break;
        case "hit": {
          const r = e.result;
          if (r.kind === "hurt") {
            const b = g.world.bodies[r.id]!;
            const el = this.nodes[r.id];
            if (el && e.weapon === "gun") this.effects.hole(el, b, r.x, r.y);
            if (now - this.lastCrackAt > 50) {
              this.lastCrackAt = now;
              this.sound.play("crack", 0.5);
            }
          } else {
            // The broken part first (its pieces show its insides), then everything on it.
            r.ids.forEach((id, i) => {
              const el = this.nodes[id];
              if (el) this.effects!.shatter(el, g.world.bodies[id]!, i === 0);
            });
            if (e.collapse) {
              this.sound.play("crack", 0.8);
              break;
            }
            const big = r.ids.some((id) => g.world.bodies[id]!.kind !== "word");
            if (big) this.shakeAmt = Math.max(this.shakeAmt, 6);
            if (now - this.lastBreakAt > 45) {
              this.lastBreakAt = now;
              this.sound.play("break", big ? 1 : 0.45);
            }
          }
          break;
        }
        case "launch":
          this.sound.play("launch");
          break;
        case "explode":
          this.sound.play("explode");
          this.shakeAmt = 16;
          break;
        case "swing":
          this.sound.play("knife");
          break;
        case "jump":
          this.sound.play(e.double ? "double" : "jump", 0.6);
          break;
        case "jet":
          if (now - this.lastJetAt > 70) {
            this.lastJetAt = now;
            this.sound.play("jet", 0.7);
          }
          break;
        case "land":
          this.sound.play("thud", 0.6);
          break;
        case "freed":
          this.sound.play("freed");
          break;
        case "rescued":
          this.sound.play("rescue");
          break;
        case "enemyShot":
          this.sound.play("foeShot", 0.7);
          break;
        case "telegraph":
          this.sound.play("warn", 0.5);
          break;
        case "enemyHit":
          if (now - this.lastCrackAt > 50) {
            this.lastCrackAt = now;
            this.sound.play("foeHit", 0.6);
          }
          break;
        case "enraged":
          if (now - this.lastAlertAt > 250) {
            this.lastAlertAt = now;
            this.sound.play("alert");
          }
          break;
        case "enemyDown":
          this.sound.play("foeDown");
          this.shakeAmt = Math.max(this.shakeAmt, 8);
          break;
        case "playerHit":
          this.sound.play("hurt");
          this.shakeAmt = Math.max(this.shakeAmt, 5);
          break;
        case "lifeLost":
          this.sound.play("lifeLost");
          break;
        case "pickup":
          this.sound.play("pickup");
          break;
        case "dead":
        case "timeout":
          this.sound.playMusic(false);
          this.sound.play("timeout");
          this.set({ phase: "failed", failure: g.failure, stats: g.stats(), people: this.people() });
          break;
        case "complete":
          this.sound.playMusic(false);
          this.sound.play("complete");
          this.set({ phase: "complete", stats: g.stats(), people: this.people() });
          break;
      }
    }
  }
}
