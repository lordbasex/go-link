# Case C: how to do it again

From a clean checkout of `exp1/case-c` to the same `slammast.zip` (SHA-256 `b1742aac038263f5f8323bdb64a99ce2c579c98192c699abab2f87c94f45d990`) and the same test results. macOS with Homebrew; paths are from the repository's root.

## 1. Tools

```sh
brew install m68k-elf-binutils m68k-elf-gcc z80asm ffmpeg
# Node 22.18 or newer (the tools import TypeScript); 22.23.2 was used
(cd frontend && npm ci)
(cd e2e && npm ci && npx playwright install chromium)     # for the recorded session
# the device CLI with "romtest --input" (make device-darwin-universal) and its core (device core download)
```

## 2. The engine (only when `rom/engine/` or the art changes)

```sh
node rom/tools/engine.mjs --check   # must print "the committed engine matches this build"
node rom/tools/engine.mjs           # rewrites frontend/apps/web/public/willy-maker/engine/ after a change
```

If `--check` fails without a change of yours, the committed binary is not the source's build: see D-016.

## 3. The tests

```sh
cd frontend
npm run typecheck && CI=true npx vitest run && npm run build
WM_ROM_OUT=/tmp/wm npx vitest run apps/web/src/willy-maker/rom/rom.test.tsx   # the spec level from code, with its zip
```

## 4. Make the level in the browser, as the user

```sh
(cd frontend && npm run dev -w apps/web -- --port 5302 --strictPort)    # leave it running
PLAYWRIGHT=$PWD/e2e/node_modules/playwright/index.mjs node docs/experiments/case-c/session/session.mjs /tmp/session
node docs/experiments/case-c/session/publish.mjs /tmp/session --mp4 /tmp/session/session.mp4
shasum -a 256 /tmp/session/slammast.zip     # b1742aac…
```

The script prints each of its 82 steps and must end with `82 steps, 0 errors`. By hand, the steps are the ones in [evidence/session/guide.html](evidence/session/guide.html), in that order: New game → 4 players · 3 buttons → Empty → title "Willy Gorklingo", author, 2 players → "Dead Air", 4 screens, 448 px → Create; zoom out 4 times and click the middle of the map strip; Far background layer, Tiles, Fill: sky tiles 1, 3 and 5 over far rows 0-4, 5-9 and 10-13; Collision layer, Terrain, Pencil, Crate at cells (10,24), (12,24), (12,22); Fill, Platform over (16,22)-(22,22), Ladder over (30,16)-(30,25), Solid over (31,16)-(63,16); Pencil, Enemies › Trooper at (640,416), (800,256), (1360,416); Civilians › Woman at (320,352), Child at (960,256); Helpers › Exit at (1440,416) and Width 64; Game tab: hits 3, 100 per enemy, 500 per rescue, touching hurts Yes, chase No, shoot No, the exit needs every enemy down Yes, after a hit Blink in place, blinking 60 frames, lives 3; Menus: title WILLY GORKLINGO, subtitle THE LAG PROTOCOL, HUD › Level clear SECTION CLEAR; Export › Create ROM → It boots → Download ROM, Symbol map.

## 5. Acceptance

```sh
node rom/tools/lab/acceptance.mjs docs/experiments/case-c/build/slammast.zip --script docs/experiments/case-c/runs/clear.json \
  --out /tmp/case-c-acceptance --bot-games 5 --laya-games 3 \
  --device dist/device/darwin-universal/go-link.app/Contents/MacOS/go-link-device
node rom/tools/lab/run.mjs docs/experiments/case-c/build/slammast.zip --out /tmp/damage --script docs/experiments/case-c/runs/damage.json
node rom/tools/lab/run.mjs docs/experiments/case-c/build/slammast.zip --out /tmp/odd --script docs/experiments/case-c/runs/odd-inputs.json
```

Expected: level 3 and level 4 pass; the scripted run clears at frame 1883 with every expectation; the core gives the same pixels at all 11 checkpoints; the route bot clears 5 of 5; Laya clears none (it presses fire). The damage script ends in GAME OVER at frame 1273; the odd-inputs script keeps playing to frame 900.

## 6. A new clear script for a changed level

```sh
node rom/tools/lab/run.mjs ZIP --out /tmp/route --player "node docs/experiments/case-c/runs/route-player.mjs" --frames 3000
node docs/experiments/case-c/runs/make-clear.mjs /tmp/route > docs/experiments/case-c/runs/clear.json
```

## When something differs

- **Another zip hash:** check `engine.mjs --check`, then compare the guide's screenshots with yours: a click that lands on another cell (the canvas's `data-view` gives the mapping) changes the level.
- **`romtest` fails to start:** the core is missing (`device core download`).
- **Laya is very slow:** it runs on the CPU at 0.3-4 s per decision depending on the machine's load; three games take 15 minutes to over an hour.
