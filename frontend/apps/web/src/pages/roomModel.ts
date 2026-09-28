// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { type ChatLine, type RoomStateView } from "@go-link/shared";
import { t } from "../i18n";
import { DEMO_MESSAGES, DEMO_QUEUE, DEMO_SPECTATORS, demoPlayers } from "../fixtures";

// One view model for the room screen, built either from the design's
// sample data (demo) or from the device's Room Manager (live).

export interface SeatCard {
  name: string;
  you: boolean;
  status: string;
  tone: "speaking" | "muted" | "normal";
  /** Live only: the listener silenced this player locally. */
  silenced?: boolean;
}

/** Live voice state used to decorate the seats. */
export interface VoiceView {
  /** Ports whose voice is loud right now (includes your own). */
  speaking: ReadonlySet<number>;
  /** Ports you silenced. */
  silenced: ReadonlySet<number>;
  /** Your microphone is sending. */
  talking: boolean;
}

export interface QueueRow {
  pos: string;
  name: string;
  you: boolean;
  note: string;
}

/** The device's notices come in English; the ones it marks are translated. */
function systemText(c: { text: string; event?: string }): string {
  if (c.event === "recording_started") return t.rec.started;
  if (c.event === "recording_stopped") return t.rec.stopped;
  return c.text;
}

export type ChatRow = { system: string } | { name: string; port: number | null; role: string; text: string; you: boolean };

export type Me = { kind: "player"; ports: number[] } | { kind: "queue"; position: number } | { kind: "spectator" } | { kind: "unknown" };

export interface RoomModel {
  seats: (SeatCard | null)[];
  queue: QueueRow[];
  spectators: { name: string; you: boolean }[];
  chat: ChatRow[];
  me: Me;
  /** "off" when the host created the room without voice. */
  voice: "player" | "spectator" | "pending" | "off";
  hearVoice: boolean;
}

export function demoModel(isPlayer: boolean, micOn: boolean, hearVoice: boolean): RoomModel {
  const you = isPlayer ? "Federico" : "Pedro";
  return {
    seats: demoPlayers(isPlayer, micOn).map((p) => ({
      name: p.name,
      you: p.you,
      status: p.speaking ? t.room.speaking : p.muted ? t.room.muted : t.room.micOn,
      tone: p.speaking ? "speaking" : p.muted ? "muted" : "normal",
    })),
    queue: DEMO_QUEUE.map((q, i) => ({ pos: q.pos, name: q.name, you: i === 0 && !isPlayer, note: q.note })),
    spectators: DEMO_SPECTATORS.map((name) => ({ name, you: false })),
    chat: DEMO_MESSAGES.map((m) => ("system" in m ? { system: m.system } : { name: m.name, port: m.port, role: m.role, text: m.text, you: m.name === you })),
    me: isPlayer ? { kind: "player", ports: [1] } : { kind: "queue", position: 1 },
    voice: isPlayer ? "player" : "spectator",
    hearVoice,
  };
}

export function liveModel(room: RoomStateView | null, chat: ChatLine[], voice: VoiceView): RoomModel {
  const seats: (SeatCard | null)[] = room
    ? room.seats.map((s, i) => {
        if (!s) return null;
        const port = i + 1;
        const silenced = voice.silenced.has(port);
        const speaking = voice.speaking.has(port) && !silenced;
        const micOff = s.you && !voice.talking;
        return {
          name: s.name,
          you: s.you,
          silenced,
          status: speaking ? t.room.speaking : silenced ? t.room.silenced : micOff ? t.room.muted : t.room.seatPlaying,
          tone: speaking ? "speaking" : silenced || micOff ? "muted" : "normal",
        };
      })
    : [null, null, null, null];
  let me: Me = { kind: "unknown" };
  if (room) {
    if (room.you.ports.length > 0) me = { kind: "player", ports: room.you.ports };
    else if (room.you.queuePositions.length > 0) me = { kind: "queue", position: Math.min(...room.you.queuePositions) };
    else me = { kind: "spectator" };
  }
  return {
    seats,
    queue: (room?.queue ?? []).map((q) => ({
      pos: t.ordinal(q.position),
      name: q.name,
      you: q.you,
      note: q.position === 1 ? t.room.queueNext : t.room.queueWaiting,
    })),
    spectators: room?.spectators ?? [],
    chat: chat.map((c) => (c.kind === "system" ? { system: systemText(c) } : { name: c.name, port: c.port, role: c.role, text: c.text, you: !!room && c.name === room.you.name })),
    me,
    voice: room?.voice === false ? "off" : me.kind === "player" ? "player" : "spectator",
    hearVoice: false,
  };
}
