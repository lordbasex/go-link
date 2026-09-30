// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SkinEditorPage } from "./SkinEditorPage";
import { smokeSkin } from "../skins/builtin";
import { STORE_KEY, type Library } from "../skins/store";
import { WELCOME_KEY } from "../skins/Welcome";

const stored = () => JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as Library;
const open = () => render(<MemoryRouter><SkinEditorPage /></MemoryRouter>);
const myButton = () => screen.getByRole("button", { name: /^My skins/ });

beforeEach(() => {
  localStorage.clear();
  // The library tests start past the first-visit welcome (it has its own tests below).
  localStorage.setItem(WELCOME_KEY, "1");
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("skin editor library", () => {
  it("edits a built-in skin into a copy of its own", () => {
    open();
    expect(screen.getByText("Built-in · read-only")).toBeInTheDocument();
    expect(stored().skins).toEqual({});

    fireEvent.change(screen.getByLabelText(/^Gloss/), { target: { value: "0.5" } });
    expect(screen.queryByText("Built-in · read-only")).not.toBeInTheDocument();
    const lib = stored();
    const recs = Object.values(lib.skins);
    expect(recs).toHaveLength(1);
    expect(lib.current).toBe(Object.keys(lib.skins)[0]);
    expect(recs[0]!.skin.id).toBe("my-smoke");
    expect(recs[0]!.skin.name.en).toBe("Smoke (copy)");
    expect(recs[0]!.skin.shell?.gloss).toBe(0.5);
    // The built-in skin itself never changes.
    expect(smokeSkin()!.shell?.gloss).not.toBe(0.5);

    // Further changes go to the same record.
    fireEvent.change(screen.getByLabelText(/^Grain/), { target: { value: "0.2" } });
    expect(Object.values(stored().skins)).toHaveLength(1);
    expect(Object.values(stored().skins)[0]!.skin.shell?.grain).toBe(0.2);
  });

  it("keeps several skins: New, switching, duplicate and a delete that asks first", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    expect(Object.keys(stored().skins)).toHaveLength(2);
    expect(Object.values(stored().skins).map((r) => r.skin.id).sort()).toEqual(["my-skin", "my-skin-2"]);

    fireEvent.click(myButton());
    const list = screen.getByRole("dialog", { name: "My skins" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);

    // Switch to the other one.
    const other = Object.entries(stored().skins).find(([id]) => id !== stored().current)!;
    fireEvent.click(within(list).getByText(new RegExp(`^${other[1].skin.id} · `)));
    expect(stored().current).toBe(other[0]);
    expect(screen.getByDisplayValue(other[1].skin.id)).toBeInTheDocument();

    fireEvent.click(myButton());
    fireEvent.click(within(screen.getByRole("dialog")).getAllByRole("button", { name: "Duplicate" })[0]!);
    expect(Object.keys(stored().skins)).toHaveLength(3);

    // Delete asks in the list itself; Cancel keeps the skin.
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Delete" })[0]!);
    expect(within(dialog).getByText(/^Delete .*\?$/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(Object.keys(stored().skins)).toHaveLength(3);
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Delete" })[0]!);
    fireEvent.click(within(within(dialog).getByRole("group", { name: /^Delete .*\?$/ })).getByRole("button", { name: "Delete" }));
    expect(Object.keys(stored().skins)).toHaveLength(2);
  });
});

describe("skin editor welcome", () => {
  it("opens on the first visit, walks its steps and is not shown again once closed", () => {
    localStorage.removeItem(WELCOME_KEY);
    open();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Design skins for the go-link apps" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    expect(within(dialog).getByRole("heading", { name: "The canvas" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(within(dialog).getByRole("heading", { name: "Precise to the pixel" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Skip" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem(WELCOME_KEY)).toBe("1");
    cleanup();
    open();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reopens from the Guide button and closes with Escape", () => {
    open();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "What this tool does, step by step" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("still opens when the browser blocks storage", () => {
    localStorage.removeItem(WELCOME_KEY);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    open();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
