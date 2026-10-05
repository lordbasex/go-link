// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

/** Saves bytes as a file through a temporary link (nothing leaves the browser). */
export function downloadBytes(bytes: Uint8Array, name: string, type: string): void {
  if (typeof URL.createObjectURL !== "function") return;
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
