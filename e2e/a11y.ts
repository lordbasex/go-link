// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Fails with a readable list when axe finds WCAG 2.1 AA problems on the page. */
export async function expectAccessible(page: Page, what: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const problems = result.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help}\n` + v.nodes.slice(0, 5).map((n) => `    ${n.target.join(" ")}`).join("\n"),
  );
  expect(problems, `${what}\n${problems.join("\n")}`).toEqual([]);
}
