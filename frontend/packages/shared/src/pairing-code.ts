// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The 9-digit code a user types to link a browser with a device.

export const CODE_DIGITS = 9;

/** Removes separators; returns the 9 digits or null. */
export function normalizeCode(input: string): string | null {
  const digits = input.replace(/[\s.-]/g, "");
  return /^[0-9]{9}$/.test(digits) ? digits : null;
}

/** "113134323" -> "113 134 323". */
export function formatCode(code: string): string {
  return code.length === CODE_DIGITS ? `${code.slice(0, 3)} ${code.slice(3, 6)} ${code.slice(6)}` : code;
}
