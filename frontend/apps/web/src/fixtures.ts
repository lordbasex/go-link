// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Sample data from the original design prototype,
// shown when VITE_DEMO_DATA=true.

import type { RoomMeta } from "@go-link/shared";

export interface DemoRoom {
  roomId: string;
  meta: RoomMeta;
}

export const DEMO_DEVICE_NAME = "PC-Federico";
export const DEMO_ROM_COUNT = 42;
export const DEMO_ROOM_ID = "3f2b9c1e-7a4d-4e0b-9c52-1d8e6f0aa71d";

const room = (n: number, meta: Omit<RoomMeta, "paused" | "art">): DemoRoom => ({
  roomId: `3f2b9c1e-7a4d-4e0b-9c52-1d8e6f0aa7${n.toString().padStart(2, "0")}`,
  meta: { ...meta, paused: false, art: null },
});

export const DEMO_ROOMS: DemoRoom[] = [
  room(1, { game: "Teenage Mutant Ninja Turtles", title: "Turtles co-op", host: "mariano", players: 3, maxPlayers: 4, queue: 0, spectators: 2, mode: "coop" }),
  room(2, { game: "Metal Slug X", title: "Metal Slug Saturday", host: "lordbasex", players: 2, maxPlayers: 2, queue: 3, spectators: 7, mode: "coop" }),
  room(3, { game: "The King of Fighters '98", title: "KOF ranked with friends", host: "caro_k", players: 2, maxPlayers: 2, queue: 1, spectators: 4, mode: "versus" }),
  room(4, { game: "Sunset Riders", title: "Cowboys at sunset", host: "nico.dev", players: 1, maxPlayers: 4, queue: 0, spectators: 0, mode: "coop" }),
  room(5, { game: "Shadow over Mystara", title: "D&D full table", host: "luli", players: 4, maxPlayers: 4, queue: 0, spectators: 3, mode: "coop" }),
  room(6, { game: "Puzzle Bobble", title: "Chill bubbles", host: "pedro", players: 1, maxPlayers: 2, queue: 0, spectators: 1, mode: "versus" }),
];

export interface DemoRom {
  id: string;
  game: string;
  file: string;
  minPlayers: number;
  maxPlayers: number;
}

export const DEMO_ROMS: DemoRom[] = [
  { id: "tmnt", game: "Teenage Mutant Ninja Turtles", file: "tmnt.zip", minPlayers: 1, maxPlayers: 4 },
  { id: "mslugx", game: "Metal Slug X", file: "mslugx.zip", minPlayers: 1, maxPlayers: 2 },
  { id: "kof98", game: "The King of Fighters '98", file: "kof98.zip", minPlayers: 2, maxPlayers: 2 },
];

export interface DemoPlayer {
  port: 1 | 2 | 3 | 4;
  name: string;
  you: boolean;
  speaking: boolean;
  muted: boolean;
}

export function demoPlayers(isPlayer: boolean, micOn: boolean): DemoPlayer[] {
  return [
    { port: 1, name: "Federico", you: isPlayer, speaking: isPlayer ? micOn : true, muted: isPlayer ? !micOn : false },
    { port: 2, name: "Juan", you: false, speaking: false, muted: false },
    { port: 3, name: "Caro", you: false, speaking: false, muted: true },
    { port: 4, name: "Nico", you: false, speaking: false, muted: false },
  ];
}

export type DemoMessage = { system: string } | { name: string; port: 1 | 2 | 3 | 4 | null; role: string; text: string };

export const DEMO_MESSAGES: DemoMessage[] = [
  { system: "Nico took seat P4" },
  { name: "Juan", port: 2, role: "P2", text: "Leo and Raph for us, Caro take Donatello" },
  { name: "Pedro", port: null, role: "queue · 1st", text: "good game! tell me when someone runs out of lives lol" },
  { system: "Lucia joined the queue (2nd)" },
  { name: "Caro", port: 3, role: "P3", text: "muted myself, it is noisy here, reading the chat" },
  { name: "Federico", port: 1, role: "P1 · host", text: "ok, starting level 3" },
];

export const DEMO_QUEUE = [
  { pos: "1st", name: "Pedro", note: "Gets the next free seat" },
  { pos: "2nd", name: "Lucia", note: "Waiting" },
];

export const DEMO_SPECTATORS = ["Marcos", "Sofi", "gamer_ba", "Tomas", "Ana"];
