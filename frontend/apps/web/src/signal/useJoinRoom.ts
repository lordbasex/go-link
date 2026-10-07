// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useRef, useState } from "react";
import {
  APP,
  ServerError,
  SignalError,
  isRoomId,
  parseRoomMeta,
  type Envelope,
  type InviteTarget,
  type RoomMeta,
} from "@go-link/shared";
import { useSignal } from "../signal/SignalProvider";

export type JoinStatus =
  | { kind: "invalid" }
  | { kind: "joining" }
  | {
      kind: "joined";
      sessionId: string;
      hostPeerId: string;
      /** The room joined (known only now when joining by invitation). */
      roomId: string;
      /** Signals received since join; calling it stops the buffering. */
      takeBacklog: () => Envelope[];
    }
  | { kind: "notFound" }
  | { kind: "ended" }
  | { kind: "rateLimited" }
  | { kind: "unreachable" };

/**
 * Joins a room on the shared signaling connection and keeps the session
 * while the page is open, by its room_id or by an invitation (link or
 * code). Leaving the page resets the connection, which is how a peer
 * leaves a session on signalhub.
 */
/**
 * hold keeps the page "joining" without asking yet: the owner's browser
 * waits for its device to say which invitation opens its room, or a join by
 * the room id alone would be refused ("not found") a moment before the
 * right one gets in.
 */
export function useJoinRoom(roomId: string, invite: InviteTarget | null = null, hold = false): JoinStatus {
  const { client, state, demo } = useSignal();
  const valid = invite !== null || isRoomId(roomId);
  // One text for the target, so a new target joins again.
  const target = invite ? ("invite" in invite ? `i:${invite.invite}` : `c:${invite.code}`) : `r:${roomId}`;
  const [status, setStatus] = useState<JoinStatus>(
    !valid ? { kind: "invalid" } : { kind: "joining" },
  );
  const joinedOn = useRef(""); // peer_id of the connection that joined
  const touched = useRef(false);

  // Leave the session when the page closes or the room changes.
  useEffect(() => {
    return () => {
      if (touched.current) client.reset();
      touched.current = false;
      joinedOn.current = "";
    };
  }, [client, target]);

  useEffect(() => {
    if (demo || !valid || hold) return;
    if (state !== "open") {
      if (joinedOn.current) setStatus({ kind: "joining" }); // link lost: rejoin when back
      joinedOn.current = "";
      return;
    }
    if (joinedOn.current === client.peerId) return;
    let cancelled = false;
    const peer = client.peerId;
    touched.current = true;
    setStatus({ kind: "joining" });
    // The device sends its WebRTC offer right after the join, possibly
    // before React mounts the stream: keep those signals until then.
    const backlog: Envelope[] = [];
    let buffering: (() => void) | null = client.onMessage((env) => {
      if (env.type === "signal") backlog.push(env);
    });
    const takeBacklog = () => {
      buffering?.();
      buffering = null;
      return backlog.splice(0);
    };
    client
      .request(
        invite ? { type: "join", app: APP, ...invite } : { type: "join", app: APP, room_id: roomId },
        ["joined"],
      )
      .then((env) => {
        if (cancelled) return;
        joinedOn.current = peer;
        setStatus({
          kind: "joined",
          sessionId: env.session_id ?? "",
          hostPeerId: env.remote ?? "",
          roomId: env.room_id ?? roomId,
          takeBacklog,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof SignalError && err.fromServer) {
          setStatus({
            kind:
              err.message === ServerError.RateLimited
                ? "rateLimited"
                : "notFound",
          });
        } else if (
          err instanceof SignalError &&
          err.message !== "disconnected"
        ) {
          setStatus({ kind: "unreachable" });
        }
      });
    return () => {
      cancelled = true;
      buffering?.();
    };
    // roomId and invite are read through target, which names them.
  }, [client, state, target, valid, demo, hold]);

  // The host leaving ends the session for everyone.
  useEffect(() => {
    if (status.kind !== "joined") return;
    return client.onMessage((env) => {
      if (env.type === "peer_left" && env.from === status.hostPeerId)
        setStatus({ kind: "ended" });
    });
  }, [client, status]);

  return status;
}

/** Directory info of a public room, or null for private rooms. */
export function usePublicRoomMeta(roomId: string): RoomMeta | null {
  const { client, state, demo } = useSignal();
  const [meta, setMeta] = useState<RoomMeta | null>(null);
  useEffect(() => {
    if (demo || state !== "open" || !isRoomId(roomId)) return;
    let alive = true;
    client
      .request({ type: "rooms_list", app: APP }, ["rooms"])
      .then((env) => {
        const found = env.rooms?.find((r) => r.room_id === roomId);
        if (alive) setMeta(found ? parseRoomMeta(found.meta) : null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [client, state, roomId, demo]);
  return meta;
}
