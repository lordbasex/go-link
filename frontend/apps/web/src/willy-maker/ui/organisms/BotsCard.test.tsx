// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LangProvider } from "../../i18n";
import { specProject } from "../../rom/specFixture";
import { BotsCard } from "./BotsCard";

describe("Test with bots card", () => {
  it("runs the bots and lists the ladder soft-lock with Go to its place", async () => {
    const onGo = vi.fn();
    const project = specProject();
    render(
      <LangProvider value="en">
        <BotsCard project={project} onGo={onGo} />
      </LangProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Run the bots" }));
    expect(await screen.findByRole("button", { name: "Run them again" }, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.getAllByText(/A player is stuck at x/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Blocks the game").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Go" })[0]!);
    expect(onGo).toHaveBeenCalledWith(expect.objectContaining({ tab: "build", level: project.levels[0]!.id }));
  });
});
