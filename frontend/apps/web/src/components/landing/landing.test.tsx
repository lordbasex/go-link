// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { setLang } from "../../i18n";
import { en } from "../../i18n/en";
import { es } from "../../i18n/es";
import { pt } from "../../i18n/pt";
import { androidAppUrl } from "../AndroidAppCard";
import { GALLERY, Gallery } from "./Gallery";
import { GuestPath } from "./GuestPath";
import { PlayerApp } from "./PlayerApp";
import { Wizard } from "./Wizard";
import sizes from "./shots.json";

beforeEach(() => setLang("en"));
afterEach(() => {
  cleanup();
  setLang("en");
});

/** The gallery's caption as shown: "Web · …", "Computer · …" or "App · …". */
const caption = (i: number) => {
  const name = GALLERY[i]!;
  const group = name.startsWith("web-") ? en.gallery.web : name.startsWith("win-") ? en.gallery.computer : en.gallery.app;
  return `${group} · ${en.gallery.items[name].caption}`;
};

describe("landing screenshots", () => {
  it("every gallery picture has a size, and a caption and alt text in every language", () => {
    for (const name of GALLERY) {
      expect(sizes[name]).toHaveLength(2);
      for (const m of [en, es, pt]) {
        expect(m.gallery.items[name].caption).not.toBe("");
        expect(m.gallery.items[name].alt).not.toBe("");
      }
    }
  });

  it("the guest path shows the three steps with their pictures, Android as a download and iOS as not out yet", async () => {
    let joined = 0;
    render(<GuestPath onJoin={() => joined++} />);
    expect(screen.getByRole("heading", { level: 2, name: en.guestPath.title })).toBeInTheDocument();
    for (const s of en.guestPath.steps) expect(screen.getByRole("img", { name: s.alt })).toHaveAttribute("loading", "lazy");
    expect(screen.getByRole("img", { name: en.guestPath.steps[0]!.alt })).toHaveAttribute("src", "/shots/en/app-home.webp");
    expect(screen.getByRole("img", { name: en.guestPath.steps[0]!.alt })).toHaveAttribute("width", String(sizes["app-home"][0]));
    expect(screen.getByRole("link", { name: en.playerApp.android })).toHaveAttribute("href", androidAppUrl());
    expect(screen.getByText(en.playerApp.ios).closest("a, button")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: en.guestPath.browserCta }));
    expect(joined).toBe(1);
  });

  it("the pictures follow the page's language", () => {
    setLang("es");
    render(<PlayerApp />);
    expect(screen.getByRole("img", { name: es.playerApp.roomAlt })).toHaveAttribute("src", "/shots/es/app-room.webp");
    expect(screen.getByRole("link", { name: es.playerApp.android })).toHaveAttribute("href", androidAppUrl());
    expect(screen.getByText(es.playerApp.ios).closest("a, button")).toBeNull();
  });

  it("the gallery has captions; a picture opens large, the arrows move and Esc closes", async () => {
    render(<Gallery />);
    expect(screen.getAllByRole("figure")).toHaveLength(GALLERY.length);
    expect(screen.getByText(caption(3))).toBeInTheDocument();
    const thumb = screen.getByRole("button", { name: en.gallery.open(caption(3)) });
    await userEvent.click(thumb);
    const dialog = screen.getByRole("dialog", { name: caption(3) });
    const name = GALLERY[3]!;
    expect(within(dialog).getByRole("img", { name: en.gallery.items[name].alt })).toHaveAttribute("width", String(sizes[name][0]));
    expect(within(dialog).getByText(en.gallery.counter(4, GALLERY.length))).toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("dialog", { name: caption(4) })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: en.gallery.prev }));
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("dialog", { name: caption(2) })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(thumb).toHaveFocus();
  });

  it("the walkthrough shows real screenshots for each step", async () => {
    render(
      <MemoryRouter>
        <Wizard />
      </MemoryRouter>,
    );
    expect(screen.getByRole("img", { name: en.wizard.shots[0]!.main })).toHaveAttribute("src", "/shots/en/win-pairing.webp");
    await userEvent.click(screen.getByRole("button", { name: en.wizard.goTo(4, en.wizard.steps[3]!.short) }));
    expect(screen.getByRole("img", { name: en.wizard.shots[3]!.main })).toHaveAttribute("src", "/shots/en/web-invite.webp");
    expect(screen.getByRole("img", { name: en.wizard.shots[3]!.inset })).toHaveAttribute("src", "/shots/en/app-pin.webp");
  });
});
