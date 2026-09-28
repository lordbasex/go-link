// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The project was called MAME WebRTC before go-link. Browser settings saved
// under the old names (signaling server, linked device, volumes...) move
// to the new ones once, so nobody has to link again.

const OLD_PREFIX = "mame-webrtc.";
const NEW_PREFIX = "go-link.";

export function migrateLegacyStorage(storage: Storage | undefined): number {
  if (!storage) return 0;
  let moved = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(OLD_PREFIX)) keys.push(k);
    }
    for (const k of keys) {
      const target = NEW_PREFIX + k.slice(OLD_PREFIX.length);
      const value = storage.getItem(k);
      if (value !== null && storage.getItem(target) === null) {
        storage.setItem(target, value);
        moved++;
      }
      storage.removeItem(k);
    }
  } catch {
    // storage blocked: nothing to move
  }
  return moved;
}
