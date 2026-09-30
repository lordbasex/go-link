// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

/** What the player asks for this frame, from any input (keys, controllers, touch). */
export interface Controls {
  /** -1..1 (a stick's tilt or ±1 from keys). */
  moveX: number;
  up: boolean;
  down: boolean;
  run: boolean;
  jump: boolean;
  fire: boolean;
  knife: boolean;
  bazooka: boolean;
  rescue: boolean;
  pause: boolean;
}

export const NO_CONTROLS: Controls = { moveX: 0, up: false, down: false, run: false, jump: false, fire: false, knife: false, bazooka: false, rescue: false, pause: false };

/** Which buttons went down since the last frame. */
export function pressedSince(prev: Controls, now: Controls): Record<"jump" | "knife" | "bazooka" | "rescue" | "pause" | "fire", boolean> {
  return {
    jump: now.jump && !prev.jump,
    knife: now.knife && !prev.knife,
    bazooka: now.bazooka && !prev.bazooka,
    rescue: now.rescue && !prev.rescue,
    pause: now.pause && !prev.pause,
    fire: now.fire && !prev.fire,
  };
}
