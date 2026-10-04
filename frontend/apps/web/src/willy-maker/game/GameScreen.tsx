// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The Game tab: players and the actions the board layout fixes (with
// editable labels and the run window), each player's character, "Your
// controller", the DIP switches, and the live checks of the game settings
// and menus. Every change is a command on the editor store.

import { layoutOf } from "../board/cps1";
import type { EditorStore } from "../editor/store";
import { BUILTIN_HERO, RUN_TAP_MAX, RUN_TAP_MIN, type DipSettings, type Project, type ValidationIssue } from "../model";
import { rulesWith, type GameRules } from "../engine/rules";
import { measureJump } from "../engine/jump";
import { Capsule, Eyebrow, Segmented } from "../ui/atoms";
import { IconWarn } from "../ui/icons";
import { StatusBadge } from "../ui/molecules";
import { partSupport } from "../editor/support";
import { ControllerPanel } from "./ControllerPanel";
import { actionLabel, actionRows, heroChoices, levelHeroes, playerSlots, runTapMs, setActionLabel, setDip, setPlayerSlot, setPlayers, setRules, setRunTap, slotResolves } from "./settings";
import { fill, issueText, useGameText, useMenusText } from "./texts";
import { QuizCard } from "./QuizCard";
import "./game.css";

export interface GameScreenProps {
  store: EditorStore;
  project: Project;
  /** The live checks (editor/validate/game.ts). */
  issues: ValidationIssue[];
  /** Opens where an issue points. */
  onGo: (target: NonNullable<ValidationIssue["target"]>) => void;
}

const SHIRTS = ["own", "r1", "r2", "r3"] as const;

export function GameScreen({ store, project, issues, onGo }: GameScreenProps) {
  const t = useGameText();
  const layout = layoutOf(project);
  const s = project.settings;
  const slots = playerSlots(project);
  const choices = heroChoices(project);
  const label = (id: "jump" | "fire" | "special") => actionLabel(project, id, t.actions.names[id]);

  return (
    <div className="wm-game">
      <section className="wm-game-card wm-card" aria-labelledby="wm-players-title">
        <h2 id="wm-players-title" className="wm-h is-accent">
          {t.players.title}
        </h2>
        <Segmented
          label={t.players.count}
          value={s.players}
          options={Array.from({ length: layout.players }, (_, i) => ({ value: i + 1, label: fill(t.players.option, { n: i + 1 }) }))}
          onChange={(n) => setPlayers(store, n, layout.players, t.undo.players)}
        />
        <p className="wm-dim wm-small">
          {fill(t.players.board, { layout: layout.id, players: layout.players, buttons: layout.buttons })}
          {layout.buttons < 3 ? ` ${t.players.combo}` : ""}
        </p>

        <Eyebrow>{t.actions.title}</Eyebrow>
        <table className="wm-game-actions">
          <thead>
            <tr>
              <th scope="col">{t.actions.input}</th>
              <th scope="col">{t.actions.label}</th>
            </tr>
          </thead>
          <tbody>
            {actionRows(layout).map((row) => (
              <tr key={row.id}>
                <td>
                  <span className="wm-chip is-on wm-mono">{row.input}</span>
                </td>
                <td>
                  <input
                    className="wm-input is-sm"
                    aria-label={fill(t.actions.labelFor, { action: t.actions.names[row.id] })}
                    placeholder={t.actions.names[row.id]}
                    maxLength={24}
                    value={s.actionLabels?.[row.id] ?? ""}
                    onChange={(e) => setActionLabel(store, row.id, e.target.value, t.undo.action)}
                  />
                  <span className="wm-dim wm-small wm-game-help">{t.actions.help[row.id]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="wm-dim wm-small">{t.actions.fixed}</p>
        <label className="wm-game-range">
          <span>{t.actions.runWindow}</span>
          <input type="range" min={RUN_TAP_MIN} max={RUN_TAP_MAX} step={10} value={runTapMs(project)} onChange={(e) => setRunTap(store, Number(e.target.value), t.undo.run)} />
          <span className="wm-mono">{fill(t.actions.ms, { ms: runTapMs(project) })}</span>
        </label>

        <Eyebrow>{t.characters.title}</Eyebrow>
        <ul className="wm-game-slots">
          {slots.map((slot, i) => {
            const active = i < s.players;
            const ok = slotResolves(project, slot);
            const known = choices.some((c) => c.id === slot.character);
            return (
              <li key={i} className={`wm-game-slot${active ? "" : " is-off"}${active && !ok ? " is-bad" : ""}`}>
                <span className={`wm-game-dot is-p${i + 1}`} aria-hidden="true">
                  {i + 1}
                </span>
                <span className="wm-game-slot-name">{fill(t.characters.player, { n: i + 1 })}</span>
                <select
                  className="wm-input is-sm"
                  aria-label={fill(t.characters.character, { n: i + 1 })}
                  value={known ? slot.character : ""}
                  onChange={(e) => setPlayerSlot(store, i, { ...slot, character: e.target.value }, t.undo.character)}
                >
                  {!known && <option value="">{slot.character ? t.characters.deleted : t.characters.missing}</option>}
                  {choices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id === BUILTIN_HERO ? t.characters.builtin : c.name}
                    </option>
                  ))}
                </select>
                {/* shirts recolor the built-in Willy only: an own hero keeps its colors */}
                {slot.character === BUILTIN_HERO && (
                  <select
                    className="wm-input is-sm"
                    aria-label={fill(t.characters.shirt, { n: i + 1 })}
                    value={slot.variant}
                    onChange={(e) => setPlayerSlot(store, i, { ...slot, variant: Number(e.target.value) }, t.undo.character)}
                  >
                    {SHIRTS.map((k, v) => (
                      <option key={k} value={v}>
                        {t.characters.shirts[k]}
                      </option>
                    ))}
                  </select>
                )}
                {!active && <span className="wm-dim wm-small">{t.characters.inactive}</span>}
              </li>
            );
          })}
        </ul>
      </section>

      <ControllerPanel labels={{ b1: label("jump"), b2: label("fire"), b3: label("special") }} />

      <div className="wm-game-col">
        <DipCard store={store} dip={s.dip} />
        <RulesCard store={store} saved={s.rules} />
        {rulesWith(s.rules).quiz && <QuizCard store={store} questions={project.quiz ?? []} />}
        <IssuesCard issues={issues} onGo={onGo} />
      </div>
    </div>
  );
}

function DipCard({ store, dip }: { store: EditorStore; dip: DipSettings }) {
  const t = useGameText();
  const set = (patch: Partial<DipSettings>) => setDip(store, patch, t.undo.dip);
  const yesNo = [
    { value: "yes", label: t.dip.yes },
    { value: "no", label: t.dip.no },
  ] as const;
  return (
    <section className="wm-game-card wm-card" aria-labelledby="wm-dip-title">
      <h2 id="wm-dip-title" className="wm-h is-accent">
        {t.dip.title}
      </h2>
      <div className="wm-game-stack">
        <span className="wm-field-label">
          {t.dip.difficulty} <StatusBadge support={partSupport("dip:difficulty")} />
        </span>
        <Segmented
          label={t.dip.difficulty}
          value={dip.difficulty}
          options={(["easy", "normal", "hard", "lag"] as const).map((d) => ({ value: d, label: t.dip.difficulties[d] }))}
          onChange={(difficulty) => set({ difficulty })}
        />
      </div>
      <div className="wm-game-stack">
        <span className="wm-field-label">{t.dip.lives}</span>
        <Segmented label={t.dip.lives} value={dip.lives} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} onChange={(lives) => set({ lives })} />
      </div>
      <div className="wm-game-stack">
        <span className="wm-field-label">
          {t.dip.freePlay} <StatusBadge support={partSupport("dip:freePlay")} />
        </span>
        <Segmented label={t.dip.freePlay} value={dip.freePlay ? "yes" : "no"} options={[...yesNo]} onChange={(v) => set({ freePlay: v === "yes" })} />
      </div>
      <div className="wm-game-stack">
        <span className="wm-field-label">
          {t.dip.demoSound} <StatusBadge support={partSupport("dip:demoSound")} />
        </span>
        <Segmented label={t.dip.demoSound} value={dip.demoSound ? "yes" : "no"} options={[...yesNo]} onChange={(v) => set({ demoSound: v === "yes" })} />
      </div>
      <p className="wm-dim wm-small">{t.dip.note}</p>
    </section>
  );
}

function RulesCard({ store, saved }: { store: EditorStore; saved: Partial<GameRules> | undefined }) {
  const t = useGameText();
  const r = rulesWith(saved);
  const set = (patch: Partial<GameRules>) => setRules(store, patch, t.undo.rules);
  const yesNo = [
    { value: "yes", label: t.rules.yes },
    { value: "no", label: t.rules.no },
  ] as const;
  const flag = (key: "touchHurts" | "enemiesChase" | "enemiesShoot" | "exitNeedsEnemies" | "doubleJump" | "jetpack" | "weapons" | "stomp" | "depth" | "crosshair" | "ship" | "vertical" | "topdown" | "maze" | "puzzle" | "puzzleCpu" | "quiz" | "versus") => (
    <div className="wm-game-stack" key={key}>
      <span className="wm-field-label">{t.rules[key]}</span>
      <Segmented label={t.rules[key]} value={r[key] ? "yes" : "no"} options={[...yesNo]} onChange={(v) => set({ [key]: v === "yes" })} />
    </div>
  );
  const number = (key: "enemyHp" | "enemyScore" | "rescueScore" | "crateScore" | "mazeRounds", min: number, max: number, step: number) => (
    <label className="wm-game-stack wm-rules-num" key={key}>
      <span className="wm-field-label">{t.rules[key]}</span>
      <input
        className="wm-input is-sm wm-mono"
        type="number"
        min={min}
        max={max}
        step={step}
        value={r[key]}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && e.target.value !== "") set({ [key]: Math.max(min, Math.min(max, Math.round(v))) });
        }}
      />
    </label>
  );
  return (
    <section className="wm-game-card wm-card" aria-labelledby="wm-rules-title">
      <h2 id="wm-rules-title" className="wm-h is-accent">
        {t.rules.title}
      </h2>
      <p className="wm-dim wm-small">{t.rules.help}</p>
      <div className="wm-grid2 is-tight">
        {number("enemyHp", 1, 99, 1)}
        {number("enemyScore", 0, 9900, 100)}
        {number("rescueScore", 0, 9900, 100)}
        {number("crateScore", 0, 9900, 100)}
      </div>
      {flag("touchHurts")}
      {flag("enemiesChase")}
      {flag("enemiesShoot")}
      {flag("exitNeedsEnemies")}
      {flag("doubleJump")}
      {flag("jetpack")}
      {flag("weapons")}
      {flag("stomp")}
      {flag("depth")}
      {flag("crosshair")}
      {flag("ship")}
      {flag("vertical")}
      {flag("topdown")}
      {flag("maze")}
      {r.maze && number("mazeRounds", 1, 9, 1)}
      {flag("puzzle")}
      {r.puzzle && flag("puzzleCpu")}
      {flag("quiz")}
      {flag("versus")}
      <p className="wm-dim wm-small" role="status">
        {fill(t.rules.jump, { ...measureJump(r, Math.min(...levelHeroes(store.project).heights)) })}
      </p>
      <div className="wm-game-stack">
        <span className="wm-field-label">{t.rules.crateClimb}</span>
        <Segmented
          label={t.rules.crateClimb}
          value={r.crateClimb}
          options={[
            { value: "jump", label: t.rules.climbJump },
            { value: "push", label: t.rules.climbPush },
          ]}
          onChange={(v) => set({ crateClimb: v === "push" ? "push" : "jump" })}
        />
      </div>
      <div className="wm-game-stack">
        <span className="wm-field-label">{t.rules.extraPorts}</span>
        <Segmented
          label={t.rules.extraPorts}
          value={r.extraPorts}
          options={[
            { value: "soon", label: t.rules.portsSoon },
            { value: "ignore", label: t.rules.portsIgnore },
          ]}
          onChange={(v) => set({ extraPorts: v === "ignore" ? "ignore" : "soon" })}
        />
      </div>
      <div className="wm-game-stack">
        <span className="wm-field-label">{t.rules.respawnOnHurt}</span>
        <Segmented
          label={t.rules.respawnOnHurt}
          value={r.respawnOnHurt ? "respawn" : "stay"}
          options={[
            { value: "respawn", label: t.rules.respawn },
            { value: "stay", label: t.rules.stay },
          ]}
          onChange={(v) => set({ respawnOnHurt: v === "respawn" })}
        />
      </div>
      <label className="wm-game-range">
        <span>{t.rules.hurtFrames}</span>
        <input type="range" min={0} max={240} step={10} value={r.hurtFrames} aria-label={t.rules.hurtFrames} onChange={(e) => set({ hurtFrames: Number(e.target.value) })} />
        <span className="wm-mono">{fill(t.rules.frames, { n: r.hurtFrames, s: Math.round((r.hurtFrames / 60) * 10) / 10 })}</span>
      </label>
      <p className="wm-dim wm-small">{t.rules.note}</p>
      <Capsule size="sm" disabled={!saved} onClick={() => setRules(store, null, t.undo.rules)}>
        {t.rules.reset}
      </Capsule>
    </section>
  );
}

export function IssuesCard({ issues, onGo }: { issues: ValidationIssue[]; onGo: GameScreenProps["onGo"] }) {
  const t = useGameText();
  const m = useMenusText();
  return (
    <section className="wm-game-card wm-card" aria-labelledby="wm-issues-title">
      <h2 id="wm-issues-title" className="wm-h">
        {t.issues.title}
      </h2>
      {issues.length === 0 ? (
        <p className="wm-dim wm-small">{t.issues.none}</p>
      ) : (
        <ul className="wm-checks">
          {issues.map((issue, i) => (
            <li key={`${issue.id}:${i}`} className={issue.severity === "error" ? "is-bad" : issue.severity === "warning" ? "is-warn" : "is-ok"}>
              <IconWarn />
              <span>{issueText(issue, t, m)}</span>
              {issue.target && (
                <Capsule size="sm" onClick={() => onGo(issue.target!)}>
                  {t.issues.go}
                </Capsule>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
