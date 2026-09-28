// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GamePicker, type GameOption } from "./GamePicker";

afterEach(() => cleanup());

const options: GameOption[] = Array.from({ length: 500 }, (_, i) => ({
  id: `set${i}`,
  game: i === 42 ? "Galaga" : `Game ${i}`,
  detail: "1981 · Namco",
}));

describe("game picker", () => {
  it("searches a big library and picks with the keyboard", async () => {
    const onChange = vi.fn();
    render(<GamePicker options={options} value="set0" onChange={onChange} label="Game" />);
    await userEvent.click(screen.getByRole("button", { name: "Game: Game 0" }));
    const list = screen.getByRole("listbox");
    expect(within(list).getAllByRole("option")).toHaveLength(80); // not all 500
    expect(screen.getByText("Showing 80 of 500: type to narrow")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("combobox"), "gala");
    expect(within(list).getAllByRole("option")).toHaveLength(1);
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("set42");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
