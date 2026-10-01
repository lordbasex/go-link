// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToolsPage } from "./ToolsPage";

describe("ToolsPage", () => {
  it("links every tool, Willy Maker included", () => {
    render(
      <MemoryRouter>
        <ToolsPage />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toEqual(["/test-controller", "/tools/skin-editor", "/tools/games", "/tools/willy-maker"]);
    expect(screen.getByText("Willy Maker")).toBeInTheDocument();
  });
});
