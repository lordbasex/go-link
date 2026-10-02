// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Turns the driver's session.webm into an H.264 MP4 with one chapter per
// milestone of timeline.json (the screenshots taken without an action).
// Usage: node make-mp4.mjs <run dir> <out.mp4>

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [run, out] = process.argv.slice(2);
const tl = JSON.parse(readFileSync(join(run, "timeline.json"), "utf8"));
const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", join(run, "video/session.webm")]).toString().trim()) * 1000;
// each chapter is the work that ends with a milestone screenshot, titled by it
const marks = tl.steps.filter((s) => s.n === null && s.screenshot).map((s) => ({ t: s.t, text: s.text }));
let meta = ";FFMETADATA1\ntitle=Experiment 1, case B, step 1: Game Spec v1 built in Willy Maker\n";
let start = 0;
for (let i = 0; i < marks.length; i++) {
  const end = i === marks.length - 1 ? Math.round(dur) : Math.round(marks[i].t);
  if (end <= start) continue;
  meta += `\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=${start}\nEND=${end}\ntitle=${marks[i].text.replace(/[=;#\\\n]/g, " ").slice(0, 120)}\n`;
  start = end;
}
const metaFile = join(run, "chapters.txt");
writeFileSync(metaFile, meta);
execFileSync("ffmpeg", ["-y", "-v", "error", "-i", join(run, "video/session.webm"), "-i", metaFile, "-map_metadata", "1", "-map_chapters", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-preset", "medium", "-movflags", "+faststart", out], { stdio: "inherit" });
console.log(JSON.stringify({ out, chapters: marks.length, durationMs: Math.round(dur) }));
