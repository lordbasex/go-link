// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import type { RomCheck } from "@go-link/shared";
import { t } from "../i18n";

/** One readable line about a ROM check, or "" when the set runs fine. */
export function romCheckText(check: RomCheck | undefined): string {
  if (!check) return "";
  switch (check.status) {
    case "ok":
      return check.driver ? t.romCheck.driver : "";
    case "missing":
      return t.romCheck.missing(check.missing ?? [], check.needs ?? []);
    case "unsupported":
      return t.romCheck.unsupported;
    case "bios":
      return t.romCheck.bios;
    case "bad_zip":
      return t.romCheck.badZip;
  }
}
