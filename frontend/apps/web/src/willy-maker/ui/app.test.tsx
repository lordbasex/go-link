// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { WillyMakerApp } from "..";
import { coreEn } from "../i18n/core.en";
import { coreEs } from "../i18n/core.es";
import { corePt } from "../i18n/core.pt";
import { listProjects, loadProject, saveProject } from "../io/storage";
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
    // step 1: the genre, the platform shooter and the platformer can be chosen today (T-22)
    const genres = within(screen.getByRole("radiogroup", { name: "What kind of game?" })).getAllByRole("radio");
    expect(genres).toHaveLength(13);
    expect(genres.filter((g) => !(g as HTMLButtonElement).disabled).map((g) => g.textContent)).toEqual([expect.stringContaining("Platform shooter"), expect.stringContaining("Platformer")]);
    expect(genres.filter((g) => g.textContent?.includes("Coming soon"))).toHaveLength(11);
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
    // how many play is in the top bar, and changes the game (T-23)
    const players = screen.getByRole("combobox", { name: "Players" }) as HTMLSelectElement;
    expect(players.value).toBe("2");
    expect([...players.options].map((o) => o.textContent)).toEqual(["1 player", "2 players", "3 players", "4 players"]);
    fireEvent.change(players, { target: { value: "1" } });
    await waitFor(() => expect(loadProject(saved.id)?.settings.players).toBe(1), { timeout: 5000 });
  }, 20000); // about 1 s; the CI runner once took over 5 s while the heavy fuzz tests ran beside it

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
