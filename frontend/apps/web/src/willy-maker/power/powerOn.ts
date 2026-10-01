// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// The power-on test of a ROM .zip (validation level 3): reads the zip and
// runs @go-link/cps1-sim's checks on its files. The Worker
// (powerOn.worker.ts) runs this in the browser; tests call it directly.

import { filesFailure, runPowerOn, type PowerOnResult, type PowerOnStep } from "@go-link/cps1-sim";
import { readZip } from "../io/zip";
import { InputError } from "../model/inputError";

/** A slammast set is 12.7 MB unpacked; nothing bigger is a ROM set of this board. */
export const MAX_SET_MB = 64;
const LIMITS = { maxEntries: 256, maxEntryBytes: 8 * 1024 * 1024, maxTotalBytes: MAX_SET_MB * 1024 * 1024 };

export interface PowerOnTestOptions {
  wasm: BufferSource | WebAssembly.Module;
  frames?: number;
  onStep?: (step: PowerOnStep) => void;
}

export async function powerOnTest(zip: Uint8Array, opts: PowerOnTestOptions): Promise<PowerOnResult> {
  if (zip.length > LIMITS.maxTotalBytes) return filesFailure("files.too-big", { max: MAX_SET_MB }, opts);
  let files: Map<string, Uint8Array>;
  try {
    files = await readZip(zip, LIMITS);
  } catch (e) {
    if (e instanceof InputError && (e.code === "zip.too-big" || e.code === "zip.too-many")) return filesFailure("files.too-big", { max: MAX_SET_MB }, opts);
    if (e instanceof InputError && e.code === "zip.damaged" && e.params.name) return filesFailure("files.damaged", { name: e.params.name }, opts);
    return filesFailure("files.not-zip", {}, opts);
  }
  return runPowerOn(files, opts);
}
