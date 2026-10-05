// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Willy Maker's way to the owner's go-link: the link to the device lives on
// the main site, so the maker opens its /maker-bridge tab and talks to it with
// postMessage (packages/shared/src/maker-bridge.ts). To the maker's code the
// bridge looks like the device link it always used (RomTestLink + its control
// messages), so a ROM test and Play on my go-link work unchanged.

import { useMemo, useSyncExternalStore } from "react";
import { BRIDGE_PATH, bridgeBody, bridgeEnvelope, originOf, type BridgeStatus, type MakerToBridge, type RomTestLink } from "@go-link/shared";
import type { MakerDevice } from "./maker";

interface PendingFile {
  resolve: () => void;
  reject: (err: Error) => void;
  onProgress?: (sent: number, total: number) => void;
}

export type ImportedGames = { entries: [string, string][]; assets: [string, unknown][] };

export class BridgeClient {
  private win: Window | null = null;
  private status: BridgeStatus | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly handlers = new Set<(msg: unknown) => void>();
  private readonly files = new Map<number, PendingFile>();
  private req = 0;
  private watch: ReturnType<typeof setInterval> | null = null;
  private wantImport: ((games: ImportedGames) => void) | null = null;
  readonly origin: string;

  constructor(
    readonly siteUrl: string,
    private readonly target: Window = window,
  ) {
    this.origin = originOf(siteUrl) ?? "";
  }

  /** Listens to the bridge tab; returns the stop (an effect's cleanup: React may run the pair twice). */
  start(): () => void {
    this.target.addEventListener("message", this.onMessage);
    return () => {
      this.target.removeEventListener("message", this.onMessage);
      if (this.watch) clearInterval(this.watch);
      this.watch = null;
    };
  }

  /** The bridge tab's last word on the link, or null while there is no bridge tab. */
  getStatus = (): BridgeStatus | null => this.status;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** Opens (or brings back) the go-link.org bridge tab. Call it from a click: browsers block other pop-ups. */
  connect = (): void => {
    if (this.win && !this.win.closed) {
      this.win.focus();
      return;
    }
    // a random name: another page in this tab's group cannot guess it and take its place
    this.win = this.target.open(`${this.siteUrl}${BRIDGE_PATH}`, `go-link-maker-bridge-${crypto.randomUUID()}`);
    if (!this.watch)
      this.watch = setInterval(() => {
        if (this.win && this.win.closed) this.lost();
      }, 1000);
  };

  /** Asks the bridge tab for the games kept on go-link.org; opens it first when needed (from a click). */
  importOldGames(onGames: (games: ImportedGames) => void): void {
    this.wantImport = onGames;
    this.connect();
    if (this.status) this.post({ kind: "import" });
  }

  /** Subscribes to the device's answers (the ones the bridge passes on). */
  onDeviceMessage = (fn: (msg: unknown) => void): (() => void) => {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  };

  /** The device link as the maker's code knows it. */
  readonly link: RomTestLink = {
    sendControl: (message: unknown): boolean => this.post({ kind: "control", message }),
    sendFile: async (id, file, name, onProgress, purpose = "rom_test") => {
      const data = await file.arrayBuffer();
      const req = ++this.req;
      return new Promise<void>((resolve, reject) => {
        this.files.set(req, { resolve, reject, onProgress });
        if (!this.post({ kind: "file", req, id, name, purpose, data }, [data])) {
          this.files.delete(req);
          reject(new Error("channel not open"));
        }
      });
    },
  };

  /** Sends the bridge tab to a room of the main site (the game sent to the device). That tab is the
   * game's now: the next connect opens a new bridge tab. */
  openRoom = (roomId: string): void => {
    if (!this.post({ kind: "open_room", roomId })) return;
    this.win?.focus();
    this.win = null;
    this.status = null;
    this.emit();
  };

  private post(body: MakerToBridge, transfer: Transferable[] = []): boolean {
    if (!this.win || this.win.closed || !this.origin) return false;
    this.win.postMessage(bridgeEnvelope(body), this.origin, transfer);
    return true;
  }

  private lost(): void {
    this.win = null;
    this.status = null;
    for (const f of this.files.values()) f.reject(new Error("connection closed"));
    this.files.clear();
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  private onMessage = (e: MessageEvent): void => {
    if (!this.origin || e.origin !== this.origin || !this.win || e.source !== this.win) return;
    const body = bridgeBody(e.data);
    if (!body) return;
    switch (body.kind) {
      case "status": {
        const first = this.status === null;
        this.status = { kind: "status", linked: body.linked === true, online: body.online === true, name: typeof body.name === "string" ? body.name : undefined };
        if (first && this.wantImport) this.post({ kind: "import" });
        this.emit();
        break;
      }
      case "device":
        this.handlers.forEach((fn) => fn(body.message));
        break;
      case "file_progress":
        this.files.get(Number(body.req))?.onProgress?.(Number(body.sent), Number(body.total));
        break;
      case "file_done": {
        const f = this.files.get(Number(body.req));
        if (!f) break;
        this.files.delete(Number(body.req));
        if (typeof body.error === "string") f.reject(new Error(body.error));
        else f.resolve();
        break;
      }
      case "projects": {
        const done = this.wantImport;
        this.wantImport = null;
        if (done && Array.isArray(body.entries) && Array.isArray(body.assets)) done({ entries: body.entries as [string, string][], assets: body.assets as [string, unknown][] });
        break;
      }
    }
  };
}

/** The owner's go-link as Willy Maker's code sees it, through the bridge. */
export function useBridgeDevice(client: BridgeClient): MakerDevice {
  const status = useSyncExternalStore(client.subscribe, client.getStatus, () => null);
  return useMemo<MakerDevice>(
    () => ({
      linked: status?.linked ?? false,
      link: status?.online ? client.link : null,
      onMessage: client.onDeviceMessage,
      name: status?.name,
      openRoom: client.openRoom,
      connect: status?.online ? undefined : client.connect,
      myDeviceHref: `${client.siteUrl}/device`,
    }),
    [status, client],
  );
}
