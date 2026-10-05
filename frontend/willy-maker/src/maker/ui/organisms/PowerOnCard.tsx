// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The Export tab's power-on test (validation level 3): the user drops a ROM
// .zip (for example the one an AI built from the pack) and watches each
// step pass or fail as the Worker reports it, then sees what the board drew.
// With a linked go-link online, the same .zip can then be powered on with
// the exact core on the device (validation level 4, DeviceRomTest).

import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { STEP_IDS, type PowerOnResult, type PowerOnStep } from "@go-link/cps1-sim";
import { ROM_TEST_MAX_SIZE, testRomOnDevice, type RomTestResult } from "@go-link/shared";
import { useExportMessages, type ExportMessages } from "../../i18n";
import { startPowerOn, type PowerOnRun } from "../../power/client";
import { Capsule, Card, Eyebrow } from "../atoms";
import { MY_DEVICE_HREF, useMakerDevice } from "../device";
import { IconCheck, IconCircle, IconUpload, IconX } from "../icons";

type State = { kind: "idle" } | { kind: "running"; name: string; steps: PowerOnStep[] } | { kind: "done"; name: string; result: PowerOnResult } | { kind: "error"; name: string; message: string };

export function PowerOnCard() {
  const t = useExportMessages().powerOn;
  const [state, setState] = useState<State>({ kind: "idle" });
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const run = useRef<PowerOnRun | null>(null);
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => () => run.current?.cancel(), []);

  const test = async (file: File) => {
    run.current?.cancel();
    setFile(file);
    const name = file.name;
    setState({ kind: "running", name, steps: [] });
    try {
      const zip = new Uint8Array(await file.arrayBuffer());
      const r = startPowerOn(zip, (step) => setState((s) => (s.kind === "running" && s.name === name ? { ...s, steps: [...s.steps, step] } : s)));
      run.current = r;
      const result = await r.result;
      if (run.current === r) setState({ kind: "done", name, result });
    } catch (e) {
      const message = (e as Error).message;
      if (message !== "cancelled") setState({ kind: "error", name, message });
    }
  };

  const shot = state.kind === "done" ? state.result.shot : undefined;
  useEffect(() => {
    const c = canvas.current;
    if (!c || !shot) return;
    c.width = shot.w;
    c.height = shot.h;
    c.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(shot.rgba), shot.w, shot.h), 0, 0);
  }, [shot]);

  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void test(file);
  };

  const steps = state.kind === "running" ? state.steps : state.kind === "done" ? state.result.steps : [];
  const running = state.kind === "running";
  const chip = state.kind === "done" ? (state.result.ok ? { cls: "is-ok", text: t.passed } : { cls: "is-bad", text: t.failed }) : null;

  return (
    <Card className="wm-export-card wm-power" onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <div className="wm-row">
        <Eyebrow accent>{t.title}</Eyebrow>
        <span className="wm-chip is-on">{t.stage}</span>
      </div>
      <p className="wm-dim">{t.text}</p>
      <div className={`wm-power-drop${over ? " is-over" : ""}`}>
        <span className="wm-small wm-dim">{t.drop}</span>
        <Capsule tone={state.kind === "idle" ? "primary" : undefined} disabled={running} onClick={() => input.current?.click()}>
          <IconUpload /> {state.kind === "idle" ? t.choose : t.again}
        </Capsule>
        <input
          ref={input}
          type="file"
          accept=".zip,application/zip"
          className="wm-sr"
          tabIndex={-1}
          aria-label={t.choose}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void test(file);
          }}
        />
      </div>
      {state.kind !== "idle" && (
        <div className="wm-row wm-power-head" role="status" aria-busy={running || undefined}>
          <span className="wm-mono wm-small wm-power-name">{running ? t.running(state.name) : state.name}</span>
          {chip && <span className={`wm-chip wm-power-chip ${chip.cls}`}>{chip.text}</span>}
        </div>
      )}
      {state.kind === "error" && (
        <p className="wm-note is-error wm-small" role="alert">
          {t.error(state.message)}
        </p>
      )}
      {steps.length > 0 || running ? (
        <ul className="wm-checks wm-power-steps" aria-label={t.title}>
          {STEP_IDS.map((id) => {
            const s = steps.find((x) => x.name === id);
            const cls = !s ? "is-todo" : s.skipped ? "is-skip" : s.ok ? "is-ok" : "is-bad";
            const Icon = !s || s.skipped ? IconCircle : s.ok ? IconCheck : IconX;
            return (
              <li key={id} className={cls}>
                <Icon />
                <span>
                  <strong>{t.steps[id]}</strong>
                  {s && <span className="wm-power-detail">{t.codes[s.code](s.params)}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {state.kind === "done" && (
        <>
          {shot && (
            <figure className="wm-power-shot">
              <canvas ref={canvas} role="img" aria-label={t.shot(shot.frame)} />
              <figcaption className="wm-small wm-dim">{t.shot(shot.frame)}</figcaption>
            </figure>
          )}
          <p className="wm-small wm-dim">{t.summary(state.result.frames, state.result.ms)}</p>
        </>
      )}
      <p className="wm-small wm-dim">{t.limits}</p>
      {file && state.kind !== "running" && <DeviceRomTest key={`${file.name}-${file.size}-${file.lastModified}`} file={file} browserSet={state.kind === "done" ? state.result.set : undefined} />}
    </Card>
  );
}

type DeviceT = ExportMessages["powerOn"]["device"];

type DeviceState = { kind: "idle" } | { kind: "uploading"; pct: number } | { kind: "running" } | { kind: "done"; result: RomTestResult } | { kind: "error"; message: string };

const SET_NAME = /^[a-z0-9_]{1,16}$/;

/** The set to ask for: the .zip's name, else the one the browser test read. */
export function setNameOf(fileName: string, browserSet?: string): string | null {
  const stem = fileName.replace(/\.zip$/i, "").toLowerCase();
  if (SET_NAME.test(stem)) return stem;
  return browserSet && SET_NAME.test(browserSet) ? browserSet : null;
}

/** A translated reason for a test that did not run (busy, not found, timeout...). */
function failureText(t: DeviceT, e: { code?: string; error?: string; message?: string }): string {
  if (e.code === "busy") return t.busy;
  if (e.code === "not_found") return t.notFound;
  const m = e.error ?? e.message ?? "";
  if (/did not answer in time/.test(m)) return t.timeout;
  if (/channel not open|connection closed/.test(m)) return t.lost;
  if (/at most 16 MB/.test(m)) return t.tooBig;
  if (/bad set name/.test(m)) return t.badName;
  return t.error(m);
}

/** Validation level 4: the same .zip on the owner's go-link, with its exact core. */
export function DeviceRomTest({ file, browserSet }: { file: File; browserSet?: string }) {
  const t = useExportMessages().powerOn.device;
  const device = useMakerDevice();
  const [state, setState] = useState<DeviceState>({ kind: "idle" });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const link = device?.link ?? null;
  const openMyDevice = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!device?.openMyDevice) return;
    e.preventDefault();
    device.openMyDevice();
  };

  if (!device || !link) {
    return (
      <div className="wm-device-test">
        <Eyebrow>{t.title}</Eyebrow>
        <p className="wm-note wm-small" role="note">
          {device?.linked ? t.offline : t.noDevice}{" "}
          <a href={device?.myDeviceHref ?? MY_DEVICE_HREF} onClick={openMyDevice}>
            {t.myDevice}
          </a>
        </p>
        {device?.connect && (
          <Capsule tone="primary" onClick={device.connect}>
            {t.connect}
          </Capsule>
        )}
      </div>
    );
  }

  const start = async () => {
    const set = setNameOf(file.name, browserSet);
    if (!set) return setState({ kind: "error", message: t.badName });
    if (file.size > ROM_TEST_MAX_SIZE) return setState({ kind: "error", message: t.tooBig });
    setState({ kind: "uploading", pct: 0 });
    try {
      const result = await testRomOnDevice(link, device.onMessage, file, set, {
        onUpload: (sent, total) => {
          if (!alive.current) return;
          setState(sent >= total ? { kind: "running" } : { kind: "uploading", pct: Math.round((sent / Math.max(1, total)) * 100) });
        },
      });
      if (!alive.current) return;
      if ((result.error || result.code) && result.steps.length === 0) setState({ kind: "error", message: failureText(t, result) });
      else setState({ kind: "done", result });
    } catch (e) {
      if (alive.current) setState({ kind: "error", message: failureText(t, { message: (e as Error).message }) });
    }
  };

  const busy = state.kind === "uploading" || state.kind === "running";
  const result = state.kind === "done" ? state.result : null;
  return (
    <div className="wm-device-test">
      <div className="wm-row">
        <Eyebrow>{t.title}</Eyebrow>
        {device.name && <span className="wm-chip">{t.on(device.name)}</span>}
      </div>
      <p className="wm-small wm-dim">{t.text}</p>
      <Capsule tone={state.kind === "idle" ? "primary" : undefined} disabled={busy} onClick={() => void start()}>
        {state.kind === "idle" ? t.test : t.again}
      </Capsule>
      {busy && (
        <p className="wm-small wm-dim" role="status" aria-busy="true">
          {state.kind === "uploading" ? t.uploading(state.pct) : t.running}
        </p>
      )}
      {state.kind === "error" && (
        <p className="wm-note is-error wm-small" role="alert">
          {state.message}
        </p>
      )}
      {result && (
        <>
          <div className="wm-row wm-power-head" role="status">
            <span className="wm-mono wm-small wm-power-name">{`${result.set}.zip`}</span>
            <span className={`wm-chip wm-power-chip ${result.ok ? "is-ok" : "is-bad"}`}>{result.ok ? t.passed : t.failed}</span>
          </div>
          {result.error && (
            <p className="wm-note is-error wm-small" role="alert">
              {failureText(t, result)}
            </p>
          )}
          {result.own && <p className="wm-small">{t.own(result.own.title)}</p>}
          <ul className="wm-checks wm-power-steps" aria-label={t.title}>
            {result.steps.map((s, i) => {
              const Icon = s.ok ? IconCheck : IconX;
              return (
                <li key={`${s.name}-${i}`} className={s.ok ? "is-ok" : "is-bad"}>
                  <Icon />
                  <span>
                    <strong>{(t.steps as Record<string, string | undefined>)[s.name] ?? s.name}</strong>
                    {s.detail && <span className="wm-power-detail">{s.detail}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          {result.shot && (
            <figure className="wm-power-shot">
              <img src={result.shot} alt={t.shot} />
              <figcaption className="wm-small wm-dim">{t.shot}</figcaption>
            </figure>
          )}
          <p className="wm-small wm-dim">{t.summary(result.frames, result.seconds)}</p>
        </>
      )}
    </div>
  );
}
