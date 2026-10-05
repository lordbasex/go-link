// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useState } from "react";
import { originOf } from "@go-link/shared";
import { t } from "../i18n";
import { PLAY_URL } from "../role";
import { HANDOFF_TAG, forgetSecrets, handoffBody, handoffEntries } from "../handoff";
import { PageHero } from "../components/ui/PageHero";

const PLAY_ORIGIN = originOf(PLAY_URL);

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * go-link.org/handoff: play.go-link.org opens this tab to take the settings
 * this browser kept here before the split (see handoff.ts). The data is
 * posted only to play's origin, so a page of any other site that opens this
 * tab receives nothing.
 */
export function HandoffPage() {
  const [opener] = useState(() => window.opener as Window | null);
  const [done, setDone] = useState<number | null>(null);

  useEffect(() => {
    const store = storage();
    if (!opener || !PLAY_ORIGIN || !store) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== PLAY_ORIGIN || e.source !== opener) return;
      const body = handoffBody(e.data);
      if (body?.kind !== "done") return;
      forgetSecrets(store);
      setDone(typeof body.stored === "number" ? body.stored : 0);
      window.setTimeout(() => window.close(), 1500);
    };
    window.addEventListener("message", onMessage);
    opener.postMessage({ tag: HANDOFF_TAG, kind: "data", entries: handoffEntries(store) }, PLAY_ORIGIN);
    return () => window.removeEventListener("message", onMessage);
  }, [opener]);

  const th = t.handoff;
  return (
    <div className="page page-frame handoff-page">
      <PageHero title={th.title} subtitle={th.intro} />
      <div className="page-body">
        <div className="card stack-sm" role="status">
          {!opener ? (
            <>
              <p className="muted">{th.noOpener}</p>
              <a className="button button-primary" href={`${PLAY_URL}/rooms`}>
                {th.open}
              </a>
            </>
          ) : done !== null ? (
            <p>{th.done}</p>
          ) : (
            <p className="muted">{th.sending}</p>
          )}
        </div>
      </div>
    </div>
  );
}
