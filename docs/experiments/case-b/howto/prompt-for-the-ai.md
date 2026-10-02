# The prompt for the blind builder (case B, part 2)

Paste the block below as the whole first message to a fresh coding agent that runs inside a go-link checkout at `23806b8` (plus the patches the guide lists). Replace the two paths in angle brackets. Do not add anything about step 1, the other cases or this guide: the builder must be blind to them.

The block has two parts. The first sets the same conditions the blind run of 2026-10-01 had (its records state them: [rom/decisions.md](../rom/decisions.md), the paragraph before D-101, and D-101 to D-102). The second is the pack's own `PROMPT.md`, exactly as Willy Maker's **Copy prompt** button puts it on the clipboard (the same text as `PROMPT.md` inside the pack; the case's copy is [evidence/pack-extract/PROMPT.md](../evidence/pack-extract/PROMPT.md)).

```text
You are the builder of case B, step 2, of experiment 1 (docs/experiments/README.md).
You get only an AI pack exported by Willy Maker and the tools in rom/. Build the ROM
set from the pack.

- The pack is unzipped in <PACK DIR> (ai-pack.zip, 15 entries). Its PROMPT.md is your
  spec; it is pasted below.
- Of docs/experiments/README.md read only "Acceptance", "Records" and "The harness",
  plus docs/experiments/harness.md. Do not read docs/experiments/case-b/ (step 1's
  records) or any other case's folder.
- Work in this checkout on a branch of your own (the case used exp1/case-b-rom). Keep the records
  that "Records" lists in docs/experiments/case-b/rom/ (decisions.md as D-101, D-102...,
  journal.md, metrics.json, trace.md, evidence/), commit small, and end every commit
  message with "Decision: D-1NN" lines.
- Put the set, its symbol map and the linker map in docs/experiments/case-b/build/,
  and your clear script in docs/experiments/case-b/runs/clear.json (it must reach the
  exit with every enemy down).
- Run the acceptance with rom/tools/lab/acceptance.mjs (5 bot games, 3 Laya games).
- Record every place where the pack was not enough, was wrong, or could be read two
  ways, and what you did about it. Do not change the pack.
- Never touch a running go-link app, its device.json or the user's ROM folder. Use
  only the ports you are given: <PORTS, e.g. 5408-5409>.

--- PROMPT.md of the pack ---

<paste the clipboard from Willy Maker's "Copy prompt", or the pack's PROMPT.md>
```

What the 2026-10-01 builder received as `PROMPT.md` is 7 889 bytes, 104 lines, starts `# Willy Gorklingo: build the ROM`, and has SHA-256 `b26a266facc17cab2b2274a86e34b5ccffdbb2da2a1ecf1f1c340e901cd25654`. Check yours with:

```sh
unzip -p willy-gorklingo.ai-pack.zip PROMPT.md | shasum -a 256
```

It must match: `PROMPT.md` carries no project id or time. The guide's verification run (2026-10-01, 22:47) got the same hash both from the new pack and from the clipboard after **Copy prompt** (the driver saves it as `prompt-copied.md`).
