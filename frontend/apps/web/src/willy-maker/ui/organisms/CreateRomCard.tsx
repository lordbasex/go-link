// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The Export tab's Create ROM (stage 2, docs/willy-maker/engine.md): packs
// the game next to the prebuilt engine, then powers the result on in the
// board model at once (validation level 3), shows what it drew and offers
// the .zip, its symbol map and "Play on my go-link" (the same .zip powered
// on with the real core of the linked device, validation level 4).

import { useEffect, useMemo, useRef, useState } from "react";
import { STEP_IDS, type PowerOnResult, type PowerOnStep } from "@go-link/cps1-sim";
import { useExportMessages } from "../../i18n";
import type { Project } from "../../model";
import { startPowerOn, type PowerOnRun } from "../../power/client";
import { CREATE_STEPS, createRom, type CreatedRom, type CreateStep } from "../../rom/createRom";
import { Capsule, Card } from "../atoms";
import { IconCheck, IconCircle, IconDownload, IconX } from "../icons";
import { downloadBytes } from "../download";
import { DeviceRomTest } from "./PowerOnCard";

type Step = CreateStep | "test";
const STEPS: Step[] = [...CREATE_STEPS, "test"];

type State =
  | { kind: "idle" }
  | { kind: "working"; step: Step; rom?: CreatedRom; tests: PowerOnStep[] }
  | { kind: "done"; rom: CreatedRom; result: PowerOnResult }
  | { kind: "error"; step: Step; message: string };

export function CreateRomCard({ project, blocked }: { project: Project; blocked: boolean }) {
  const t = useExportMessages().rom;
  const p = useExportMessages().powerOn;
  const [state, setState] = useState<State>({ kind: "idle" });
  const [play, setPlay] = useState(false);
  const run = useRef<PowerOnRun | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const playRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => run.current?.cancel(), []);

  const create = async () => {
    run.current?.cancel();
    setPlay(false);
    let step: Step = "engine";
    setState({ kind: "working", step, tests: [] });
    try {
      const rom = await createRom(project, (s) => {
        step = s;
        setState({ kind: "working", step: s, tests: [] });
      });
      step = "test";
      setState({ kind: "working", step, rom, tests: [] });
      const r = startPowerOn(rom.zip, (s) => setState((st) => (st.kind === "working" ? { ...st, tests: [...st.tests, s] } : st)));
      run.current = r;
      const result = await r.result;
      if (run.current === r) setState({ kind: "done", rom, result });
    } catch (e) {
      const message = (e as Error).message;
      if (message !== "cancelled") setState({ kind: "error", step, message });
    }
  };

  const shot = state.kind === "done" ? state.result.shot : undefined;
  useEffect(() => {
    const c = canvas.current;
    if (!c || !shot) return;
    c.width = shot.w;
    c.height = shot.h;
    c.getContext?.("2d")?.putImageData(new ImageData(new Uint8ClampedArray(shot.rgba), shot.w, shot.h), 0, 0);
  }, [shot]);
  useEffect(() => {
    if (play) playRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [play]);

  const working = state.kind === "working";
  const rom = state.kind === "done" ? state.rom : state.kind === "working" ? state.rom : undefined;
  const tests = state.kind === "done" ? state.result.steps : state.kind === "working" ? state.tests : [];
  const stepIndex = state.kind === "working" || state.kind === "error" ? STEPS.indexOf(state.step) : state.kind === "done" ? STEPS.length : -1;
  const notes = rom?.pack.notes ?? [];
  const done = state.kind === "done" ? state.rom : null;
  const file = useMemo(() => (done ? new File([done.zip as Uint8Array<ArrayBuffer>], done.name, { type: "application/zip" }) : null), [done]);

  return (
    <Card className="wm-export-card wm-rom-card is-live" aria-busy={working || undefined}>
      <div className="wm-row">
        <span className="wm-h is-violet">{t.title}</span>
        <span className="wm-chip is-violet">{t.stage}</span>
      </div>
      <p className="wm-dim">{t.text}</p>
      <Capsule tone="primary" size="lg" disabled={working || blocked} onClick={() => void create()} data-testid="wm-create-rom">
        {working ? t.creating : state.kind === "idle" ? t.create : t.again}
      </Capsule>
      {state.kind !== "idle" && (
        <ul className="wm-checks wm-rom-steps" aria-label={t.title}>
          {STEPS.map((s, i) => {
            const failed = state.kind === "error" && i === stepIndex;
            const testFailed = s === "test" && state.kind === "done" && !state.result.ok;
            const done = i < stepIndex && !failed;
            const cls = failed || testFailed ? "is-bad" : done ? "is-ok" : i === stepIndex ? "is-run" : "is-todo";
            const Icon = failed || testFailed ? IconX : done ? IconCheck : IconCircle;
            return (
              <li key={s} className={cls}>
                <Icon /> <span>{t.steps[s]}</span>
              </li>
            );
          })}
        </ul>
      )}
      {state.kind === "error" && (
        <p className="wm-note is-error wm-small" role="alert">
          {t.error(state.message)}
        </p>
      )}
      {tests.length > 0 && (
        <ul className="wm-checks wm-power-steps" aria-label={t.steps.test}>
          {STEP_IDS.map((id) => {
            const s = tests.find((x) => x.name === id);
            const cls = !s ? "is-todo" : s.skipped ? "is-skip" : s.ok ? "is-ok" : "is-bad";
            const Icon = !s || s.skipped ? IconCircle : s.ok ? IconCheck : IconX;
            return (
              <li key={id} className={cls}>
                <Icon />
                <span>
                  <strong>{p.steps[id]}</strong>
                  {s && <span className="wm-power-detail">{p.codes[s.code](s.params)}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {state.kind === "done" && (
        <>
          <div className="wm-row wm-power-head" role="status">
            <span className="wm-mono wm-small wm-power-name">{t.ready(state.rom.name, Math.ceil(state.rom.zip.length / 1024))}</span>
            <span className={`wm-chip wm-power-chip ${state.result.ok ? "is-ok" : "is-bad"}`}>{state.result.ok ? t.passed : t.failed}</span>
          </div>
          <p className="wm-small wm-dim">{t.stats(state.rom.pack.stats)}</p>
          {shot && (
            <figure className="wm-power-shot">
              <canvas ref={canvas} role="img" aria-label={t.shot(shot.frame)} />
              <figcaption className="wm-small wm-dim">{t.shot(shot.frame)}</figcaption>
            </figure>
          )}
          <div className="wm-row wm-export-actions">
            <Capsule tone="primary" size="lg" onClick={() => downloadBytes(state.rom.zip, state.rom.name, "application/zip")} data-testid="wm-rom-download">
              <IconDownload /> {t.download}
            </Capsule>
            <Capsule size="lg" onClick={() => setPlay(true)} data-testid="wm-rom-play">
              {t.play}
            </Capsule>
            <Capsule size="sm" title={t.symbolsTip} onClick={() => downloadBytes(new TextEncoder().encode(state.rom.symbols), "symbols.json", "application/json")} data-testid="wm-rom-symbols">
              <IconDownload /> {t.symbols}
            </Capsule>
          </div>
          {play && (
            <div ref={playRef} className="wm-rom-play">
              <p className="wm-small wm-dim">{t.playText}</p>
              {file && <DeviceRomTest key={file.size + state.rom.name + state.rom.pack.stats.dataBytes} file={file} browserSet="slammast" />}
            </div>
          )}
        </>
      )}
      {notes.length > 0 && (
        <div className="wm-note is-warn wm-small" role="note">
          <strong>{t.notesTitle}</strong>
          <ul>
            {notes.map((n) => (
              <li key={n.id}>{(t.notes[n.id] ?? (() => n.id))(n.params ?? {})}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="wm-small wm-dim">{t.note}</p>
    </Card>
  );
}
