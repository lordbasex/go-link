// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The board usage meter (experiment 1's verdict, T-27): a chip in the top
// bar with the share of the board's most used limit, and a panel with every
// limit as a bar. It is the live estimate while building; "Measure exactly"
// packs the game as Create ROM does and shows the real numbers.

import { useEffect, useMemo, useRef, useState } from "react";
import { useCore } from "../../i18n";
import type { Project } from "../../model";
import { estimateUsage, measureUsage, type BoardUsage } from "../../rom/usage";
import { Capsule, Meter } from "../atoms";

export function BoardUsageChip({ project, version }: { project: Project; version: number }) {
  const t = useCore();
  const u = t.usage;
  const estimate = useMemo(() => estimateUsage(project), [project, version]);
  const [measured, setMeasured] = useState<{ usage: BoardUsage; version: number } | null>(null);
  const [busy, setBusy] = useState<"measuring" | "failed" | null>(null);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // a measure is good until the game changes
  const usage = measured && measured.version === version ? measured.usage : estimate;

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const measure = async () => {
    setBusy("measuring");
    try {
      const at = version;
      const m = await measureUsage(project);
      setMeasured({ usage: m, version: at });
      setBusy(null);
    } catch {
      setBusy("failed");
    }
  };

  const pct = (r: number) => Math.round(r * 100);
  const name = (id: string) => (t.meters as Record<string, unknown>)[id] as string;
  const value = (m: BoardUsage["meters"][number]) =>
    m.unit === "bytes" ? (m.used < 1048576 ? `${Math.round(m.used / 1024)} KB / ${Math.round(m.max / 1048576)} MB` : t.meters.mb(m.used / 1048576, m.max / 1048576)) : `${m.used} / ${m.max}`;

  return (
    <div ref={root} className="wm-usage">
      <button type="button" className={`wm-chip wm-usage-chip is-${usage.peak.level}`} title={u.chipTip} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}>
        <span className="wm-usage-gauge" aria-hidden="true">
          <i style={{ width: `${Math.min(100, pct(usage.peak.ratio))}%` }} />
        </span>
        {u.chip(pct(usage.peak.ratio))}
      </button>
      {open && (
        <div className="wm-usage-pop wm-card" role="dialog" aria-label={u.title}>
          <div className="wm-row wm-usage-head">
            <b>{u.title}</b>
            <span className="wm-grow" />
            <span className={`wm-chip ${usage.measuredAt ? "is-on" : ""}`}>{usage.measuredAt ? u.measured : u.estimated}</span>
          </div>
          <p className="wm-dim wm-small">{u.help}</p>
          <p className="wm-small">{u.peak(name(usage.peak.id), pct(usage.peak.ratio))}</p>
          {usage.meters.map((m) => (
            <Meter key={m.id} label={name(m.id)} value={value(m)} ratio={m.max ? m.used / m.max : 0} level={m.level} />
          ))}
          <p className="wm-dim wm-small">{u.soundNote}</p>
          {busy === "failed" && (
            <p className="wm-note is-warn wm-small" role="status">
              {u.failed}
            </p>
          )}
          <div className="wm-row">
            <Capsule tone="primary" size="sm" disabled={busy === "measuring"} onClick={() => void measure()}>
              {busy === "measuring" ? u.measuring : u.measure}
            </Capsule>
            <Capsule size="sm" onClick={() => setOpen(false)}>
              {u.close}
            </Capsule>
          </div>
        </div>
      )}
    </div>
  );
}
