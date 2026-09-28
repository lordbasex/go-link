// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useCallback, useState } from "react";
import {
  DEFAULT_KEYBOARD,
  loadInputConfig,
  saveInputConfig,
  type InputConfig,
  type KeyMap,
  type PadMap,
} from "@go-link/shared";

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export interface InputConfigApi {
  input: InputConfig;
  setKeyboard: (map: KeyMap) => void;
  resetKeyboard: () => void;
  setPad: (id: string, map: PadMap) => void;
  resetPad: (id: string) => void;
  /** Which local player a gamepad slot drives; null goes back to automatic. */
  setPlayer: (slot: string, player: number | null) => void;
}

/** This browser's keyboard and gamepad settings, saved in localStorage. */
export function useInputConfig(): InputConfigApi {
  const [input, setInput] = useState<InputConfig>(() =>
    loadInputConfig(safeStorage()),
  );
  const update = useCallback((change: (cur: InputConfig) => InputConfig) => {
    setInput((cur) => {
      const next = change(cur);
      saveInputConfig(safeStorage(), next);
      return next;
    });
  }, []);
  return {
    input,
    setKeyboard: useCallback(
      (map) => update((c) => ({ ...c, keyboard: map })),
      [update],
    ),
    resetKeyboard: useCallback(
      () => update((c) => ({ ...c, keyboard: DEFAULT_KEYBOARD })),
      [update],
    ),
    setPad: useCallback(
      (id, map) => update((c) => ({ ...c, pads: { ...c.pads, [id]: map } })),
      [update],
    ),
    resetPad: useCallback(
      (id) =>
        update((c) => {
          const pads = { ...c.pads };
          delete pads[id];
          return { ...c, pads };
        }),
      [update],
    ),
    setPlayer: useCallback(
      (slot, player) =>
        update((c) => {
          const players = { ...c.players };
          if (player === null) delete players[slot];
          else players[slot] = player;
          return { ...c, players };
        }),
      [update],
    ),
  };
}
