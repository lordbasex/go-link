// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeButton } from "./Headers";
import { setTheme, THEME_KEY } from "../theme";

afterEach(() => {
  cleanup();
  setTheme("dark");
});

describe("theme button", () => {
  it("switches between dark and light and remembers the choice", async () => {
    const user = userEvent.setup();
    render(<ThemeButton />);
    expect(document.documentElement.dataset.theme).toBeUndefined();

    await user.click(screen.getByRole("button", { name: "Light mode" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("light");

    await user.click(screen.getByRole("button", { name: "Dark mode" }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");
  });
});
