// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  parseRomsPage,
  queryRomsLocally,
  ROMS_PAGE_MAX,
  romsGet,
  romsQuery,
  type DeviceRom,
  type RomsFilter,
  type RomsSort,
} from "@go-link/shared";
import { useSignal } from "../../signal/SignalProvider";

// The ROM library lives on the device and is never sent whole: a full MAME
// collection is thousands of sets, more than one WebRTC message carries.
// Pages come with roms_query (the device searches, filters and sorts) and
// single sets with roms_get. device_status tells the library's revision:
// when it changes (a scan of the folder) every page is asked again.

let nextReq = 0;
const newReq = (prefix: string) => `${prefix}${++nextReq}`;

/** The latest value, for effects that must not run again when it changes. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/** Waits for typing to stop before the device is asked. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

export interface RomPages {
  /** The sets loaded so far; null until the first page arrives. */
  roms: DeviceRom[] | null;
  /** Sets that match on the device. */
  total: number;
  more: boolean;
  loadMore: () => void;
  /** Put on an element after the list: it loads the next page in view. */
  sentinel: (node: HTMLElement | null) => void;
}

/**
 * Pages of the linked device's library that match q, filter and sort, page
 * sets at a time; the next page loads when the sentinel scrolls into view.
 */
export function useRomPages(
  { q = "", filter = "all", sort = "name" }: { q?: string; filter?: RomsFilter; sort?: RomsSort },
  { page = 60, enabled = true }: { page?: number; enabled?: boolean } = {},
): RomPages {
  const { linkedDevice, sendToDevice, onDeviceMessage } = useSignal();
  const send = useLatest(sendToDevice);
  const listen = useLatest(onDeviceMessage);
  const revision = linkedDevice.status?.library?.summary.revision;
  // A device before 0.2.9 sends the whole list: pages are made here.
  const legacy = linkedDevice.status?.library?.legacyRoms;
  const [legacyCount, setLegacyCount] = useState(page);
  const connected = linkedDevice.state === "connected" && linkedDevice.status !== null;
  const query = useDebounced(q.trim(), 200);
  const [roms, setRoms] = useState<DeviceRom[] | null>(null);
  const [total, setTotal] = useState(0);
  // The request whose reply is awaited, and the generation of the query:
  // a reply to an older query (or revision) is dropped.
  const pending = useRef<string | null>(null);
  const loaded = useRef(0);
  const gen = useRef("");

  const ask = useCallback(
    (offset: number) => {
      const req = newReq("roms-");
      pending.current = req;
      if (send.current(romsQuery(req, { q: query, filter, sort, offset, limit: page })) === false) pending.current = null;
    },
    [send, query, filter, sort, page],
  );

  useEffect(() => {
    if (!enabled || !connected || legacy) return;
    const g = newReq("gen-");
    gen.current = g;
    loaded.current = 0;
    const off = listen.current((msg) => {
      const p = parseRomsPage(msg);
      if (!p || p.req !== pending.current || gen.current !== g) return;
      pending.current = null;
      setTotal(p.total);
      setRoms((prev) => {
        const next = p.offset === 0 || !prev ? p.roms : [...prev.slice(0, p.offset), ...p.roms];
        loaded.current = next.length;
        return next;
      });
    });
    ask(0);
    return off;
    // revision: a new scan asks for the pages again
  }, [enabled, connected, revision, ask, listen, legacy]);

  // A new query shows the skeleton again; a new revision keeps the old
  // page on screen until the fresh one arrives.
  useEffect(() => {
    setRoms(null);
    setLegacyCount(page);
  }, [query, filter, sort, page]);

  const local = useMemo(
    () => (legacy && enabled ? queryRomsLocally(legacy, { q: query, filter, sort, limit: Infinity }) : null),
    [legacy, enabled, query, filter, sort],
  );
  const shown = local ? local.roms.slice(0, legacyCount) : roms;
  const count = local ? local.total : total;
  const more = shown !== null && shown.length < count;
  const loadMore = useCallback(() => {
    if (!more) return;
    if (local) setLegacyCount((c) => c + page);
    else if (pending.current === null) ask(loaded.current);
  }, [more, local, page, ask]);

  const observer = useRef<IntersectionObserver | null>(null);
  const sentinel = useCallback(
    (node: HTMLElement | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!node || !more || typeof IntersectionObserver === "undefined") return;
      observer.current = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMore(), {
        rootMargin: "600px 0px",
      });
      observer.current.observe(node);
    },
    [more, loadMore],
  );
  useEffect(() => () => observer.current?.disconnect(), []);

  return { roms: shown, total: count, more, loadMore, sentinel };
}

// Sets asked by name, kept for one device link and library revision.
const known = new Map<string, DeviceRom | null>(); // name -> set, null = not in the folder
let knownFor: { device: string | undefined; revision: number | undefined } = { device: undefined, revision: undefined };

/**
 * The named sets of the linked device's library (to show a room's or a
 * past game's picture and title). A name not in the folder maps to null;
 * one still being asked is absent.
 */
export function useRomsByName(names: readonly string[]): Map<string, DeviceRom | null> {
  const { linkedDevice, sendToDevice, onDeviceMessage } = useSignal();
  const send = useLatest(sendToDevice);
  const listen = useLatest(onDeviceMessage);
  const device = linkedDevice.status?.device_id;
  const revision = linkedDevice.status?.library?.summary.revision;
  const connected = linkedDevice.state === "connected" && linkedDevice.status !== null;
  const [tick, setTick] = useState(0);
  const key = [...new Set(names)].sort().join(",");
  const legacy = linkedDevice.status?.library?.legacyRoms;

  if (knownFor.device !== device || knownFor.revision !== revision) {
    known.clear();
    knownFor = { device, revision };
  }

  useEffect(() => {
    if (!connected || !key || legacy) return;
    const wanted = key.split(",").filter((n) => !known.has(n));
    if (wanted.length === 0) return;
    const reqs = new Set<string>();
    const off = listen.current((msg) => {
      const p = parseRomsPage(msg);
      if (!p || !reqs.has(p.req)) return;
      reqs.delete(p.req);
      const found = new Map(p.roms.map((r) => [r.name, r]));
      for (const n of wanted) if (!known.has(n) && (found.has(n) || reqs.size === 0)) known.set(n, found.get(n) ?? null);
      setTick((t) => t + 1);
    });
    for (let i = 0; i < wanted.length; i += ROMS_PAGE_MAX) {
      const req = newReq("get-");
      reqs.add(req);
      send.current(romsGet(req, wanted.slice(i, i + ROMS_PAGE_MAX)));
    }
    return off;
  }, [key, connected, revision, device, send, listen, legacy]);

  return useMemo(() => {
    const m = new Map<string, DeviceRom | null>();
    const names = key ? key.split(",") : [];
    if (legacy) for (const n of names) m.set(n, legacy.find((r) => r.name === n) ?? null);
    else for (const n of names) if (known.has(n)) m.set(n, known.get(n)!);
    return m;
  }, [key, tick, revision, device, legacy]); // tick: an answer arrived
}
