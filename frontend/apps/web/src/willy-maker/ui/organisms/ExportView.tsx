// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The Export tab: the review before exporting (validation level 1, live,
// with Go and Fix), the project .zip, the AI pack with its prompt, Create
// ROM, shown as the next stage, and the power-on test of a ROM .zip.

import { useEffect, useMemo, useRef, useState } from "react";
import { useExportMessages } from "../../i18n";
import type { Project } from "../../model";
import { layoutOf } from "../../board/cps1";
import type { EditorStore } from "../../editor/store";
import { applyFix, checkText, type Check, type Target } from "../../editor/validate";
import { useReview } from "../../editor/validate/useReview";
import { exportProjectZip, zipName } from "../../io/projectZip";
import { aiPackName, buildAiPack, buildPrompt } from "../../io/aiPack";
import { PackBuildError, packReport } from "../../io/packCheck";
import { Capsule, Card, Eyebrow } from "../atoms";
import { IconCheck, IconCircle, IconCopy, IconDownload, IconInfo, IconWarn, IconX } from "../icons";
import { downloadBytes } from "../download";
import { levelThumbnail } from "../thumbnail";
import { PowerOnCard } from "./PowerOnCard";

type Busy = null | "project" | "ai";

const ICONS = { ok: IconCheck, info: IconInfo, warning: IconWarn, error: IconX } as const;

export function ExportView({ project, version, store, onGo }: { project: Project; version: number; store: EditorStore; onGo: (target: Target) => void }) {
  const t = useExportMessages();
  const [busy, setBusy] = useState<Busy>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [bug, setBug] = useState<{ report: string; copied: boolean } | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (copyTimer.current && clearTimeout(copyTimer.current)), []);
  const review = useReview(project, version);
  const prompt = useMemo(() => (review.ready ? buildPrompt(project, review) : ""), [project, review]);
  const layout = layoutOf(project);

  const fix = (c: Check) => {
    if (!c.fix) return;
    const fixId = c.fix;
    store.editProject(`${t.review.fix}: ${checkText(t, c)}`, (p) => void applyFix(p, fixId));
  };

  const downloadProject = async () => {
    setBusy("project");
    setStatus(null);
    try {
      const thumbnails: Record<string, Uint8Array> = {};
      for (const level of project.levels) {
        const png = await levelThumbnail(level);
        if (png) thumbnails[level.id] = png;
      }
      const zip = await exportProjectZip(project, { thumbnails });
      const name = zipName(project);
      downloadBytes(zip, name, "application/zip");
      setStatus({ ok: true, text: t.done(name) });
    } catch (e) {
      setStatus({ ok: false, text: t.failed((e as Error).message) });
    } finally {
      setBusy(null);
    }
  };

  const downloadPack = async () => {
    if (!review.ready) return;
    setBusy("ai");
    setStatus(null);
    setBug(null);
    try {
      const pack = await buildAiPack(project, { review });
      const name = aiPackName(project);
      downloadBytes(pack.zip, name, "application/zip");
      setStatus({ ok: true, text: t.done(name) });
    } catch (e) {
      if (e instanceof PackBuildError) setBug({ report: packReport(e.problems, { project: project.id, board: `${project.board.id}/${layout.id}`, format: String(project.format), browser: typeof navigator !== "undefined" ? navigator.userAgent : "" }), copied: false });
      else setStatus({ ok: false, text: t.failed((e as Error).message) });
    } finally {
      setBusy(null);
    }
  };

  const copyReport = async () => {
    if (!bug) return;
    try {
      await navigator.clipboard.writeText(bug.report);
      setBug({ ...bug, copied: true });
    } catch {
      setStatus({ ok: false, text: t.ai.copyFailed });
    }
  };

  const copyPrompt = async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setStatus({ ok: false, text: t.ai.copyFailed });
    }
  };

  // the preview starts at the brief's first paragraph
  const preview = prompt.split("\n").slice(2, 3).join("\n");

  return (
    <div className="wm-export">
      <Card className="wm-export-col">
        <div className="wm-row wm-review-head">
          <Eyebrow accent>{t.review.title}</Eyebrow>
          <span className={`wm-chip wm-review-sum is-${review.errors ? "bad" : review.warnings || review.checking ? "warn" : "ok"}`} role="status" aria-busy={review.checking || undefined}>
            {review.checking && !review.errors ? t.review.checking : t.review.summary(review.errors, review.warnings)}
          </span>
        </div>
        <ul className="wm-checks" aria-label={t.review.title}>
          {review.checks.map((c, i) => {
            const Icon = ICONS[c.severity];
            const go = c.severity !== "ok" && c.target;
            return (
              <li key={`${c.id}-${c.msg}-${i}`} className={`is-${c.severity === "error" ? "bad" : c.severity === "warning" ? "warn" : c.severity}`}>
                <Icon />
                <span className="wm-sr">{t.review.severity[c.severity]}: </span>
                <span>{checkText(t, c)}</span>
                {c.fix && c.severity !== "ok" ? (
                  <Capsule size="sm" onClick={() => fix(c)}>
                    {t.review.fix}
                  </Capsule>
                ) : go ? (
                  <Capsule size="sm" onClick={() => onGo(c.target!)}>
                    {t.review.go}
                  </Capsule>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="wm-export-col">
        <Card className="wm-export-card">
          <Eyebrow accent>{t.project.title}</Eyebrow>
          <p className="wm-dim">{t.project.text}</p>
          <pre className="wm-tree-pre wm-mono">{`${zipName(project)}\n├ project.json\n├ assets/<sha256>.png\n├ thumbnails/<level>.png\n└ README.txt`}</pre>
          <Capsule tone="primary" size="lg" disabled={busy !== null} onClick={() => void downloadProject()}>
            <IconDownload /> {busy === "project" ? t.preparing : t.project.download}
          </Capsule>
        </Card>
        <Card className="wm-export-card">
          <Eyebrow accent>{t.ai.title}</Eyebrow>
          <p className="wm-dim">{t.ai.text}</p>
          {review.ready ? (
            <pre className="wm-tree-pre wm-mono wm-prompt" aria-label={t.ai.preview}>
              {preview}
            </pre>
          ) : (
            <p className="wm-note is-warn wm-small" role="note">
              {review.checking && !review.errors ? t.ai.checking : t.ai.blocked(review.errors)}
            </p>
          )}
          {bug && (
            <div className="wm-note is-error wm-small" role="alert">
              <p>{t.ai.bug}</p>
              <pre className="wm-tree-pre wm-mono" aria-label={t.ai.copyReport}>
                {bug.report}
              </pre>
              <Capsule size="sm" onClick={() => void copyReport()}>
                <IconCopy /> {bug.copied ? t.ai.reportCopied : t.ai.copyReport}
              </Capsule>
            </div>
          )}
          <div className="wm-row wm-export-actions">
            <Capsule tone="primary" size="lg" disabled={!review.ready || busy !== null} onClick={() => void downloadPack()}>
              <IconDownload /> {busy === "ai" ? t.preparing : t.ai.download}
            </Capsule>
            <Capsule size="lg" disabled={!review.ready} onClick={() => void copyPrompt()}>
              <IconCopy /> {copied ? t.ai.copied : t.ai.copy}
            </Capsule>
          </div>
        </Card>
        {status && (
          <p className={`wm-small ${status.ok ? "wm-ok" : "wm-bad"}`} role="status">
            {status.text}
          </p>
        )}
      </div>

      <div className="wm-export-col">
        <Card className="wm-export-card is-dashed wm-rom-card" aria-disabled="true">
          <div className="wm-row">
            <span className="wm-h is-violet">{t.rom.title}</span>
            <span className="wm-chip is-violet">{t.rom.stage}</span>
          </div>
          <p className="wm-dim">{t.rom.text}</p>
          <ul className="wm-rom-steps">
            {t.rom.steps.map((s) => (
              <li key={s}>
                <IconCheck /> {s}
              </li>
            ))}
            <li className="is-todo">
              <IconCircle /> <span className="wm-mono">{t.rom.set(layout.id)}</span>
            </li>
          </ul>
          <div className="wm-row wm-export-actions">
            <Capsule size="lg" disabled>
              <IconDownload /> {t.rom.download}
            </Capsule>
            <Capsule size="lg" disabled>
              {t.rom.play}
            </Capsule>
          </div>
          <p className="wm-small wm-dim">{t.rom.note}</p>
        </Card>
        <PowerOnCard />
      </div>
    </div>
  );
}
