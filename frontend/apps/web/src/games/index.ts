// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import * as link from "./link";
import * as snake from "./snake";
import * as memory from "./memory";
import * as paddle from "./paddle";
import * as racer from "./racer";
import * as moves from "./moves";
import { drawLink, drawMemory, drawMoves, drawPaddle, drawRacer, drawSnake } from "./views";
import type { Game } from "./types";

export type GameId = "link" | "snake" | "memory" | "paddle" | "racer" | "moves";
export const GAME_IDS: readonly GameId[] = ["link", "snake", "memory", "paddle", "racer", "moves"];

export const GAMES: Record<GameId, Game<unknown>> = {
  link: { create: link.create, step: link.step, hud: link.hud, draw: drawLink } as Game<link.LinkState> as Game<unknown>,
  snake: { create: snake.create, step: snake.step, hud: snake.hud, draw: drawSnake } as Game<snake.SnakeState> as Game<unknown>,
  memory: { create: memory.create, step: memory.step, hud: memory.hud, draw: (c, s, p) => drawMemory(c, s, p) } as Game<memory.MemoryState> as Game<unknown>,
  paddle: { create: paddle.create, step: paddle.step, hud: paddle.hud, draw: (c, s, p) => drawPaddle(c, s, p) } as Game<paddle.PaddleState> as Game<unknown>,
  racer: { create: () => racer.create(), step: racer.step, hud: racer.hud, draw: (c, s, p) => drawRacer(c, s, p) } as Game<racer.RacerState> as Game<unknown>,
  moves: { create: moves.create, step: moves.step, hud: moves.hud, draw: drawMoves } as Game<moves.MovesState> as Game<unknown>,
};
