// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// Turns a recorded session (session.mjs) into its two products: an MP4 with
// one chapter per step (ffmpeg, chapters from timeline.json) and a
// step-by-step HTML guide with the screenshots (relative paths).
//
//   node docs/experiments/case-c/session/publish.mjs SESSION_DIR [--mp4 OUT.mp4] [--guide-dir DIR]
//
// The guide is written as DIR/guide.html next to DIR/shots/ (DIR defaults to
// SESSION_DIR; with another DIR the shots and timeline.json are copied there).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dir = path.resolve(args[0]);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const mp4 = path.resolve(opt("--mp4") ?? path.join(dir, "session.mp4"));
const guideDir = path.resolve(opt("--guide-dir") ?? dir);
const FFMPEG = process.env.FFMPEG || "/usr/local/bin/ffmpeg";
const tl = JSON.parse(fs.readFileSync(path.join(dir, "timeline.json"), "utf8"));
const lead = (tl.noteMs ?? 1500) / 1000;
const video = path.join(dir, tl.video);

// 1. the chapters (each step from the moment its note shows)
const dur = Number(execFileSync(FFMPEG.replace(/ffmpeg$/, "ffprobe"), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video], { encoding: "utf8" }).trim());
const esc = (s) => s.replace(/([=;#\\\n])/g, "\\$1");
const starts = tl.steps.map((s) => Math.max(0, Math.round((s.t - lead - 0.1) * 1000)));
let meta = ";FFMETADATA1\ntitle=Experiment 1, case C: Willy Maker's Create ROM, a recorded session\n";
tl.steps.forEach((s, i) => {
  const start = i === 0 ? 0 : starts[i];
  const end = i + 1 < tl.steps.length ? starts[i + 1] : Math.round(dur * 1000);
  meta += `\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=${start}\nEND=${Math.max(start + 1, end)}\ntitle=${esc(`${String(s.step).padStart(2, "0")} · ${s.text}`)}\n`;
});
const metaPath = path.join(dir, "chapters.txt");
fs.writeFileSync(metaPath, meta);
execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", video, "-i", metaPath, "-map", "0:v", "-map_metadata", "1", "-map_chapters", "1", "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
console.log(`mp4: ${mp4} (${(fs.statSync(mp4).size / 1048576).toFixed(1)} MB, ${tl.steps.length} chapters, ${dur.toFixed(1)} s)`);

// 2. the guide
if (guideDir !== dir) {
  fs.mkdirSync(path.join(guideDir, "shots"), { recursive: true });
  for (const s of tl.steps) fs.copyFileSync(path.join(dir, s.screenshot), path.join(guideDir, s.screenshot));
  fs.copyFileSync(path.join(dir, "timeline.json"), path.join(guideDir, "timeline.json"));
}
const h = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const items = tl.steps
  .map(
    (s, i) => `  <li class="step" id="step-${s.step}">
    <div class="meta"><span class="n">${s.step}</span><span class="t" title="the moment the note shows in session.mp4">${clock(starts[i] / 1000)}</span></div>
    <div class="body">
      <h2>${h(s.text)}</h2>
      <p class="why">${h(s.why)}</p>
      ${s.selector ? `<p class="sel"><code>${h(s.selector)}</code></p>` : ""}
      <a href="${h(s.screenshot)}"><img loading="lazy" src="${h(s.screenshot)}" alt="Step ${s.step}: ${h(s.text)}" width="960" height="540"></a>
    </div>
  </li>`,
  )
  .join("\n");
const html = `<!doctype html>
<!-- Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com> -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Case C session guide</title>
<style>
  :root { --bg: #f6f4fa; --card: #ffffff; --text: #1d1a24; --dim: #5f5970; --accent: #c4720a; --line: #e2dcec; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #121018; --card: #1b1824; --text: #eeeaf5; --dim: #a59fb5; --accent: #f2a33a; --line: #2e2939; } }
  :root[data-theme="dark"] { --bg: #121018; --card: #1b1824; --text: #eeeaf5; --dim: #a59fb5; --accent: #f2a33a; --line: #2e2939; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 1040px; margin: 0 auto; padding: 32px 16px 64px; }
  header p { color: var(--dim); max-width: 760px; }
  ol { list-style: none; padding: 0; margin: 24px 0 0; display: grid; gap: 16px; }
  .step { display: grid; grid-template-columns: 72px 1fr; gap: 12px; background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 16px; }
  .meta { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .n { background: var(--accent); color: #141018; font-weight: 800; border-radius: 999px; min-width: 40px; text-align: center; padding: 2px 10px; }
  .t { color: var(--dim); font: 13px ui-monospace, Menlo, monospace; }
  h2 { font-size: 18px; margin: 0 0 4px; }
  .why { margin: 0 0 6px; color: var(--dim); }
  .sel { margin: 0 0 10px; }
  code { font: 12px ui-monospace, Menlo, monospace; background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 1px 6px; overflow-wrap: anywhere; }
  img { display: block; width: 100%; height: auto; border-radius: 10px; border: 1px solid var(--line); }
  @media (max-width: 600px) { .step { grid-template-columns: 1fr; } .meta { flex-direction: row; } }
</style>
</head>
<body>
<main>
<header>
  <h1>Case C: Game Spec v1 made in Willy Maker, step by step</h1>
  <p>Experiment 1, case C. A browser driven by Playwright builds the spec's level from "New game", sets the rules and texts, and uses <b>Create ROM</b>. Before every action a note said what would happen and why, and outlined the control; each picture below is that moment. The times match the chapters of <code>session.mp4</code>. Recorded ${h(tl.started)} at ${h(tl.viewport)}, ${tl.steps.length} steps${tl.errors?.length ? `, ${tl.errors.length} errors` : ", no errors"}.</p>
</header>
<ol>
${items}
</ol>
</main>
</body>
</html>
`;
fs.writeFileSync(path.join(guideDir, "guide.html"), html);
console.log(`guide: ${path.join(guideDir, "guide.html")}`);
