// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useState } from "react";
import type { PauseAskView } from "@go-link/shared";
import { t } from "../i18n";
import { localName } from "../pages/roomModel";
import { portStyle } from "./Seats";

/** How long a request waits for the host, as the device counts it. */
export const PAUSE_ASK_SECONDS = 30;

/**
 * Seconds left of a request. The device's clock may not match this one, so
 * the countdown starts from what is left when the request shows up here,
 * never more than the device's 30 s.
 */
function useSecondsLeft(expiresAt: number): number {
  const [deadline] = useState(() => {
    const left = expiresAt - Date.now();
    return Date.now() + (left > 0 && left <= PAUSE_ASK_SECONDS * 1000 ? left : PAUSE_ASK_SECONDS * 1000);
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/**
 * A player asks the host for a pause: "NAME wants to pause", with Pause and
 * Keep playing, like the request to swap controllers. For the host only,
 * in the room (over the video) or on any page of a linked browser (room
 * names the room then).
 */
export function PauseAskDialog({
  ask,
  room,
  onAnswer,
  className = "",
}: {
  ask: PauseAskView;
  room?: string;
  onAnswer: (accept: boolean) => void;
  className?: string;
}) {
  const left = useSecondsLeft(ask.expiresAt);
  const name = localName(ask.name);
  const title = room ? t.pauseAsk.wantsIn(name, room) : t.pauseAsk.wants(name);
  const titleId = `pause-ask-${ask.from}`;
  return (
    <div className={`pause-ask ${className}`} role="alertdialog" aria-labelledby={titleId} aria-describedby={`${titleId}-text`}>
      <div className="pause-ask-head">
        {ask.port > 0 && (
          <span className="pause-ask-port" style={portStyle(ask.port)}>
            P{ask.port}
          </span>
        )}
        <span className="pause-ask-title" id={titleId}>
          {title}
        </span>
      </div>
      <p className="pause-ask-text" id={`${titleId}-text`}>
        {t.pauseAsk.explain}
      </p>
      <div className="pause-ask-actions">
        <button type="button" className="button button-primary" onClick={() => onAnswer(true)}>
          {t.pauseAsk.accept}
        </button>
        <button type="button" className="button button-secondary" onClick={() => onAnswer(false)}>
          {t.pauseAsk.decline}
        </button>
      </div>
      <p className="pause-ask-expires small" aria-live="off">
        {t.pauseAsk.expires(left)}
      </p>
    </div>
  );
}
