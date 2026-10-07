// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Writes the trailer's subtitles as SubRip (.srt) from the same timeline
// the video uses: npm run srt.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { captions, FPS } from "../src/timeline";

const stamp = (frame: number) => {
  const ms = Math.round((frame / FPS) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};

const out = process.argv[2] ?? "../dist/video/go-link-trailer.en.srt";
const srt = captions()
  .map((c, i) => `${i + 1}\n${stamp(c.from)} --> ${stamp(c.to)}\n${c.text}\n`)
  .join("\n");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, srt);
console.log(`${out}: ${captions().length} subtitles`);
