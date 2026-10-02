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
import { buildPrompts, defaultChoices, FLAGS, mergeChoices, SCALE, SUBTYPES, type PromptKind } from "./imagePrompt";

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
  it("sizes every picture at exactly 4 times the board's pixels", () => {
    const p = project();
    const h = p.levels[0]!.size.h;
    const far = buildPrompts({ ...defaultChoices("background", p), sub: "far" }, p).prompts;
    expect(far).toHaveLength(1);
    // half the level plus one screen, as the far layer moves at half speed
    expect(far[0]!.size).toEqual({ w: (1600 / 2 + 384) * SCALE, h: h * SCALE });
    expect(far[0]!.text).toContain("fully opaque");
    const one = buildPrompts({ ...defaultChoices("background", p), sub: "static" }, p).prompts[0]!;
    expect(one.size).toEqual({ w: 1536, h: 896 });
  });

  it("splits the play layer into 4-screen stretches on magenta, naming the sections each one shows", () => {
    const p = project();
    const play = buildPrompts({ ...defaultChoices("background", p), sub: "play" }, p).prompts;
    expect(play.map((x) => x.size.w)).toEqual([6144, (1600 - 1536) * SCALE]);
    expect(play[0]!.text).toContain("#FF00FF");
    expect(play[0]!.text).toContain('"Pier"');
    expect(play[0]!.text).toContain('"Tower"');
    expect(play[1]!.text).not.toContain('"Pier"');
    expect(play[1]!.text).toContain("stretch 2 of 2");
    // a panorama is one strip as long as the level
    expect(buildPrompts({ ...defaultChoices("background", p), sub: "panorama" }, p).prompts.map((x) => x.size.w)).toEqual([6400]);
  });

  it("asks for a character sheet with one row per chosen animation and its preset frames", () => {
    const c = { ...defaultChoices("character"), anims: ["idle", "run", "jump"] };
    const [sheet] = buildPrompts(c).prompts;
    const rows = ANIMS.hero.filter((a) => c.anims.includes(a.name));
    for (const a of rows) expect(sheet!.text).toContain(`${a.name} (${a.frames}`);
    expect(sheet!.text).toContain("176 pixels tall (44 board pixels)");
    expect(sheet!.text).toContain("#FF00FF");
    expect(sheet!.size.h % (16 * SCALE)).toBe(0);
    expect(sheet!.size.h / SCALE / rows.length).toBe(64);
  });

  it("puts the board's color limits and the style rule in every prompt, and a negative prompt for each kind", () => {
    for (const kind of KINDS) {
      const r = buildPrompts(defaultChoices(kind));
      expect(r.prompts.length).toBeGreaterThan(0);
      for (const x of r.prompts) {
        expect(x.text).toContain("multiple of 17");
        expect(x.text).toContain("at most 15 colors in any 16 x 16");
        expect(x.text).toContain("no existing characters, logos, names or text");
      }
      expect(r.negative).toContain("anti-aliasing");
      expect(r.negative).toContain("logos");
    }
  });

  it("turns objects and effects into rows of frames in 16 px cells", () => {
    const o = buildPrompts({ ...defaultChoices("object"), sub: "vehicle", cellsW: 4, cellsH: 2, flags: ["side", "animated", "breakable"], frames: 3 }).prompts[0]!;
    expect(o.size).toEqual({ w: 64 * 3 * SCALE, h: 32 * 2 * SCALE });
    expect(o.text).toContain("3 frames in one row");
    expect(o.text).toContain("broken one in the second");
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

  it("opens on the kind and layer it was called from, and switches kinds", () => {
    const p = newProject({ title: "Docks" });
    render(<PromptDialog store={new EditorStore(p)} project={p} kind="background" sub="far" onClose={() => {}} />);
    expect((screen.getByLabelText("Which one") as HTMLSelectElement).value).toBe("far");
    fireEvent.click(screen.getByRole("radio", { name: "Character" }));
    expect(screen.getByRole("checkbox", { name: /jump_kick/ })).toBeTruthy();
  });
});
