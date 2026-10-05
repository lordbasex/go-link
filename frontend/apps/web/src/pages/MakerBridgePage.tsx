// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  MAKER_ASSET_DB,
  MAKER_ASSET_STORE,
  MAKER_STORAGE_PREFIX,
  bridgeControl,
  bridgeAllowsFile,
  bridgeAllowsReply,
  bridgeBody,
  bridgeEnvelope,
  originOf,
  type BridgeToMaker,
} from "@go-link/shared";
import { MAKER_URL } from "../config";
import { t } from "../i18n";
import { useSignal } from "../signal/SignalProvider";
import { PageHero } from "../components/ui/PageHero";

const MAKER_ORIGIN = originOf(MAKER_URL);
const ROOM_ID = /^[0-9a-f-]{8,64}$/i;

/** Everything Willy Maker kept on this site before it had its own (localStorage and its pictures). */
async function oldMakerGames(): Promise<{ entries: [string, string][]; assets: [string, unknown][] }> {
  const entries: [string, string][] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(MAKER_STORAGE_PREFIX)) entries.push([key, window.localStorage.getItem(key) ?? ""]);
    }
  } catch {
    // storage blocked: nothing to send
  }
  const assets = await new Promise<[string, unknown][]>((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve([]);
      const open = indexedDB.open(MAKER_ASSET_DB);
      open.onerror = () => resolve([]);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains(MAKER_ASSET_STORE)) {
          db.close();
          return resolve([]);
        }
        const out: [string, unknown][] = [];
        const cursor = db.transaction(MAKER_ASSET_STORE, "readonly").objectStore(MAKER_ASSET_STORE).openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (!c) {
            db.close();
            return resolve(out);
          }
          out.push([String(c.key), c.value]);
          c.continue();
        };
        cursor.onerror = () => resolve(out);
      };
    } catch {
      resolve([]);
    }
  });
  return { entries, assets };
}

/**
 * /maker-bridge: opened by Willy Maker (its own site) to reach the go-link
 * linked to this browser. It passes on a ROM test and a Willy Maker game's
 * room, and the device's answers to them, nothing else (maker-bridge.ts).
 */
export function MakerBridgePage() {
  const navigate = useNavigate();
  const { hostLink, linkedDevice, savedLink, onDeviceMessage } = useSignal();
  const opener = typeof window !== "undefined" ? (window.opener as Window | null) : null;
  const [imported, setImported] = useState<number | null>(null);
  const online = hostLink !== null && linkedDevice.state === "connected";
  const linked = hostLink !== null || savedLink !== null;
  const name = linkedDevice.status?.system?.hardware.hostname;
  const link = online ? hostLink.stream : null;
  const linkRef = useRef(link);
  linkRef.current = link;

  const post = (body: BridgeToMaker) => {
    if (opener && MAKER_ORIGIN) opener.postMessage(bridgeEnvelope(body), MAKER_ORIGIN);
  };

  // the link's state, on every change
  useEffect(() => {
    post({ kind: "status", linked, online, name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked, online, name]);

  // the device's answers Willy Maker asked for
  useEffect(
    () =>
      onDeviceMessage((message) => {
        if (bridgeAllowsReply(message)) post({ kind: "device", message });
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onDeviceMessage],
  );

  // Willy Maker's requests: only from its origin and from the tab that opened this one
  useEffect(() => {
    if (!opener || !MAKER_ORIGIN) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== MAKER_ORIGIN || e.source !== opener) return;
      const body = bridgeBody(e.data);
      if (!body) return;
      const live = linkRef.current;
      switch (body.kind) {
        case "control": {
          // a new message from the allowed fields only (bridgeControl), never Willy Maker's object
          const message = bridgeControl(body.message);
          if (live && message) live.sendControl(message);
          break;
        }
        case "file": {
          const req = Number(body.req);
          const data = body.data;
          if (!live || !(data instanceof ArrayBuffer) || typeof body.id !== "string" || !bridgeAllowsFile(body.purpose, data.byteLength, body.name)) {
            post({ kind: "file_done", req, error: live ? "the bridge refused the file" : "channel not open" });
            break;
          }
          live
            .sendFile(body.id, new Blob([data], { type: "application/zip" }), String(body.name), (sent, total) => post({ kind: "file_progress", req, sent, total }), body.purpose as "rom_test" | "maker")
            .then(() => post({ kind: "file_done", req }))
            .catch((err: unknown) => post({ kind: "file_done", req, error: (err as Error)?.message ?? String(err) }));
          break;
        }
        case "open_room":
          if (typeof body.roomId === "string" && ROOM_ID.test(body.roomId)) navigate(`/r/${body.roomId}`);
          break;
        case "import":
          void oldMakerGames().then((games) => {
            opener.postMessage(bridgeEnvelope({ kind: "projects", ...games }), MAKER_ORIGIN);
            setImported(games.entries.filter(([k]) => k.startsWith(`${MAKER_STORAGE_PREFIX}p.`)).length);
          });
          break;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opener, navigate]);

  const tb = t.makerBridge;
  return (
    <div className="page page-frame maker-bridge-page">
      <PageHero title={tb.title} subtitle={tb.intro} />
      <div className="page-body">
        <div className="card stack-sm" role="status">
          {!opener ? (
            <>
              <p className="muted">{tb.noOpener}</p>
              <a className="button button-primary" href={MAKER_URL}>
                {tb.open}
              </a>
            </>
          ) : imported !== null ? (
            <p>{tb.imported(imported)}</p>
          ) : online ? (
            <>
              <p className="strong">{name ? tb.online(name) : tb.onlineNoName}</p>
              <p className="muted">{tb.keep}</p>
            </>
          ) : linked ? (
            <p>{tb.offline}</p>
          ) : (
            <p>
              {tb.notLinked} <Link to="/device">{tb.link}</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
