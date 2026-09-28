// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { readFileSync } from "node:fs";
import { STATE_FILE, type Stack } from "./stack";

/** Stops the device and the signalhub the setup started. */
export default async function globalTeardown() {
  let stack: Stack;
  try {
    stack = JSON.parse(readFileSync(STATE_FILE, "utf8")) as Stack;
  } catch {
    return;
  }
  for (const pid of [stack.devicePid, stack.signalPid]) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
}
