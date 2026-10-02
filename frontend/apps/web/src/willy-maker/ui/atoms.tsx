// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Willy Maker's smallest pieces, following the site's capsule rule: every
// button is a 36 px capsule, icon-only buttons are 36 px circles with a
// tooltip and an aria-label, touch screens get a 44 px hit area.

import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { MeterLevel } from "../board/cps1";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "play" | "danger" | "ghost"; on?: boolean; size?: "sm" | "md" | "lg" };

export function Capsule({ tone, on, size = "md", className = "", type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={`wm-cap is-${size}${tone ? ` is-${tone}` : ""}${on ? " is-on" : ""} ${className}`} aria-pressed={on === undefined ? undefined : on} {...rest} />;
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string; on?: boolean; children: ReactNode };

export function IconButton({ label, on, className = "", type = "button", children, ...rest }: IconButtonProps) {
  return (
    <button type={type} className={`wm-icon${on ? " is-on" : ""} ${className}`} aria-label={label} data-tip={label} aria-pressed={on === undefined ? undefined : on} {...rest}>
      {children}
    </button>
  );
}

export function Eyebrow({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return <div className={`wm-h${accent ? " is-accent" : ""}`}>{children}</div>;
}

export function Meter({ label, value, ratio, level }: { label: string; value: string; ratio: number; level: MeterLevel }) {
  return (
    <div className={`wm-meter is-${level}`}>
      <div className="wm-meter-row">
        <span>{label}</span>
        <span className="wm-mono">{value}</span>
      </div>
      <div className="wm-meter-bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, ratio) * 100)} aria-valuetext={value}>
        <i style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
    </div>
  );
}

/** A colored square for a collision tag or an object type. */
export function Swatch({ kind, name }: { kind: "tag" | "object"; name: string }) {
  return <span className={`wm-swatch is-${kind}-${name}`} aria-hidden="true" />;
}

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  return (
    <label className="wm-field">
      <span className="wm-field-label">{label}</span>
      {children}
      {error ? <span className="wm-field-error">{error}</span> : hint ? <span className="wm-field-hint">{hint}</span> : null}
    </label>
  );
}

export function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="wm-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} className={`wm-seg-btn${o.value === value ? " is-on" : ""}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Card({ children, className = "", ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`wm-card ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Logo() {
  const { first, second } = { first: "Willy", second: "Maker" };
  return (
    <span className="wm-logo">
      {first} <span className="wm-logo-2">{second}</span>
    </span>
  );
}

/**
 * A small capsule for a part or setting the game does not use yet
 * ("Coming soon") or only the ROM reads ("ROM only"). The reason is its
 * tooltip (`tip`; off inside a button that shows it already) and, for
 * screen readers, part of its text.
 */
export function SoonBadge({ label, reason, tone = "soon", tip = true }: { label: string; reason?: string; tone?: "soon" | "rom-only"; tip?: boolean }) {
  return (
    <span className={`wm-soon is-${tone}`} data-tip={tip ? reason : undefined}>
      {label}
      {reason && <span className="wm-sr">: {reason}</span>}
    </span>
  );
}
