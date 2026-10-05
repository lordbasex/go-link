// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NumberInput } from "./Panels";

afterEach(cleanup);

describe("the inspector's number fields", () => {
  it("lets a value pass through numbers below the minimum while it is typed (64 into a 16 px minimum is 64, not 164)", () => {
    const onChange = vi.fn();
    render(<NumberInput label="Width" value={32} min={16} max={1536} step={16} onChange={onChange} />);
    const input = screen.getByRole("spinbutton", { name: "Width" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "6" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("6");
    fireEvent.change(input, { target: { value: "64" } });
    expect(onChange).toHaveBeenLastCalledWith(64);
  });

  it("keeps the value in range when the field is left", () => {
    const onChange = vi.fn();
    render(<NumberInput label="Width" value={32} min={16} max={1536} onChange={onChange} />);
    const input = screen.getByRole("spinbutton", { name: "Width" });
    fireEvent.change(input, { target: { value: "6" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(16);
    fireEvent.change(input, { target: { value: "9999" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(1536);
  });
});
