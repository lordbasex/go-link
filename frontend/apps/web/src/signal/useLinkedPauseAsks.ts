// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useCallback, useEffect, useMemo, useState } from "react";
import { parsePauseAskEvent, type PauseAskView } from "@go-link/shared";
import { useSignal } from "./SignalProvider";

/** A player's request for a pause in one of the host's rooms. */
export interface LinkedPauseAsk {
  /** The device's room id (room_action, pause_answer). */
  id: string;
  /** The room's name, for the notice. */
  room: string;
  /** Its signalhub room and invitation, to tell whether a page shows it. */
  roomId: string;
  invite: string;
  ask: PauseAskView;
}

const key = (id: string, from: string) => `${id}\u0000${from}`;

/**
 * The requests for a pause of the linked device's rooms: device_status
 * carries them (for a browser that opens later) and pause_asked /
 * pause_ask_gone update them at once. The host answers with answer().
 */
export function useLinkedPauseAsks(): {
  asks: LinkedPauseAsk[];
  answer: (id: string, from: string, accept: boolean) => void;
} {
  const { demo, hostLink, linkedDevice, sendToDevice, onDeviceMessage } = useSignal();
  // Live changes since the last device_status: added asks and gone ones.
  const [added, setAdded] = useState<Map<string, { id: string; ask: PauseAskView }>>(() => new Map());
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const status = linkedDevice.status;

  useEffect(() => {
    if (demo || !hostLink) return;
    return onDeviceMessage((msg) => {
      const ev = parsePauseAskEvent(msg);
      if (!ev) return;
      const k = key(ev.id, ev.type === "asked" ? ev.ask.from : ev.from);
      if (ev.type === "asked") {
        setAdded((cur) => new Map(cur).set(k, { id: ev.id, ask: ev.ask }));
        setGone((cur) => {
          if (!cur.has(k)) return cur;
          const next = new Set(cur);
          next.delete(k);
          return next;
        });
      } else {
        setAdded((cur) => {
          if (!cur.has(k)) return cur;
          const next = new Map(cur);
          next.delete(k);
          return next;
        });
        setGone((cur) => new Set(cur).add(k));
      }
    });
  }, [demo, hostLink, onDeviceMessage]);

  // A fresh device_status is the truth again.
  useEffect(() => {
    setAdded(new Map());
    setGone(new Set());
  }, [status]);

  const asks = useMemo(() => {
    const out = new Map<string, LinkedPauseAsk>();
    const rooms = status?.rooms ?? [];
    const describe = (id: string, ask: PauseAskView): LinkedPauseAsk => {
      const r = rooms.find((x) => x.id === id);
      const test = status?.room;
      return {
        id,
        room: r?.name ?? (id === "test" ? (test?.title ?? "") : ""),
        roomId: r?.roomId ?? (id === "test" ? (test?.room_id ?? "") : ""),
        invite: r?.invite ?? (id === "test" ? (test?.invite ?? "") : ""),
        ask,
      };
    };
    for (const r of rooms) for (const a of r.pauseAsks ?? []) out.set(key(r.id, a.from), describe(r.id, a));
    for (const [k, v] of added) out.set(k, describe(v.id, v.ask));
    for (const k of gone) out.delete(k);
    return [...out.values()];
  }, [status, added, gone]);

  const answer = useCallback(
    (id: string, from: string, accept: boolean) => {
      sendToDevice({ type: "pause_answer", id, from, accept });
      setGone((cur) => new Set(cur).add(key(id, from)));
    },
    [sendToDevice],
  );
  return { asks: demo || !hostLink ? [] : asks, answer };
}
