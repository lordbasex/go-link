// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const STATE_FILE = join(dirname(fileURLToPath(import.meta.url)), ".state", "stack.json");

/** What the setup started, for the tests and the teardown. */
export interface Stack {
  signalPid: number;
  devicePid: number;
  deviceLog: string;
  config: string;
  bin: string;
}

export function stack(): Stack {
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as Stack;
}

/** The device's current pairing code (the last one in its log), digits only. */
export function pairingCode(s: Stack = stack()): string {
  let log = "";
  try {
    log = readFileSync(s.deviceLog, "utf8");
  } catch {
    return "";
  }
  const all = [...log.matchAll(/msg="pairing code" code="(\d{3} \d{3} \d{3})"/g)];
  return all.length ? all[all.length - 1]![1]!.replace(/ /g, "") : "";
}

/** The device's web panel token, as `device panel token` shows it. */
export function panelToken(s: Stack = stack()): string {
  return execFileSync(s.bin, ["panel", "token", "--config", s.config], { encoding: "utf8" }).trim();
}
