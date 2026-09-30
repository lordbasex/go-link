// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GamesPage } from "./GamesPage";

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("mini-games", () => {
  it("lists the six games and opens one with its score and measurements", () => {
    render(
      <MemoryRouter initialEntries={["/tools/games"]}>
        <GamesPage />
      </MemoryRouter>,
    );
    const names = ["Link", "Snake", "Memory", "Paddle", "Racer", "Special moves"];
    for (const n of names) expect(screen.getByRole("button", { name: new RegExp(n) })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Racer/ }));
    expect(screen.getByRole("heading", { level: 1, name: "Racer" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Racer: game board" })).toBeInTheDocument();
    expect(screen.getByText("R2 deepest")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /All games/ }));
    expect(screen.getByRole("heading", { level: 1, name: "Controller mini-games" })).toBeInTheDocument();
  });

  it("opens a game straight from its link", () => {
    render(
      <MemoryRouter initialEntries={["/tools/games?g=moves"]}>
        <GamesPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Special moves" })).toBeInTheDocument();
    expect(screen.getByText(/Do: Quarter circle forward/)).toBeInTheDocument();
  });
});
