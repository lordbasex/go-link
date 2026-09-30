// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The game's interface (atomic design: the template): picks the screen for
// the session's phase and wires its buttons to the session.

import { useSyncExternalStore } from "react";
import { CIVILIAN_KINDS } from "../engine/civilian";
import { ENEMY_KINDS } from "../engine/enemy";
import type { Session } from "../host/session";
import type { DestroyMessages } from "../messages";
import { TouchPad } from "./molecules";
import { Alarm, Briefing, CompleteScreen, FailedScreen, Hud, PauseMenu, type FoeView, type PersonView } from "./organisms";

export function DestroyApp({ session, m }: { session: Session; m: DestroyMessages }) {
  const s = useSyncExternalStore(session.subscribe, session.getState);
  // The four kinds (briefing and the final count) and the people of this run (the HUD).
  const done = s.phase === "complete";
  const kinds: PersonView[] = CIVILIAN_KINDS.map((kind) => ({ name: m.people[kind], rescued: true, style: session.iconStyle(kind, done, 72), count: s.stats.byKind[kind] }));
  const run: PersonView[] = s.people
    .map((p, i) => ({ name: `${m.people[p.kind]} ${i + 1}`, rescued: p.state === "rescued", style: session.iconStyle(p.kind, p.state === "rescued", 24) }))
    .sort((a, b) => Number(b.rescued) - Number(a.rescued));
  // The Lag gang: mugshots in the briefing, the defeated count at the end.
  const foes: FoeView[] = (done ? s.stats.enemies : s.briefCounts.enemies) > 0 ? ENEMY_KINDS.map((k) => ({ name: m.gang[k], style: session.foeStyle(k, 72), count: s.stats.defeatedByKind[k] })) : [];
  const exit = () => session.exit();
  return (
    <div className="dz-ui">
      <Alarm strong={s.phase === "briefing" || s.phase === "loading"} />
      {(s.phase === "loading" || s.phase === "briefing" || s.phase === "error") && (
        <Briefing m={m} people={kinds} foes={foes} count={s.briefCounts.people} hero={(i) => session.heroStyle(110, i)} ready={s.phase === "briefing"} error={s.phase === "error"} muted={s.muted} onStart={() => session.begin()} onCancel={exit} onMute={() => session.setMuted(!s.muted)} />
      )}
      {(s.phase === "playing" || s.phase === "paused") && (
        <Hud m={m} people={run} stats={s.stats} muted={s.muted} controller={s.controller} onPause={() => session.pause(true)} onExit={exit} onMute={() => session.setMuted(!s.muted)} onRestart={() => session.restart()} onUnstuck={() => session.unstuck()} />
      )}
      {s.phase === "playing" && s.touch && <TouchPad m={m} touch={session.touchState} />}
      {s.phase === "paused" && <PauseMenu m={m} resized={s.resized} onResume={() => session.pause(false)} onExit={exit} onRestart={() => session.restart()} onUnstuck={() => { session.unstuck(); session.pause(false); }} />}
      {s.phase === "failed" && <FailedScreen m={m} stats={s.stats} cause={s.failure} onAgain={() => session.restart()} onRebuild={exit} />}
      {s.phase === "complete" && <CompleteScreen m={m} people={kinds} foes={foes} stats={s.stats} onRebuild={exit} onKeep={() => session.keepPlaying()} onAgain={() => session.begin()} />}
    </div>
  );
}
