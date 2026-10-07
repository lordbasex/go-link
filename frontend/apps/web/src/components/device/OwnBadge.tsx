// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import type { DeviceRom } from "@go-link/shared";
import { t } from "../../i18n";

/**
 * The "go-link" mark next to a game go-link made itself. The device sets
 * own only when the SHA-256 of every file inside the zip matches its list
 * (a set with the same name is the original game), so it is a verified mark.
 */
export function OwnBadge() {
  return (
    <span className="own-badge" title={t.roms.ownBadgeTitle}>
      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
        <path d="M2 6.5 5 9.5 10 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {t.roms.ownBadge}
      <span className="visually-hidden">: {t.roms.ownBadgeTitle}</span>
    </span>
  );
}

/** "4 players · Jump · Fire · Special" for go-link's games and go-link HD packages, in the reader's language. */
export function ownControlsText(rom: DeviceRom): string {
  const c = rom.controls;
  if (!(rom.own || rom.kind === "glhd") || !c || c.labels.length === 0) return "";
  const names = t.roms.ownButton as Record<string, string>;
  // two buttons may do the same (go-link HD jumps with B or A)
  return t.roms.ownControls(c.players, [...new Set(c.labels)].map((l) => names[l] ?? l));
}
