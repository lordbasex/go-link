// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Fails with a readable list when axe finds WCAG 2.1 AA problems on the page. */
export async function expectAccessible(page: Page, what: string) {
  // Colors are measured at rest: finish every fade and stop transitions first
  // (a slow machine could otherwise sample a button halfway through a fade).
  // (The site's CSP forbids injected styles, so Chromium's animation clock is sped up instead.)
  const cdp = await page.context().newCDPSession(page).catch(() => null);
  if (cdp) {
    await cdp.send("Animation.enable");
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 1000 });
  }
  await page.waitForTimeout(100);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const problems = result.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help}\n` + v.nodes.slice(0, 5).map((n) => `    ${n.target.join(" ")}`).join("\n"),
  );
  if (cdp) await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 }).catch(() => {});
  expect(problems, `${what}\n${problems.join("\n")}`).toEqual([]);
}
