# External evidence for case B: an outside AI using Willy Maker

On 2026-10-01 the user asked an AI agent outside this project (a general-purpose assistant with a browser, no access to this repository's agents) to "create a game using go-link.org/tools/willy-maker". It is an independent run of case B's first half, by a real outside user of the public site. Its files are kept with the experiment's shared evidence (the user's two zips and the texts inside them); this page summarizes them in English.

## What it made

- **Version 0.2 of a project**, in two levels: the Buenos Aires template, modified (8192 × 672), and a new level, "Terminal: Evacuation" (1536 × 224), with 4 enemies, 3 civilians, breakable crates and a bazooka.
- **A headless playthrough of "Terminal"** with Willy Maker's JavaScript engine: cleared, 3 of 3 rescued, 4 of 4 enemies down, 1456 frames. Its own report says: "Headless gameplay test of Terminal; this is not a MAME ROM test."
- **The project `.zip`** and a bundle with the AI pack, coordinates, tests and scripts that rebuild the project from this repository at commit `76cd798`.

## What it could not do, in its own words (translated)

- "It is not slammast.zip or a MAME ROM: it is Willy Maker's editable project."
- "The web's export ROM option belongs to a future stage; the current builder `rom/tools/build.mjs` only makes the fixed prototype and does not read `project.json`."
- "Building this version as a ROM needs the builder and the 68000 engine adapted to the project's maps and menus, the m68k compiler and z80asm installed, and a check in the emulator."
- "All enemy types share one behaviour; health, other weapons and checkpoints have no effect."

## Checked against the code

Verified in `frontend/apps/web/src/willy-maker/engine/game.ts` the same day: the bazooka is the only pickup with an effect (the flamethrower, spread, grenades and health are offered by the editor, `editor/parts.ts`, with none), camera locks work, every enemy kind shares one behaviour, and no tool turns a project into a ROM. Its claims were accurate, and it corrected its own earlier imprecision about the bazooka.

## Lessons for Willy Maker

1. **Parts without an effect must say so** (now marked "coming soon" and reported by the validator).
2. **The AI pack's `PROMPT.md` must state its limits first:** the tools it needs (`m68k-elf-gcc`, `z80asm`) and that `build.mjs` builds only the prototype until Create ROM exists.
3. **The AI pack is too heavy:** each 8192-px level picture is about 22 MB (70 MB unpacked for two levels); level pictures should be split into the board's tiles.
4. **Users expect a ROM from a "game maker":** the export page and the device must say clearly that a project or an AI pack is not playable (a dropped `.willy.zip` should get a message, not silence).
5. **Genres:** the same conversation asked for a beat 'em up; the engine has one genre today (platform shooter). See [the genre list](../willy-maker/genres.md).
