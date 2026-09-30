// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { describe, expect, it } from "vitest";
import { WORD_CLASS, atomize } from "./atomize";

describe("atomize", () => {
  it("wraps every word in its own piece and keeps the spaces and the rest", () => {
    const root = document.createElement("div");
    root.innerHTML = "<h1>Your arcade, <em>online.</em></h1><p>  Play  together </p><svg><text>skip me</text></svg><script>no()</script>";
    expect(atomize(root)).toBe(5);
    const words = [...root.querySelectorAll(`.${WORD_CLASS}`)].map((w) => w.textContent);
    expect(words).toEqual(["Your", "arcade,", "online.", "Play", "together"]);
    expect(root.querySelector("p")?.textContent).toBe("  Play  together ");
    expect(root.querySelector("svg text")?.textContent).toBe("skip me");
    // Running it again changes nothing.
    expect(atomize(root)).toBe(0);
  });

  it("keeps the spaces between words inside a flex container", () => {
    const root = document.createElement("div");
    root.innerHTML = '<span style="display: inline-flex">Only for invited players</span>';
    document.body.appendChild(root);
    expect(atomize(root)).toBe(4);
    const chip = root.firstElementChild!;
    // The words sit in one wrapper, so the flex container keeps them as one item with its spaces.
    expect(chip.children).toHaveLength(1);
    expect(chip.textContent).toBe("Only for invited players");
    root.remove();
  });
});

describe("the game never touches its own interface", () => {
  it("effects only change elements inside the page copy", async () => {
    const { Effects } = await import("./effects");
    const layer = document.createElement("div");
    const inside = document.createElement("div");
    layer.appendChild(inside);
    const hud = document.createElement("div");
    hud.setAttribute("data-destroy-ui", "");
    document.body.append(layer, hud);
    const fx = new Effects(layer, true);
    const body = { x: 0, y: 0, w: 100, h: 40, kind: "box" as const, parent: -1, color: "#888", id: 0, children: [], hp: 1, maxHp: 1, alive: false, weight: 4, platform: true, solid: true };
    fx.shatter(hud, body, true);
    fx.hole(hud, body, 5, 5);
    expect(hud.style.visibility).toBe("");
    expect(hud.style.getPropertyValue("mask-image")).toBe("");
    fx.shatter(inside, body, false);
    expect(inside.style.visibility).toBe("hidden");
    layer.remove();
    hud.remove();
  });

  it("the interface draws again after a screen fails once", async () => {
    const { render, screen, act } = await import("@testing-library/react");
    const { Guard } = await import("../ui/Guard");
    let fail = true;
    const Flaky = () => {
      if (fail) {
        fail = false;
        throw new Error("once");
      }
      return <p>HUD</p>;
    };
    const quiet = console.error;
    console.error = () => undefined;
    render(
      <Guard>
        <Flaky />
      </Guard>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    console.error = quiet;
    expect(screen.getByText("HUD")).toBeInTheDocument();
  });
});
