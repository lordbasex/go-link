// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import type { ChatEvent, ChatLine } from "@go-link/shared";
import { liveModel, localName } from "./roomModel";

const quiet = { speaking: new Set<number>(), silenced: new Set<number>(), talking: false };
const sys = (event: ChatEvent, args: { name?: string; name2?: string; port?: number }): ChatLine => ({
  kind: "system",
  text: "english fallback",
  ts: 1,
  event,
  args: { name: args.name ?? "", name2: args.name2 ?? "", port: args.port ?? 0, port2: 0 },
});

describe("pause notices in the chat", () => {
  it("says who asked and that the host agreed, or that the host declined", () => {
    const m = liveModel(null, [
      sys("game_paused", { name: "Ana", name2: "The host" }),
      sys("game_paused", { name: "Ana", name2: "Fede" }),
      sys("game_paused", { name: "The host" }),
      sys("pause_declined", { name: "Ana", port: 2 }),
    ], quiet);
    expect(m.chat).toEqual([
      { system: "Ana asked for a pause and the host paused the game" },
      { system: "Ana asked for a pause and Fede paused the game" },
      { system: "The host paused the game" },
      { system: "The host would rather keep playing" },
    ]);
  });
  it("shows the device's own names in the reader's language", () => {
    expect(localName("The host")).toBe("The host");
    expect(localName("Guest 9F3A")).toBe("Guest 9F3A");
    expect(localName("Ana")).toBe("Ana");
  });
});
