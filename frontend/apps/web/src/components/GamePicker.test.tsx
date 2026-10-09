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

  it("leaves the search to the device when the library is remote", async () => {
    const onQuery = vi.fn();
    const onMore = vi.fn();
    const page = options.slice(0, 60);
    render(
      <GamePicker
        options={page}
        value="set300"
        selectedOption={options[300]}
        onChange={vi.fn()}
        label="Game"
        remote={{ total: 5000, loading: false, onQuery, onMore }}
      />,
    );
    // The chosen game is shown even when it is on no page loaded.
    await userEvent.click(screen.getByRole("button", { name: "Game: Game 300" }));
    const list = screen.getByRole("listbox");
    expect(within(list).getAllByRole("option")).toHaveLength(60);
    expect(screen.getByText("Showing 60 of 5000: type to narrow")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("combobox"), "gala");
    expect(onQuery).toHaveBeenLastCalledWith("gala");
    // No filter here: the options are already the device's matches.
    expect(within(list).getAllByRole("option")).toHaveLength(60);
    Object.defineProperties(list, { scrollHeight: { value: 3000 }, clientHeight: { value: 400 }, scrollTop: { value: 2500, writable: true } });
    list.dispatchEvent(new Event("scroll"));
    expect(onMore).toHaveBeenCalled();
  });
});
