// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { WillyMakerApp } from "..";
import { coreEn } from "../i18n/core.en";
import { coreEs } from "../i18n/core.es";
import { corePt } from "../i18n/core.pt";
import { listProjects, saveProject } from "../io/storage";
import { newProject } from "../model";

function shape(v: unknown): unknown {
  if (typeof v === "function") return "fn";
  if (Array.isArray(v)) return v.map(shape);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]).sort());
  return typeof v;
}

beforeEach(() => window.localStorage.clear());

describe("Willy Maker app", () => {
  it("keeps the same texts in every language", () => {
    expect(shape(coreEs)).toEqual(shape(coreEn));
    expect(shape(corePt)).toEqual(shape(coreEn));
  });

  it("creates a game with the wizard and opens the IDE", async () => {
    let opened: string | null = null;
    render(<WillyMakerApp lang="en" onProjectId={(id) => (opened = id)} />);
    expect(screen.getByText("No games yet. Start one with “New game”.")).toBeInTheDocument();
    // step 1: the genre, only the platform shooter can be chosen today
    const genres = within(screen.getByRole("radiogroup", { name: "What kind of game?" })).getAllByRole("radio");
    expect(genres).toHaveLength(13);
    expect(genres.filter((g) => !(g as HTMLButtonElement).disabled).map((g) => g.textContent)).toEqual([expect.stringContaining("Platform shooter")]);
    expect(genres.filter((g) => g.textContent?.includes("Coming soon"))).toHaveLength(12);
    expect(genres[0]).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: /Beat 'em up/ }));
    expect(genres[0]).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: /Next: the board/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Empty/ }));
    fireEvent.click(screen.getByRole("button", { name: /Next: name and players/ }));
    fireEvent.change(screen.getByLabelText("Game title"), { target: { value: "Dead Air" } });
    fireEvent.click(screen.getByRole("radio", { name: "2 players" }));
    fireEvent.click(screen.getByRole("button", { name: /Next: the first level/ }));
    fireEvent.click(screen.getByRole("radio", { name: "8 screens" }));
    fireEvent.click(screen.getByRole("button", { name: "Create the game" }));
    await waitFor(() => expect(listProjects()).toHaveLength(1));
    const saved = listProjects()[0]!;
    expect(saved.title).toBe("Dead Air");
    expect(opened).toBe(saved.id);
    expect(await screen.findByRole("button", { name: "Build" })).toBeInTheDocument();
    expect(screen.getByTitle("Play the level (P)")).toBeInTheDocument();
    expect(screen.getByTitle("Genre")).toHaveTextContent("Platform shooter");
  });

  it("lists saved games and opens one in Spanish", async () => {
    const p = newProject({ title: "Mi juego" });
    saveProject(p);
    render(<WillyMakerApp lang="es" />);
    expect(screen.getByText("Mi juego")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    expect(await screen.findByRole("button", { name: "Construir" })).toBeInTheDocument();
    expect(screen.getByText(/guardado en este navegador/)).toBeInTheDocument();
  });

  it("asks before deleting a game", async () => {
    saveProject(newProject({ title: "Gone" }));
    render(<WillyMakerApp lang="en" />);
    fireEvent.click(screen.getByRole("button", { name: "More for Gone" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Delete “Gone” from this browser?");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(listProjects()).toHaveLength(0));
  });

  it("opens the game named in the address", async () => {
    const p = newProject({ title: "Linked" });
    saveProject(p);
    render(<WillyMakerApp lang="en" projectId={p.id} />);
    expect(await screen.findByText("Level 1 · Level 1")).toBeInTheDocument();
  });
});
