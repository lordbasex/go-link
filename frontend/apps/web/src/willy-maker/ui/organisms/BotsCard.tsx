// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The Export tab's "Test with bots" (experiment 1's verdict, T-08): every
// bot of qa/bots.ts plays each level in play order with the game's rules,
// one at a time so the page stays responsive, and what they find is listed
// with Go to the place and the shortest moves that still show it.

import { useEffect, useRef, useState } from "react";
import { useExportMessages } from "../../i18n";
import type { Level, Project } from "../../model";
import { BOTS, harnessScript, minimize, report, runBot, type BotResult, type Finding, type QaReport } from "../../qa/bots";
import type { Target } from "../../editor/validate";
import { Capsule, Card, Eyebrow } from "../atoms";
import { IconCopy } from "../icons";

const FUZZ_SEEDS = [1, 2, 3];

type State = { kind: "idle" } | { kind: "running"; done: number; total: number } | { kind: "done"; reports: { level: Level; qa: QaReport }[] };

function levelsInOrder(project: Project): Level[] {
  const order = (project.settings.levels ?? []).map((id) => project.levels.find((l) => l.id === id)).filter((l): l is Level => !!l);
  return order.length ? order : project.levels;
}

export function BotsCard({ project, onGo }: { project: Project; onGo: (target: Target) => void }) {
  const all = useExportMessages();
  const t = all.bots;
  const [state, setState] = useState<State>({ kind: "idle" });
  const [copied, setCopied] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = async () => {
    const levels = levelsInOrder(project);
    const plan = levels.flatMap((level) => BOTS.flatMap((b) => (b.id === "fuzz" ? FUZZ_SEEDS : [1]).map((seed) => ({ level, bot: b.id, seed }))));
    const results = new Map<string, BotResult[]>();
    setState({ kind: "running", done: 0, total: plan.length });
    for (let i = 0; i < plan.length; i++) {
      // one bot per task, so the page keeps drawing between them
      await new Promise((r) => setTimeout(r, 0));
      if (!alive.current) return;
      const { level, bot, seed } = plan[i]!;
      const r = runBot(project, level, bot, { seed });
      results.set(level.id, [...(results.get(level.id) ?? []), r]);
      setState({ kind: "running", done: i + 1, total: plan.length });
    }
    setState({ kind: "done", reports: levels.map((l) => ({ level: l, qa: report(l, results.get(l.id) ?? []) })) });
  };

  const copyScript = async (level: Level, f: Finding, bots: BotResult[]) => {
    const bot = bots.find((b) => b.bot === f.bot && b.findings.some((x) => x.kind === f.kind && x.frame === f.frame));
    if (!bot) return;
    const moves = minimize(project, level, bot, f);
    const text = JSON.stringify(harnessScript(moves, `${level.id}-${f.kind}-${f.bot}`), null, 1);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${f.kind}:${f.frame}`);
    } catch {
      setCopied(null);
    }
  };

  const outcome = (b: BotResult) => (b.cleared ? t.cleared(Math.round((b.clearFrame ?? 0) / 6) / 10) : b.over ? t.over : t.reached(b.maxX)) + t.lost(b.livesLost);

  return (
    <Card className="wm-export-card wm-bots">
      <Eyebrow accent>{t.title}</Eyebrow>
      <p className="wm-dim">{t.text}</p>
      <Capsule tone="primary" size="lg" disabled={state.kind === "running"} onClick={() => void run()}>
        {state.kind === "running" ? t.running(state.done, state.total) : state.kind === "done" ? t.again : t.run}
      </Capsule>
      {state.kind === "running" && <progress className="wm-bots-progress" max={state.total} value={state.done} aria-label={t.title} />}
      {state.kind === "done" &&
        state.reports.map(({ level, qa: r }) => {
          return (
            <section key={level.id} className="wm-bots-level" aria-label={t.level(level.name)}>
              <h3 className="wm-h is-sm">{t.level(level.name)}</h3>
              <ul className="wm-bots-list">
                {r.bots
                  .filter((b, i, all) => b.bot !== "fuzz" || all.findIndex((x) => x.bot === "fuzz") === i)
                  .map((b) => (
                    <li key={`${b.bot}-${b.seed}`} className="wm-small">
                      <b>{t.names[b.bot]}</b> <span className="wm-dim">{outcome(b)}</span>
                    </li>
                  ))}
              </ul>
              {r.findings.length === 0 ? (
                <p className="wm-note is-ok wm-small" role="status">
                  {t.ok}
                </p>
              ) : (
                <ul className="wm-bots-findings">
                  {r.findings.map((f) => (
                    <li key={`${f.kind}-${f.frame}-${f.x}`} className={`wm-note wm-small ${f.severity === "high" ? "is-error" : f.severity === "medium" ? "is-warn" : ""}`}>
                      <span className="wm-bots-sev">{t.severity[f.severity]}</span>
                      <span>{t.kinds[f.kind]({ x: f.x, left: f.enemiesLeft })}</span>
                      <span className="wm-dim">{t.by(t.names[f.bot], Math.round(f.frame / 6) / 10)}</span>
                      <span className="wm-row">
                        <Capsule size="sm" onClick={() => onGo({ tab: "build", level: level.id, x: f.x, y: f.y })}>
                          {all.review.go}
                        </Capsule>
                        <Capsule size="sm" title={t.scriptTip} onClick={() => void copyScript(level, f, r.bots)}>
                          <IconCopy /> {copied === `${f.kind}:${f.frame}` ? t.scriptCopied : t.script}
                        </Capsule>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      <p className="wm-dim wm-small">{t.note}</p>
    </Card>
  );
}
