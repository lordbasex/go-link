// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The smallest pieces of the game's interface (atomic design: atoms).

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

export function CapsuleButton({ children, onClick, tone = "plain", label, pressed, autoFocus }: { children: ReactNode; onClick: () => void; tone?: "plain" | "primary" | "danger" | "ok"; label?: string; pressed?: boolean; autoFocus?: boolean }) {
  // Focused when shown, without scrolling its dialog (the top must stay in view).
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  return (
    <button ref={ref} type="button" className={`dz-btn is-${tone}`} onClick={onClick} aria-label={label} aria-pressed={pressed}>
      {children}
    </button>
  );
}

export function CounterChip({ label, value, tone }: { label: string; value: string; tone?: "ok" | "accent" }) {
  return (
    <span className="dz-chip">
      <span className="dz-chip-label">{label}</span> <b className={`dz-mono${tone ? ` is-${tone}` : ""}`}>{value}</b>
    </span>
  );
}

/** A person to rescue, from the characters' atlas (grey until rescued). */
export function CivilianIcon({ style, rescued, name }: { style: Record<string, string>; rescued: boolean; name: string }) {
  return <span className={`dz-person${rescued ? " is-rescued" : ""}`} style={style as CSSProperties} role="img" aria-label={name} />;
}

export function WeaponChip({ name, keys, active }: { name: string; keys: string; active?: boolean }) {
  return (
    <span className={`dz-weapon${active ? " is-active" : ""}`}>
      {name} <span className="dz-mono dz-muted">{keys}</span>
    </span>
  );
}
