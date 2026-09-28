// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// @vitest-environment node

// Runs against a real signalhub when LIVE_SIGNAL_URL is set, for example:
//   LIVE_SIGNAL_URL=ws://127.0.0.1:8090/ws npx vitest run packages/shared/test/live.test.ts
import { describe, expect, it } from "vitest";
import { APP, SignalClient, SignalError, ServerError } from "../src";

const url = process.env.LIVE_SIGNAL_URL;

describe.skipIf(!url)("live signalhub", () => {
  it("lists rooms and rejects an unknown room", async () => {
    const c = new SignalClient({ url: url! });
    c.connect();
    await c.whenOpen();
    expect(c.peerId).toHaveLength(32);
    expect(c.iceServers.length).toBeGreaterThan(0);
    const rooms = await c.request({ type: "rooms_list", app: APP }, ["rooms"]);
    expect(rooms.type).toBe("rooms");
    await expect(c.request({ type: "join", app: APP, room_id: "3f2b9c1e-7a4d-4e0b-9c52-1d8e6f0aa71d" }, ["joined"])).rejects.toEqual(
      new SignalError(ServerError.RoomNotFound, true),
    );
    c.close();
  });
});
