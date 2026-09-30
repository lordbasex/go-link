// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

/** Every text the game shows. The host app passes them in its language. */
export interface DestroyMessages {
  /** The devil button's name and tooltip. */
  devil: string;
  alert: string;
  mission: string;
  /** The hero's name (a proper noun, the same in every language). */
  hero: string;
  /** The villains' names and what the gang is called. */
  gang: { name: string; robot: string; blonde: string; alien: string };
  /** The story: `n` people to rescue in `minutes` minutes; `danger` adds the gang's warning. */
  briefing: (n: number, minutes: number, danger: boolean) => string;
  toRescue: (n: number) => string;
  wanted: string;
  start: string;
  notNow: string;
  loading: string;
  error: string;
  pressStart: string;
  people: { woman: string; child: string; baby: string; elder: string };
  controls: {
    title: string;
    action: string;
    pad: string;
    keys: string;
    rows: readonly (readonly string[])[];
  };
  /** The adaptive controls help (briefing and pause): a tab per input. */
  guide: {
    tabs: { pad: string; keys: string; touch: string };
    /** Shown until the browser lists a controller. */
    noPad: string;
    /** The recognized controller, e.g. "DualSense". */
    detected: (name: string) => string;
    tryIt: string;
    /** In the controller legend. */
    stick: string;
    inAir: string;
    hold: string;
    near: string;
    fullTilt: string;
    aim: string;
    /** One short name per action. */
    actions: { move: string; run: string; jump: string; jet: string; drop: string; kick: string; gun: string; knife: string; bazooka: string; rescue: string; pause: string };
    /** The touch pad's help: [action, what to touch]. */
    touchRows: readonly (readonly string[])[];
  };
  /** What people call out while they wait (short: it sits in a bubble). */
  help: string;
  hud: {
    label: string;
    rescued: (n: number, total: number) => string;
    destroyed: string;
    /** The countdown's label. */
    missionTime: string;
    lives: (n: number, total: number) => string;
    health: string;
    enemies: (left: number) => string;
    chasing: (n: number) => string;
    /** The mission bar's label, e.g. "Mission 72 %". */
    progress: (percent: number) => string;
    /** The mission bar's details. */
    progressTip: (destroyed: number, rescued: number, total: number) => string;
    restart: string;
    unstuck: string;
    pause: string;
    exit: string;
    soundOn: string;
    soundOff: string;
    controller: (name: string) => string;
  };
  weapons: { label: string; gun: string; knife: string; bazooka: string };
  paused: { title: string; resume: string; exit: string; resized: string };
  complete: { title: string; text: string; defeated: string; timeUsed: string; timeLeft: string; destroyed: string; shots: string; rockets: string; rebuild: string; keepPlaying: string; again: string };
  failed: { title: string; text: string; textDead: string; rescued: string; again: string; rebuild: string };
  touch: { label: string; move: string; jump: string; fire: string; knife: string; bazooka: string };
}
