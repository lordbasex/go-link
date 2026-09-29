// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useLocation } from "react-router-dom";
import { t } from "../i18n";
import { useLinkedPauseAsks } from "../signal/useLinkedPauseAsks";
import { PauseAskDialog } from "./PauseAskDialog";

/**
 * The host's linked browser, on any page: players asking for a pause in
 * one of its rooms, each with Pause and Keep playing. The room's own page
 * shows its requests over the video instead.
 */
export function PauseAskNotices() {
  const { asks, answer } = useLinkedPauseAsks();
  const { pathname } = useLocation();
  const [, kind, param] = pathname.split("/");
  const shown = asks.filter(
    (a) => !((kind === "r" && param && param === a.roomId) || (kind === "g" && param && param === a.invite)),
  );
  if (shown.length === 0) return null;
  return (
    <section className="pause-ask-notices" aria-label={t.pauseAsk.requests}>
      {shown.map((a) => (
        <PauseAskDialog
          key={`${a.id}-${a.ask.from}`}
          ask={a.ask}
          room={a.room}
          className="pause-ask-notice"
          onAnswer={(accept) => answer(a.id, a.ask.from, accept)}
        />
      ))}
    </section>
  );
}
