// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { originOf } from "@go-link/shared";
import { t } from "../i18n";
import { SITE_URL } from "../role";
import { HANDOFF_PATH, HANDOFF_TAG, IMPORT_PARAM, acceptEntries, handoffBody } from "../handoff";
import { useSignal } from "../signal/SignalProvider";

const SITE_ORIGIN = originOf(SITE_URL);
const DISMISSED_KEY = "go-link.handoff-dismissed";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * On play.go-link.org, after go-link.org sent this browser here with
 * ?import=1: offers to bring the device link and settings kept on
 * go-link.org before the split. A click opens go-link.org/handoff, which
 * posts them back (see handoff.ts); then the page reloads with them.
 */
export function HandoffBanner() {
  const { panel } = useSignal();
  const { search, pathname, hash } = useLocation();
  const navigate = useNavigate();
  const asked = new URLSearchParams(search).has(IMPORT_PARAM);
  const [state, setState] = useState<"idle" | "waiting" | "failed">("idle");
  const tab = useRef<Window | null>(null);
  const handled = useRef(false);

  // Takes ?import=1 out of the address, keeping the rest.
  const clean = () => {
    const params = new URLSearchParams(search);
    params.delete(IMPORT_PARAM);
    const rest = params.toString();
    return `${pathname}${rest ? `?${rest}` : ""}${hash}`;
  };

  useEffect(() => {
    if (!asked || !SITE_ORIGIN) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== SITE_ORIGIN || !tab.current || e.source !== tab.current) return;
      const body = handoffBody(e.data);
      const store = storage();
      if (body?.kind !== "data" || !store || handled.current) return;
      handled.current = true;
      const stored = acceptEntries(body.entries, store);
      tab.current.postMessage({ tag: HANDOFF_TAG, kind: "done", stored }, SITE_ORIGIN);
      tab.current = null;
      // The link to the device is read when the page starts.
      window.location.replace(clean());
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked]);

  if (!asked || panel || !SITE_ORIGIN) return null;
  if (storage()?.getItem(DISMISSED_KEY)) return null;

  const bring = () => {
    handled.current = false;
    tab.current = window.open(`${SITE_URL}${HANDOFF_PATH}`, `go-link-handoff-${crypto.randomUUID()}`);
    setState(tab.current ? "waiting" : "failed");
  };
  const dismiss = () => {
    storage()?.setItem(DISMISSED_KEY, "1");
    navigate(clean(), { replace: true });
  };

  const th = t.handoff;
  return (
    <div className="server-banner handoff-banner" role="status">
      <span>{state === "waiting" ? th.waiting : state === "failed" ? th.blocked : th.banner}</span>
      <button type="button" className="button button-small button-primary" onClick={bring}>
        {th.bring}
      </button>
      <button type="button" className="button button-small button-secondary" onClick={dismiss}>
        {th.dismiss}
      </button>
    </div>
  );
}
