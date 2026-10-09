// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { romKind, type DeviceRom, type RomKind } from "@go-link/shared";
import { t } from "../../i18n";

export type Kind = RomKind;

/** The state of a set, from the device's check. */
export function kindOf(r: DeviceRom): Kind {
  return romKind(r);
}

export const KIND_LABEL: Record<Kind, () => string> = {
  runs: () => t.dash.runs,
  missing: () => t.dash.missing,
  unsupported: () => t.dash.unsupported,
  broken: () => t.dash.broken,
  bios: () => t.dash.bios,
  unchecked: () => t.dash.unchecked,
};

/** Token color of each state, shared by badges, bars and cards. */
export const KIND_COLOR: Record<Kind, string> = {
  runs: "var(--color-voice)",
  missing: "var(--color-accent)",
  unsupported: "var(--color-p4)",
  broken: "var(--color-p3)",
  bios: "var(--color-text-faint)",
  unchecked: "var(--color-border-strong)",
};
