// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// The apps' built-in skins, read from docs/skins/builtin (the files both
// apps ship), so the website never keeps a copy of its own.
import type { SkinJson } from "./model";

const files = import.meta.glob("../../../../../docs/skins/builtin/skin-*.json", { eager: true, import: "default" });

/** The order the apps list them in. */
const ORDER = ["violet", "red", "green", "blue", "smoke", "orange"];

export const BUILTIN_SKINS: readonly SkinJson[] = Object.values(files)
  .map((v) => v as SkinJson)
  .sort((a, b) => {
    const ia = ORDER.indexOf(a.id);
    const ib = ORDER.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.id.localeCompare(b.id);
  });

/** The skin new drawings start from (the apps' default). */
export function smokeSkin(): SkinJson | undefined {
  return BUILTIN_SKINS.find((s) => s.id === "smoke") ?? BUILTIN_SKINS[0];
}
