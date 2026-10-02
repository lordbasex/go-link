// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LangProvider } from "../i18n";
import { promptEn } from "../i18n/prompt.en";
import { promptEs } from "../i18n/prompt.es";
import { promptPt } from "../i18n/prompt.pt";
import { newProject } from "../model";
import { EditorStore } from "../editor/store";
import { ANIMS } from "../sprites/presets";
import { PromptDialog } from "../ui/organisms/PromptDialog";
import { buildPrompts, chatMessages, defaultChoices, FLAGS, mergeChoices, sheetsOf, SUBTYPES, type PromptKind } from "./imagePrompt";

afterEach(cleanup);

const KINDS = Object.keys(SUBTYPES) as PromptKind[];

/** A level 4 screens and a bit wide, with two sections. */
function project() {
  const p = newProject({ title: "Docks" });
  const l = p.levels[0]!;
  l.size.w = 1600;
  l.sections = [
    { ...(l.sections?.[0] ?? {}), name: "Pier", x0: 0, x1: 800 } as (typeof l.sections)[number],
    { ...(l.sections?.[0] ?? {}), name: "Tower", x0: 800, x1: 1600 } as (typeof l.sections)[number],
  ];
  return p;
}

describe("the image AI prompts", () => {
  it("asks image AIs for what they draw well: no pixel counts, no color counts, a shape instead of a size", () => {
    for (const kind of KINDS) {
      const r = buildPrompts(defaultChoices(kind));
      expect(r.prompts.length).toBeGreaterThan(0);
      for (const x of r.prompts) {
        // the board's limits are Willy Maker's job when the picture comes in
        expect(x.text).not.toMatch(/4 x 4|multiple of 17|12-bit|15 colors|exactly \d+ x \d+|board pixels/);
        expect(x.text).toContain("1990s arcade");
        expect(x.aspect).toMatch(/^\d+:\d+$/);
      }
      expect(r.negative).toContain("logos");
      expect(r.negative).toContain("text, labels");
    }
  });

  it("asks for art designed for the board's own screen, which survives it", () => {
    expect(buildPrompts(defaultChoices("background")).prompts[0]!.text).toContain("384 x 224 game pixels");
    expect(buildPrompts(defaultChoices("background")).prompts[0]!.text).toContain("no detail smaller than 2 game pixels");
    expect(buildPrompts(defaultChoices("character")).prompts[0]!.text).toContain("about 44 game pixels tall");
  });

  it("splits a background into one screen per picture, each continuing the last and naming its sections", () => {
    const p = project();
    const play = buildPrompts({ ...defaultChoices("background", p), sub: "play" }, p).prompts;
    expect(play).toHaveLength(Math.ceil(1600 / 384));
    expect(play.every((x) => x.aspect === "16:9")).toBe(true);
    expect(play[0]!.text).toContain("#FF00FF");
    expect(play[0]!.text).toContain('"Pier"');
    expect(play[0]!.text).not.toContain("continue the previous");
    expect(play[1]!.text).toContain("continue the previous picture seamlessly");
    expect(play.at(-1)!.text).toContain('"Tower"');
    const far = buildPrompts({ ...defaultChoices("background", p), sub: "far" }, p).prompts;
    expect(far).toHaveLength(Math.ceil((1600 / 2 + 384) / 384));
    expect(far[0]!.text).toContain("No floors, platforms or objects in front");
  });

  it("leaves the sky and the distance to the far layer, and floors and platforms to the play layer", () => {
    const p = project();
    const all = { ...defaultChoices("background", p), description: "" };
    const play = buildPrompts({ ...all, sub: "play" }, p).prompts[0]!.text;
    expect(play).not.toMatch(/sky band|skyline|reflections|a moon/);
    expect(play).toContain("walkable floor");
    const far = buildPrompts({ ...all, sub: "far" }, p).prompts[0]!.text;
    expect(far).toContain("skyline");
    expect(far).not.toMatch(/walkable floor|platforms a short jump/);
    const one = buildPrompts({ ...all, sub: "static" }, p).prompts[0]!.text;
    expect(one).toContain("skyline");
    expect(one).toContain("walkable floor");
  });

  it("asks for the shirt players 2 to 4 recolor only on a hero", () => {
    const base = defaultChoices("character");
    expect(buildPrompts(base).prompts[0]!.text).toContain("recolored for players 2 to 4");
    expect(buildPrompts({ ...base, sub: "enemy" }).prompts[0]!.text).not.toContain("recolored for players");
  });

  it("describes every chosen move and splits a big sheet into pictures of at most 6 animations", () => {
    const all = buildPrompts({ ...defaultChoices("character"), anims: ANIMS.hero.map((a) => a.name) }).prompts;
    expect(all).toHaveLength(sheetsOf(ANIMS.hero).length);
    expect(all.length).toBeGreaterThanOrEqual(4);
    expect(all[0]!.text).toContain("1. Idle (Standing still, breathing: the loop players see most): 4 frames, looping");
    expect(all[0]!.text).toContain("anticipation, impact and follow-through");
    expect(all[1]!.text).toContain("The same character as in the sprite sheet you made before");
    for (const sheet of sheetsOf(ANIMS.hero)) {
      expect(sheet.length).toBeLessThanOrEqual(6);
      expect(sheet.reduce((n, a) => n + a.frames, 0)).toBeLessThanOrEqual(32);
    }
  });

  it("asks to follow the attached pictures only when the user says they will attach them", () => {
    const base = defaultChoices("character");
    expect(buildPrompts(base).prompts[0]!.text).not.toContain("attached images");
    expect(buildPrompts({ ...base, flags: [...base.flags, "refs"] }).prompts[0]!.text).toContain("Use the attached images as the reference for the character's face, hair, build and clothes.");
  });

  it("turns objects and effects into a row of frames on magenta", () => {
    const o = buildPrompts({ ...defaultChoices("object"), sub: "vehicle", cellsW: 4, cellsH: 2, flags: ["side", "animated", "breakable"], frames: 3 }).prompts[0]!;
    expect(o.board).toEqual({ w: 64 * 3, h: 32 * 2 });
    expect(o.text).toContain("3 frames in one row");
    expect(o.text).toContain("broken in the second");
  });

  it("writes one chat message per picture, each with its shape and what to avoid", () => {
    const r = buildPrompts({ ...defaultChoices("character"), anims: ANIMS.hero.map((a) => a.name) });
    const msgs = chatMessages(r);
    expect(msgs).toHaveLength(r.prompts.length);
    msgs.forEach((m, i) => {
      expect(m).toContain(r.prompts[i]!.text);
      expect(m).toContain(`Make it a ${r.prompts[i]!.aspect} image`);
      expect(m).toContain(`Avoid: ${r.negative}.`);
    });
  });
  it("keeps each kind to its own fields: a character knows nothing about the place behind it", () => {
    const place = { location: "Puerto Madero", time: "night" as const, weather: "rain", palette: "white uniform", style: "1990s arcade" };
    const hero = buildPrompts({ ...defaultChoices("character"), ...place }).prompts[0]!.text;
    expect(hero).not.toMatch(/Puerto Madero|night|rain|Place and time/);
    expect(hero).toContain("Style: 1990s arcade");
    expect(hero).toContain("Colors: white uniform");
    const bg = buildPrompts({ ...defaultChoices("background"), ...place }).prompts[0]!.text;
    expect(bg).toContain("Place and time period: Puerto Madero");
    expect(bg).toContain("night, rain");
    for (const kind of ["object", "effect"] as const) expect(buildPrompts({ ...defaultChoices(kind), ...place }).prompts[0]!.text).not.toContain("Puerto Madero");
  });

  it("asks for the character reference when no animation is chosen", () => {
    const [ref] = buildPrompts({ ...defaultChoices("character"), anims: [] }).prompts;
    expect(ref!.text).toContain("Three large standing poses");
    expect(ref!.text).not.toContain("Rows, top to bottom");
    expect(ref!.aspect).toBe("16:9");
  });

  it("adds the user's own animations as rows, after the chosen built-in ones", () => {
    const c = { ...defaultChoices("character"), anims: ["walk", "bow"], customAnims: ["bow:5", "bad name:3"] };
    const text = buildPrompts(c).prompts[0]!.text;
    expect(text).toContain("1. Walk (Walking at normal speed): 8 frames, looping; 2. Bow: 5 frames");
    expect(text).not.toContain("Idle");
  });

  it("writes an before a vowel, and a free prompt asks for whatever was described", () => {
    expect(buildPrompts({ ...defaultChoices("effect"), sub: "explosion" }).prompts[0]!.text).toContain("an explosion effect");
    const free = buildPrompts({ ...defaultChoices("tiles"), sub: "free", description: "a sheet of coins and keys" }).prompts[0]!.text;
    expect(free).toContain("a sheet of coins and keys");
    expect(free).not.toContain("tile set");
  });

  it("keeps only well-typed saved choices (a project file is not trusted)", () => {
    const base = defaultChoices("background");
    const m = mergeChoices(base, { description: "Harbour", flags: ["sky", 3, null], frames: "lots", time: "noon", quality: "ultra", kind: "tiles", extra: 1 });
    expect(m.description).toBe("Harbour");
    expect(m.flags).toEqual(["sky"]);
    expect(m.frames).toBe(base.frames);
    expect(m.time).toBe(base.time);
    expect(m.quality).toBe("native");
    expect(m.kind).toBe("background");
    expect("extra" in m).toBe(false);
  });

  it("has Spanish and Portuguese texts for every option", () => {
    for (const msgs of [promptEn, promptEs, promptPt]) {
      for (const kind of KINDS) {
        for (const s of SUBTYPES[kind]) expect((msgs.subs[kind] as Record<string, string>)[s], `${kind}.${s}`).toBeTruthy();
        for (const f of FLAGS[kind]) expect((msgs.flags[kind] as Record<string, string[]>)[f.id]?.length, `${kind}.${f.id}`).toBe(2);
      }
    }
  });
});

describe("the prompt dialog", () => {
  it("writes the prompt as the user types, copies it and keeps the choices with the game", () => {
    const p = newProject({ title: "Docks" });
    const store = new EditorStore(p);
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    const onClose = vi.fn();
    render(
      <LangProvider value="es">
        <PromptDialog store={store} project={p} kind="object" onClose={onClose} />
      </LangProvider>,
    );
    fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "a red sports car" } });
    expect(screen.getAllByText(/a red sports car/).length).toBeGreaterThan(0);
    // the help of each option is reachable by keyboard and read by screen readers
    expect(screen.getByRole("button", { name: "Qué cambia esto: Rompible" })).toHaveAccessibleDescription(promptEs.flags.object.breakable[1]);
    fireEvent.click(screen.getAllByRole("button", { name: /^Copiar/ })[0]!);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("a red sports car"));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalled();
    expect((store.project.settings.imagePrompts?.object as { description?: string })?.description).toBe("a red sports car");
    // one undo step takes them away
    store.undo();
    expect(store.project.settings.imagePrompts?.object).toBeUndefined();
  });

  it("chooses all or none of the animations, and takes the user's own", () => {
    const p = newProject({ title: "Docks" });
    render(<PromptDialog store={new EditorStore(p)} project={p} kind="character" onClose={() => {}} />);
    expect(screen.queryByLabelText("Place and time period")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "None" }));
    expect(screen.getByText("0 chosen")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Your own animation"), { target: { value: "Bow" } });
    fireEvent.change(screen.getByLabelText("Frames"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
    expect((screen.getByRole("checkbox", { name: /bow/ }) as HTMLInputElement).checked).toBe(true);
    expect(document.querySelector(".wm-prompt-out pre")!.textContent).toContain("1. Bow: 5 frames");
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText(`${ANIMS.hero.length + 1} chosen`)).toBeTruthy();
  });

  it("opens on the kind and layer it was called from, and switches kinds", () => {
    const p = newProject({ title: "Docks" });
    render(<PromptDialog store={new EditorStore(p)} project={p} kind="background" sub="far" onClose={() => {}} />);
    expect((screen.getByLabelText("Which one") as HTMLSelectElement).value).toBe("far");
    fireEvent.click(screen.getByRole("radio", { name: "Character" }));
    const kick = screen.getByRole("checkbox", { name: /jump_kick/ });
    // focusing an animation shows what it is (Willy playing it when the sheet loads)
    fireEvent.focus(kick);
    expect(screen.getByRole("tooltip").textContent).toContain(promptEn.animDesc.jump_kick);
    expect(kick).toHaveAccessibleDescription(expect.stringContaining("Down + B2"));
    fireEvent.blur(kick);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("has a description of every preset animation in every language", () => {
    for (const msgs of [promptEn, promptEs, promptPt])
      for (const role of Object.keys(ANIMS) as (keyof typeof ANIMS)[]) for (const a of ANIMS[role]) expect(msgs.animDesc[a.name], a.name).toBeTruthy();
  });
});
