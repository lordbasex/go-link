// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
// A recorded user session (experiment 1, T-17, lesson L-15): drives a real
// page with Playwright, step by step, and keeps what a reader of the video
// needs. Each step gets a fixed number (given by the script, so an inserted
// step never renumbers the others), a caption in a fixed place, the control
// outlined, and a "Why" card placed in the corner farthest from that control
// so it never covers it. At the end the video becomes an MP4 with one
// chapter per step and the captions as a subtitle track, plus chapters.vtt,
// captions.vtt, timeline.json and session.md, whose step links open the MP4
// at that step (`session.mp4#t=SECONDS`).
//
//   import { recordSession } from "./session.mjs";
//   const s = await recordSession({ out: "DIR", url: "http://localhost:5180/tools/willy-maker" });
//   await s.step(1, "New game", "Every game starts from the wizard", "button:has-text('New game')", (l) => l.click());
//   ...
//   await s.finish(); // DIR/session.mp4, chapters.vtt, captions.vtt, timeline.json, session.md
//
// Needs Playwright (e2e/node_modules, or PLAYWRIGHT=<path to playwright/index.mjs>) and ffmpeg.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// on its own (lab.mjs loads TypeScript, which plain node does not)
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const VIEW = { width: 1920, height: 1080 };

/** HH:MM:SS.mmm for WebVTT and ffmpeg. */
export function stamp(ms) {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(t % 1000).padStart(3, "0")}`;
}

/**
 * Where the "Why" card goes: the screen corner farthest from the control
 * (its center), so card and control never overlap. The caption has its own
 * fixed place (top center) and the card avoids it too.
 */
export function cardCorner(box, view = VIEW) {
  if (!box) return "bottom-right";
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return `${cy < view.height / 2 ? "bottom" : "top"}-${cx < view.width / 2 ? "right" : "left"}`;
}

/** WebVTT text: one cue per step, from its start to the next one's. */
export function vtt(steps, end, text) {
  const L = ["WEBVTT", ""];
  steps.forEach((s, i) => {
    const to = i + 1 < steps.length ? steps[i + 1].t : end;
    L.push(String(s.n), `${stamp(s.t)} --> ${stamp(Math.max(to, s.t + 1))}`, text(s), "");
  });
  return L.join("\n");
}

/** ffmpeg's metadata file with one chapter per step. */
export function ffmetadata(steps, end, title) {
  const esc = (s) => String(s).replace(/[=;#\\\n]/g, (c) => (c === "\n" ? " " : `\\${c}`));
  const L = [";FFMETADATA1", `title=${esc(title)}`, ""];
  steps.forEach((s, i) => {
    const to = i + 1 < steps.length ? steps[i + 1].t : end;
    L.push("[CHAPTER]", "TIMEBASE=1/1000", `START=${Math.round(s.t)}`, `END=${Math.round(Math.max(to, s.t + 1))}`, `title=${esc(`${s.n}. ${s.title}`)}`, "");
  });
  return L.join("\n");
}

export async function recordSession({ out, url, title = "Session", view = VIEW, noteMs = 900, playwright = process.env.PLAYWRIGHT ?? path.join(REPO, "e2e/node_modules/playwright/index.mjs"), locale = "en-US", headless = true }) {
  const { chromium } = await import(playwright);
  fs.mkdirSync(path.join(out, "shots"), { recursive: true });
  fs.mkdirSync(path.join(out, "video"), { recursive: true });
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport: view, recordVideo: { dir: path.join(out, "video"), size: view }, acceptDownloads: true, locale });
  const page = await context.newPage();
  const t0 = Date.now();
  const steps = [];
  const used = new Set();
  if (url) await page.goto(url);

  async function overlay(s) {
    await page.evaluate(
      ({ s, corner, view }) => {
        const make = (id, css) => {
          let el = document.getElementById(id);
          if (!el) {
            el = document.createElement("div");
            el.id = id;
            document.body.appendChild(el);
          }
          el.style.cssText = `position:fixed;z-index:2147483647;pointer-events:none;${css}`;
          return el;
        };
        // the caption: top center (bottom center when the control is right under it), its number fixed by the script
        const under = s.box && s.box.y < 90 && s.box.x < view.width / 2 + 560 && s.box.x + s.box.width > view.width / 2 - 560;
        const cap = make("__session_caption", (under ? "bottom:14px;" : "top:14px;") + "left:50%;transform:translateX(-50%);max-width:1100px;padding:8px 16px;border-radius:10px;background:rgba(10,12,20,.92);color:#fff;font:700 20px/1.3 system-ui,sans-serif;border:2px solid #f2a33a;box-shadow:0 6px 24px rgba(0,0,0,.5)");
        cap.textContent = `${s.n}. ${s.title}`;
        // the control, outlined
        const hl = make("__session_outline", "border:3px solid #ff3d7f;border-radius:6px;box-shadow:0 0 0 4px rgba(255,61,127,.25)");
        if (s.box) Object.assign(hl.style, { display: "block", left: `${s.box.x - 4}px`, top: `${s.box.y - 4}px`, width: `${s.box.width + 8}px`, height: `${s.box.height + 8}px` });
        else hl.style.display = "none";
        // the Why card: the corner farthest from the control, below the caption
        const [v, h] = corner.split("-");
        const why = make("__session_why", `${v}:${v === "top" ? 70 : 24}px;${h}:24px;max-width:${Math.round(view.width * 0.3)}px;padding:12px 16px;border-radius:12px;background:rgba(242,163,58,.96);color:#1a1206;font:500 17px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.45)`);
        why.replaceChildren();
        if (s.why) {
          const b = document.createElement("strong");
          b.textContent = "Why: ";
          why.append(b, document.createTextNode(s.why));
          why.style.display = "block";
        } else why.style.display = "none";
      },
      { s, corner: cardCorner(s.box, view), view },
    );
  }

  async function clear() {
    await page.evaluate(() => ["__session_caption", "__session_outline", "__session_why"].forEach((id) => document.getElementById(id)?.remove()));
  }

  return {
    page,
    context,
    /**
     * One user action. `n` is the step's own number (unique, never computed),
     * `target` a selector, a Playwright locator, or { box } for a point on a
     * canvas; `action(locator)` does it.
     */
    async step(n, title, why, target, action) {
      if (used.has(n)) throw new Error(`step ${n} is numbered twice`);
      used.add(n);
      let loc = null;
      let box = null;
      if (target && typeof target === "object" && "box" in target) box = target.box;
      else if (target) {
        loc = (typeof target === "string" ? page.locator(target) : target).first();
        await loc.scrollIntoViewIfNeeded().catch(() => undefined);
        box = await loc.boundingBox().catch(() => null);
      }
      const s = { n, title, why: why ?? "", t: Date.now() - t0, box, shot: `shots/${String(n).padStart(3, "0")}.png` };
      await overlay(s);
      await page.waitForTimeout(noteMs);
      await page.screenshot({ path: path.join(out, s.shot) });
      await clear();
      if (action) await action(loc);
      await page.waitForTimeout(150);
      steps.push(s);
      return s;
    },
    /** Closes the browser and writes the MP4 with chapters and subtitles, and the indexes. */
    async finish() {
      const end = Date.now() - t0;
      const video = page.video();
      await context.close();
      await browser.close();
      const webm = await video.path();
      const sorted = [...steps].sort((a, b) => a.t - b.t);
      const caption = (s) => `${s.n}. ${s.title}${s.why ? `\nWhy: ${s.why}` : ""}`;
      fs.writeFileSync(path.join(out, "captions.vtt"), vtt(sorted, end, caption));
      fs.writeFileSync(path.join(out, "chapters.vtt"), vtt(sorted, end, (s) => `${s.n}. ${s.title}`));
      fs.writeFileSync(path.join(out, "chapters.ffmeta"), ffmetadata(sorted, end, title));
      const mp4 = path.join(out, "session.mp4");
      // H.264 for any player; chapters from the metadata; captions as a soft subtitle track
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", webm, "-i", path.join(out, "chapters.ffmeta"), "-i", path.join(out, "captions.vtt"), "-map", "0:v", "-map", "2:s", "-map_metadata", "1", "-map_chapters", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-c:s", "mov_text", "-metadata:s:s:0", "language=eng", "-movflags", "+faststart", mp4]);
      fs.writeFileSync(path.join(out, "timeline.json"), JSON.stringify({ title, video: "session.mp4", seconds: end / 1000, steps: sorted.map(({ n, title, why, t, box, shot }) => ({ n, title, why, t, at: stamp(t), box, screenshot: shot })) }, null, 2) + "\n");
      const L = [`# ${title}`, "", `[session.mp4](session.mp4), ${(end / 1000).toFixed(1)} s, ${sorted.length} steps (chapters in the MP4, captions as its subtitle track).`, "", "| # | Step | Why | Video | Picture |", "|---|---|---|---|---|"];
      for (const s of sorted) L.push(`| ${s.n} | ${s.title.replace(/\|/g, "\\|")} | ${s.why.replace(/\|/g, "\\|")} | [${stamp(s.t).slice(3, 8)}](session.mp4#t=${(s.t / 1000).toFixed(1)}) | [${s.shot}](${s.shot}) |`);
      fs.writeFileSync(path.join(out, "session.md"), L.join("\n") + "\n");
      fs.rmSync(path.dirname(webm), { recursive: true, force: true });
      return { mp4, steps: sorted.length, seconds: end / 1000 };
    },
  };
}
