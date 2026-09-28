// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { DeviceStatus } from "@go-link/shared";
import { smoothPath, toPoints } from "./charts";

const MB = 1024 ** 2;
const GB = 1024 ** 3;
const sendControl = vi.fn();
const listeners = new Set<(msg: unknown) => void>();
const stream = { sendControl };

const status: DeviceStatus = {
  device_id: "7f3c2a10-1b2c-4d3e-8f90-a1b2c3d4e5f6",
  version: "0.5.0",
  signal_url: "wss://signal.go-link.org/ws",
  ice_urls: [
    "stun:signal.go-link.org:3478",
    "turn:signal.go-link.org:3478?transport=udp",
  ],
  roms_dir: "/roms",
  linked_browsers: 1,
  rooms: [
    { id: "a1", name: "Robby night", rom: "robby", game: "Robby Roto", public: true, voice: true, state: "archived", favorite: false, roomId: "", players: 0, maxPlayers: 2, spectators: 0, queue: 0, since: "2026-09-26T10:00:00Z", deletedAt: null, saves: [{ slot: 1, name: "Stage 3", at: "2026-09-26T09:00:00Z" }], autosave: true, lastError: "", ownerKey: "", invite: "", inviteCode: "", chatOff: false, noSaves: false },
    { id: "b2", name: "Turtles co-op", rom: "robby", game: "Robby Roto", public: true, voice: true, state: "live", favorite: true, roomId: "R2", players: 2, maxPlayers: 4, spectators: 3, queue: 0, since: "2026-09-26T11:00:00Z", deletedAt: null, saves: [], autosave: false, lastError: "", ownerKey: "", invite: "", inviteCode: "", chatOff: false, noSaves: false },
    { id: "c3", name: "Old one", rom: "looping", game: "Looping", public: false, voice: false, state: "trash", favorite: false, roomId: "", players: 0, maxPlayers: 2, spectators: 0, queue: 0, since: "2026-09-20T11:00:00Z", deletedAt: new Date().toISOString(), saves: [], autosave: false, lastError: "", ownerKey: "", invite: "", inviteCode: "", chatOff: false, noSaves: false },
  ],
  system: {
    hardware: {
      hostname: "Mac-Pro-de-Federico",
      os: "darwin",
      arch: "amd64",
      platform: "darwin 15.7.3",
      cpu_model: "Intel Core i9-10900",
      cores: 20,
      mem_total: 128 * GB,
    },
    usage: {
      cpu_percent: 23.4,
      process_cpu_percent: 200,
      mem_used: 41 * GB,
      process_rss: 2 * GB,
      net_sent_bps: 600_000,
      net_recv_bps: 100_000,
    },
    sampled_at: "2026-09-26T22:00:00Z",
  },
  room: {
    room_id: "d85b7fba-626d-4b73-82a4-6da4070eda2e",
    viewers: 3,
    title: "Robby Roto",
    game: "Robby Roto",
    public: true,
    players: 2,
    max_players: 4,
    queue: 0,
    spectators: 3,
    invite: "AbCdEfGhIjKlMnOpQrStUv",
    invite_code: "123456789",
  },
  library: {
    dir: "/roms",
    roms: [
      {
        name: "robby",
        size: 20 * MB,
        title: "Robby Roto",
        year: "1981",
        maker: "Bally Midway",
        thumbs: { boxart: true, title: false, snap: false },
        check: { status: "ok" },
      },
      {
        name: "capsnka",
        size: 96 * MB,
        title: "Capcom Sports Club",
        thumbs: { boxart: false, title: false, snap: false },
        check: { status: "ok" },
      },
      {
        name: "looping",
        size: 4 * MB,
        title: "Looping",
        thumbs: { boxart: false, title: false, snap: false },
        check: { status: "missing", missing: ["vli3.5a"] },
      },
    ],
    core: {
      name: "mame2003-plus",
      installed: true,
      catalog: true,
      downloading: false,
    },
    disk: { total: 2000 * GB, free: 1500 * GB },
    thumbnailsDir: "/thumbs",
    thumbKind: "boxart",
    thumbnailsBytes: 30 * MB,
  },
  savesBytes: 10 * MB,
};

vi.mock("../../signal/SignalProvider", () => ({
  useSignal: () => ({
    linkedDevice: { status, rttMs: 6, path: "direct", state: "connected" },
    unlinkDevice: vi.fn(),
    hostLink: { stream },
    sendToDevice: (msg: unknown) => sendControl(msg),
    onDeviceMessage: (fn: (msg: unknown) => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  }),
}));

const { DeviceDashboard } = await import("./DeviceDashboard");
const { LobbyPage } = await import("../../pages/LobbyPage");
const { forgetThumbnails } = await import("./useThumbnail");

afterEach(() => {
  cleanup();
  forgetThumbnails();
});

describe("device dashboard", () => {
  it("shows the device, its live figures and the path", () => {
    render(
      <MemoryRouter>
        <DeviceDashboard />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: "Mac-Pro-de-Federico" }),
    ).toBeInTheDocument();
    const figures = screen.getByRole("region", { name: "Live figures" });
    expect(within(figures).getByText("23")).toBeInTheDocument(); // CPU, rounded
    expect(within(figures).getByText("10")).toBeInTheDocument(); // 200% of one core on 20 cores
    expect(within(figures).getByText("6")).toBeInTheDocument(); // latency
    expect(screen.getByText("Direct path")).toBeInTheDocument();
    expect(screen.getByText("signal.go-link.org")).toBeInTheDocument();
  });

  it("shows how much space the ROMs take and the biggest sets", () => {
    render(
      <MemoryRouter>
        <DeviceDashboard />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: "ROM storage" }),
    ).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument(); // 20 + 96 + 4 MB
    expect(screen.getByText("avg 40 MB / set")).toBeInTheDocument();
    expect(
      screen.getByText("1.5 TB free of 2.0 TB on this disk"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("capsnka")[0]).toBeInTheDocument();
  });

  it("shows the space the ROMs, thumbnails and saved games take", () => {
    render(
      <MemoryRouter>
        <DeviceDashboard />
      </MemoryRouter>,
    );
    const card = screen
      .getByRole("heading", { name: "Space used" })
      .closest(".card") as HTMLElement;
    expect(within(card).getByText("160")).toBeInTheDocument(); // 120 + 30 + 10 MB
    expect(within(card).getByText("<1% of the disk")).toBeInTheDocument();
    expect(within(card).getByText("Thumbnails")).toBeInTheDocument();
    expect(within(card).getByText("30 MB")).toBeInTheDocument();
    expect(within(card).getByText("Saved games")).toBeInTheDocument();
    expect(within(card).getByText("10 MB")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Current room" })).toBeNull();
  });

  it("lists the ROMs as cards or a list, filtered, with Play for the ones that run", async () => {
    render(
      <MemoryRouter>
        <DeviceDashboard tab="roms" />
      </MemoryRouter>,
    );
    expect(screen.getByText("Showing 3 of 3")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /Missing files/ }),
    );
    expect(screen.getByText("Showing 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("Looping")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Play Looping/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /All/ }));
    await userEvent.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(localStorage.getItem("go-link.roms-view")).toBe("list");
    expect(
      screen.getByRole("link", { name: /Play Robby Roto/ }),
    ).toHaveAttribute("href", "/create?rom=robby");

    await userEvent.type(screen.getByRole("searchbox"), "capcom sports");
    expect(screen.getByText("Showing 1 of 3")).toBeInTheDocument();
  });
});

describe("thumbnails", () => {
  it("asks the device for the Boxart and shows it in the card", async () => {
    URL.createObjectURL = vi.fn(() => "blob:robby");
    URL.revokeObjectURL = vi.fn();
    localStorage.setItem("go-link.roms-view", "cards");
    const { container } = render(
      <MemoryRouter>
        <DeviceDashboard tab="roms" />
      </MemoryRouter>,
    );
    expect(sendControl).toHaveBeenCalledWith({ type: "get_thumb", set: "robby", kind: "boxart", size: "card" });
    // Only sets with a Boxart are asked for.
    expect(sendControl).not.toHaveBeenCalledWith(expect.objectContaining({ set: "looping" }));
    act(() => listeners.forEach((fn) => fn({ type: "thumb", set: "robby", kind: "boxart", size: "card", data: btoa("jpeg") })));
    expect(container.querySelector("img.roms-art")?.getAttribute("src")).toBe("blob:robby");
  });
});

describe("rooms on the home page", () => {
  it("lists the game rooms, favorites first, and acts on them", async () => {
    render(
      <MemoryRouter>
        <LobbyPage />
      </MemoryRouter>,
    );
    const names = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(names).toEqual(["Turtles co-op", "Robby night"]); // the trash is apart
    expect(screen.getByRole("button", { name: /Trash/ })).toHaveTextContent("1");
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/r/R2");

    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(sendControl).toHaveBeenCalledWith({ type: "room_action", id: "b2", action: "pause" });
    await userEvent.click(screen.getAllByRole("button", { name: "Add to favorites" })[0]!);
    expect(sendControl).toHaveBeenCalledWith({ type: "room_action", id: "a1", action: "favorite" });

    act(() => listeners.forEach((fn) => fn({ type: "room_result", id: "b2", action: "pause", ok: true })));
    expect(screen.getByRole("status")).toHaveTextContent("“Turtles co-op” is paused for everyone");
  });

  it("lists every action in the ⋯ menu", async () => {
    render(
      <MemoryRouter>
        <LobbyPage />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getAllByRole("button", { name: "More options" })[0]!);
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Open", "Pause", "Save game", "Archive", "Remove from favorites"]);
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Save game" }));
    expect(sendControl).toHaveBeenCalledWith({ type: "room_action", id: "b2", action: "save" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("asks where to start an archived room again", async () => {
    render(
      <MemoryRouter>
        <LobbyPage />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Turn on" }));
    const dialog = screen.getByRole("dialog", { name: "Turn on “Robby night”" });
    const options = within(dialog).getAllByRole("radio").map((o) => o.textContent);
    expect(options[0]).toContain("Continue where you left off");
    expect(options[1]).toContain("Start from the beginning");
    expect(options[2]).toContain("Saved game · slot 1");
    await userEvent.click(within(dialog).getAllByRole("radio")[2]!);
    await userEvent.click(within(dialog).getByRole("button", { name: "Turn on" }));
    expect(sendControl).toHaveBeenCalledWith({ type: "room_start", id: "a1", from: "slot", slot: 1 });
  });

  it("a game the emulator cannot save only starts from the beginning", async () => {
    const rooms = status.rooms!;
    rooms[0] = { ...rooms[0]!, noSaves: true };
    rooms[1] = { ...rooms[1]!, noSaves: true };
    try {
      render(
        <MemoryRouter>
          <LobbyPage />
        </MemoryRouter>,
      );
      await userEvent.click(screen.getByRole("button", { name: "Turn on" }));
      const dialog = screen.getByRole("dialog", { name: "Turn on “Robby night”" });
      const options = within(dialog).getAllByRole("radio").map((o) => o.textContent);
      expect(options).toHaveLength(1);
      expect(options[0]).toContain("Start from the beginning");
      expect(within(dialog).getByText(/always starts from the beginning/)).toBeInTheDocument();
      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      // No "Save game" for the live one either.
      await userEvent.click(screen.getAllByRole("button", { name: "More options" })[0]!);
      const menu = screen.getByRole("menu");
      expect(within(menu).queryByRole("menuitem", { name: "Save game" })).not.toBeInTheDocument();
      // Archiving it would end the game: pausing is offered first.
      await userEvent.click(within(menu).getByRole("menuitem", { name: "Archive" }));
      const ask = screen.getByRole("alertdialog", { name: "Archive “Turtles co-op”?" });
      expect(within(ask).getAllByRole("button").map((b) => b.textContent)).toEqual(["Pause it", "Archive anyway", "Cancel"]);
      await userEvent.click(within(ask).getByRole("button", { name: "Pause it" }));
      expect(sendControl).toHaveBeenLastCalledWith({ type: "room_action", id: "b2", action: "pause" });
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    } finally {
      rooms[0] = { ...rooms[0]!, noSaves: false };
      rooms[1] = { ...rooms[1]!, noSaves: false };
    }
  });

  it("restores or deletes for good from the trash", async () => {
    render(
      <MemoryRouter>
        <LobbyPage />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: /Trash/ }));
    expect(screen.getByText(/stay here for 30 days/)).toBeInTheDocument();
    expect(screen.getByText("30 days left")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete forever" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete forever" }));
    expect(sendControl).toHaveBeenCalledWith({ type: "room_action", id: "c3", action: "purge" });
    expect(screen.getByRole("button", { name: "Restore and turn on" })).toBeInTheDocument();
  });
});

describe("charts", () => {
  it("maps values onto the chart box", () => {
    const p = toPoints([0, 50, 100], 200, 102, 100);
    expect(p[0]).toEqual([0, 101]);
    expect(p[2]).toEqual([200, 1]);
    expect(smoothPath(p)).toMatch(/^M0\.0,101\.0 C/);
  });

  it("lists the game history, searches it and asks before clearing it", async () => {
    sendControl.mockClear();
    render(
      <MemoryRouter>
        <DeviceDashboard tab="history" />
      </MemoryRouter>,
    );
    expect(sendControl).toHaveBeenCalledWith({ type: "get_history" });
    expect(screen.getByRole("status", { name: "Loading the history…" })).toBeInTheDocument();

    act(() =>
      listeners.forEach((fn) =>
        fn({
          type: "history",
          items: [
            { room_id: "b2", name: "Turtles co-op", rom: "robby", game: "Robby Roto", started_at: "2026-09-26T10:00:00Z", ended_at: "2026-09-26T11:02:00Z", peak_players: 2, peak_spectators: 3, reason: "archived" },
            { room_id: "c3", name: "Old one", rom: "looping", game: "Looping", started_at: "2026-09-25T10:00:00Z", ended_at: "2026-09-25T10:00:30Z", peak_players: 1, peak_spectators: 0, reason: "failed",
              people: [
                { name: "Fede", ports: [1], ip: "192.0.2.10", path: "direct" },
                { name: "Ana", ports: [2], path: "relay" },
                { name: "Lu" },
              ] },
          ],
        }),
      ),
    );
    expect(screen.getByText("Turtles co-op")).toBeInTheDocument();
    expect(screen.getByText("1 h 02 min")).toBeInTheDocument();
    expect(screen.getByText("2 players · 3 spectators")).toBeInTheDocument();
    // Who played at each port, from which address, and how many watched.
    expect(screen.getByText("Fede")).toBeInTheDocument();
    expect(screen.getByText("192.0.2.10")).toBeInTheDocument();
    expect(screen.getByText("via relay")).toBeInTheDocument();
    expect(screen.getByText("+ 1 spectator")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Play Looping again" })).toHaveAttribute("href", "/create?rom=looping");

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Search game or room"), "192.0.2");
    expect(screen.queryByText("Turtles co-op")).not.toBeInTheDocument();
    expect(screen.getByText("Old one")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear history" }));
    const dialog = screen.getByRole("alertdialog", { name: "Clear the game history?" });
    await user.click(within(dialog).getByRole("button", { name: "Clear history" }));
    expect(sendControl).toHaveBeenCalledWith({ type: "clear_history" });
  });

  it("renders a huge ROM library a page at a time", async () => {
    const big = Array.from({ length: 150 }, (_, i) => ({
      name: `set${String(i).padStart(3, "0")}`,
      size: MB,
      title: `Game ${String(i).padStart(3, "0")}`,
      thumbs: { boxart: false, title: false, snap: false },
      check: { status: "ok" as const },
    }));
    const saved = status.library!.roms;
    status.library!.roms = big;
    try {
      render(
        <MemoryRouter>
          <DeviceDashboard tab="roms" />
        </MemoryRouter>,
      );
      expect(screen.getByText("Game 059")).toBeInTheDocument();
      expect(screen.queryByText("Game 060")).not.toBeInTheDocument();
      await userEvent.setup().click(screen.getByRole("button", { name: "Show more" }));
      expect(screen.getByText("Game 119")).toBeInTheDocument();
      // Search looks through the whole library, not just the rendered page.
      await userEvent.setup().type(screen.getByPlaceholderText("Search game, set or maker"), "Game 149");
      expect(screen.getByText("Game 149")).toBeInTheDocument();
    } finally {
      status.library!.roms = saved;
    }
  });

  it("opens the test pattern room and invites someone to test with it", async () => {
    sendControl.mockClear();
    render(
      <MemoryRouter>
        <DeviceDashboard />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Test pattern" })).toHaveAttribute(
      "href",
      "/r/d85b7fba-626d-4b73-82a4-6da4070eda2e",
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Invite someone to test" }));
    const dialog = screen.getByRole("dialog", { name: "Invite to “Test pattern”" });
    // Every invitation asks the device for a PIN of its own.
    expect(sendControl).toHaveBeenCalledWith({ type: "invite", id: "test" });
    act(() => listeners.forEach((fn) => fn({ type: "invite_pass", id: "test", pin: "482913", expires_at: "2026-09-27T18:00:00Z" })));
    expect(within(dialog).getByText("482913")).toBeInTheDocument();
    sendControl.mockClear();
    await user.click(within(dialog).getByRole("button", { name: "Invite someone else" }));
    expect(sendControl).toHaveBeenCalledWith({ type: "invite", id: "test" });
    expect(within(dialog).getByText("Making a PIN…")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "New link" }));
    expect(sendControl).toHaveBeenCalledWith({ type: "room_action", id: "test", action: "new_link" });
  });
});
