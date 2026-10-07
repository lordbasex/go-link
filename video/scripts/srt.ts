// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Writes the trailers' subtitles as SubRip (.srt) from the same timeline the
// videos use (npm run srt): each trailer in its own language, and the
// English one also in Spanish and Portuguese.
import { mkdirSync, writeFileSync } from "node:fs";
import { captions, FPS, type Lang } from "../src/timeline";

const stamp = (frame: number) => {
  const ms = Math.round((frame / FPS) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};

const files: [Lang, Lang][] = [["en", "en"], ["en", "es"], ["en", "pt"], ["es", "es"], ["pt", "pt"]];
mkdirSync("../dist/video", { recursive: true });
for (const [voice, subs] of files) {
  const list = captions(voice, subs);
  const out = `../dist/video/go-link-trailer-${voice}.${subs}.srt`;
  writeFileSync(out, list.map((c, i) => `${i + 1}\n${stamp(c.from)} --> ${stamp(c.to)}\n${c.text}\n`).join("\n"));
  console.log(`${out}: ${list.length} subtitles`);
}
