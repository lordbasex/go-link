// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import type { CSSProperties } from "react";

const PORT_COLORS = [
  "var(--color-p1)",
  "var(--color-p2)",
  "var(--color-p3)",
  "var(--color-p4)",
] as const;

/** Color variable of a player port (1 to 4). */
export function portColor(port: number): string {
  return PORT_COLORS[(port - 1) % 4] ?? PORT_COLORS[0];
}

/** Sets the --port-color custom property used by .port-* classes. */
export function portStyle(port: number): CSSProperties {
  return { "--port-color": portColor(port) } as CSSProperties;
}

/** P1..Pn chips: filled for taken seats, dashed for free ones. */
export function SeatChips({ players, max }: { players: number; max: number }) {
  return (
    <div className="seat-chips">
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={i < players ? "seat-chip is-taken" : "seat-chip"}
          style={portStyle(i + 1)}
        >
          P{i + 1}
        </span>
      ))}
    </div>
  );
}
