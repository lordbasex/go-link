// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// A player's name (alias): 2 to 20 characters of letters (any language,
// accents and ñ included), digits and single spaces. The device applies
// the same rule and never trusts the browser; the website checks it as
// the player types, to explain what is wrong instead of changing it.

export const NAME_MIN = 2;
export const NAME_MAX = 20;

/** Where the website keeps the last name used. */
export const PLAYER_NAME_KEY = "go-link.player-name";

const ALLOWED = /^[\p{L}\p{N} ]$/u;

/** Joins runs of spaces (any whitespace) and trims. */
function tidy(s: string): string {
  return s.normalize("NFC").replace(/\s+/gu, " ").trim();
}

/**
 * What the device does with a name: keep letters, digits and spaces, join
 * spaces, trim, cut to 20. Returns "" when fewer than 2 characters remain
 * (the device then keeps the guest's generated name).
 */
export function cleanPlayerName(raw: string): string {
  const kept = [...tidy(raw)].filter((c) => ALLOWED.test(c) || c === " ").join("");
  let out = tidy(kept);
  const chars = [...out];
  if (chars.length > NAME_MAX) out = chars.slice(0, NAME_MAX).join("").trim();
  return [...out].length >= NAME_MIN ? out : "";
}

export type NameProblem = "short" | "long" | "chars";

/** Checks a name as typed: null when it is good as it is. */
export function nameProblem(raw: string): NameProblem | null {
  const t = tidy(raw);
  if ([...t].some((c) => !ALLOWED.test(c))) return "chars";
  const n = [...t].length;
  if (n < NAME_MIN) return "short";
  if (n > NAME_MAX) return "long";
  return null;
}

/** Length of the name as the device will count it. */
export function nameLength(raw: string): number {
  return [...tidy(raw)].length;
}

/** The last name used in this browser, if it is still valid. */
export function savedPlayerName(): string {
  try {
    const v = localStorage.getItem(PLAYER_NAME_KEY) ?? "";
    return nameProblem(v) === null ? tidy(v) : "";
  } catch {
    return "";
  }
}

/** Remembers the name for next time (it must be valid). */
export function savePlayerName(name: string): void {
  if (nameProblem(name) !== null) return;
  try {
    localStorage.setItem(PLAYER_NAME_KEY, tidy(name));
  } catch {
    // private window or blocked storage: nothing to remember
  }
}
