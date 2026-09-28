// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useState } from "react";
import { useSignal } from "../../signal/SignalProvider";

export type ThumbKind = "boxart" | "title" | "snap";

/** The kind of thumbnail the host chose in the device's Settings. */
export function useThumbKind(): ThumbKind {
  const { linkedDevice } = useSignal();
  return linkedDevice.status?.library?.thumbKind ?? "boxart";
}
export type ThumbSize = "card" | "mini";

// Images come from the linked device over the control channel ("get_thumb"
// → "thumb", a base64 JPEG). They are kept as object URLs for the page's
// life, and only a few requests are in flight at a time so a big library
// does not flood the channel. One listener per device link serves every
// image on the page.
const MAX_IN_FLIGHT = 4;
// The device sends small JPEGs (a card is at most a few hundred KB).
const MAX_THUMB_BASE64 = 2 << 20;

interface Sender {
  sendControl(msg: unknown): void;
}

interface Loader {
  sender: Sender;
  unsubscribe: () => void;
  cache: Map<string, string | null>; // key -> object URL, null = none
  waiting: Map<string, Set<(url: string | null) => void>>;
  queue: string[];
  inFlight: number;
}

let loader: Loader | null = null;

const keyOf = (set: string, kind: ThumbKind, size: ThumbSize) =>
  `${set}|${kind}|${size}`;

function toObjectURL(base64: string): string {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
}

function pump(l: Loader) {
  while (l.inFlight < MAX_IN_FLIGHT && l.queue.length > 0) {
    const [set, kind, size] = l.queue.shift()!.split("|");
    l.inFlight++;
    l.sender.sendControl({ type: "get_thumb", set, kind, size });
  }
}

function loaderFor(
  sender: Sender,
  onDeviceMessage: (fn: (msg: unknown) => void) => () => void,
): Loader {
  if (loader?.sender === sender) return loader;
  if (loader) {
    loader.unsubscribe();
    loader.cache.forEach((url) => url && URL.revokeObjectURL(url));
  }
  const l: Loader = {
    sender,
    unsubscribe: () => undefined,
    cache: new Map(),
    waiting: new Map(),
    queue: [],
    inFlight: 0,
  };
  l.unsubscribe = onDeviceMessage((msg) => {
    const m = msg as {
      type?: string;
      set?: string;
      kind?: string;
      size?: string;
      data?: string;
    };
    if (m === null || typeof m !== "object" || m.type !== "thumb" || !m.set || !m.kind || !m.size) return;
    const k = keyOf(m.set, m.kind as ThumbKind, m.size as ThumbSize);
    // A broken or oversized image counts as missing, and the queue goes on.
    let value: string | null = null;
    if (typeof m.data === "string" && m.data.length <= MAX_THUMB_BASE64) {
      try {
        value = toObjectURL(m.data);
      } catch {
        value = null;
      }
    }
    const old = l.cache.get(k);
    if (old) URL.revokeObjectURL(old);
    l.cache.set(k, value);
    l.waiting.get(k)?.forEach((fn) => fn(value));
    l.waiting.delete(k);
    l.inFlight = Math.max(0, l.inFlight - 1);
    pump(l);
  });
  loader = l;
  return l;
}

/** Asks for one image, or waits for the request already on its way. */
function request(l: Loader, key: string, done: (url: string | null) => void) {
  const waiters = l.waiting.get(key);
  if (waiters) waiters.add(done);
  else {
    l.waiting.set(key, new Set([done]));
    l.queue.push(key);
    pump(l);
  }
}

/**
 * Loads thumbnails into the page's cache ahead of time (the loading screen
 * does it for the rooms list), so they are there when the list renders.
 * Resolves when every image arrived or is known to be missing.
 */
export function prefetchThumbnails(
  sender: Sender,
  onDeviceMessage: (fn: (msg: unknown) => void) => () => void,
  sets: string[],
  kind: ThumbKind,
  size: ThumbSize,
): Promise<void> {
  const l = loaderFor(sender, onDeviceMessage);
  return Promise.all(
    sets.map((set) => {
      const key = keyOf(set, kind, size);
      if (l.cache.has(key)) return Promise.resolve();
      return new Promise<void>((resolve) => request(l, key, () => resolve()));
    }),
  ).then(() => undefined);
}

/** Forgets every image and pending request (a new device, or tests). */
export function forgetThumbnails(): void {
  loader?.unsubscribe();
  loader?.cache.forEach((url) => url && URL.revokeObjectURL(url));
  loader = null;
}

/**
 * The object URL of a set's thumbnail, or null while loading or when the
 * host has none. Pass has=false to skip the request when the device says
 * the image does not exist.
 */
export function useThumbnail(
  set: string,
  kind: ThumbKind,
  size: ThumbSize,
  has: boolean,
): string | null {
  const { hostLink, onDeviceMessage } = useSignal();
  const sender = hostLink?.stream ?? null;
  const key = keyOf(set, kind, size);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!has || !sender) {
      setUrl(null);
      return;
    }
    const l = loaderFor(sender, onDeviceMessage);
    // A picture the device lacked before may exist now (has turned true).
    if (l.cache.get(key)) {
      setUrl(l.cache.get(key) ?? null);
      return;
    }
    const done = (value: string | null) => setUrl(value);
    request(l, key, done);
    return () => {
      l.waiting.get(key)?.delete(done);
    };
  }, [key, has, sender, onDeviceMessage]);

  return url;
}
