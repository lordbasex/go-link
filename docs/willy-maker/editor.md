# Willy Maker: the editor

Willy Maker's editor is a full-screen, Photoshop-like workspace in which you put a picture behind the level, mark on it what each part is (zones: floor, platform, ladder, crate, breakable, hazard), place characters, organise everything in layers and groups, and play it at once with debug overlays. It was built step by step next to the classic editor and is the default since step 8; the classic one stays behind a switch.

- **Addresses**: `https://maker.go-link.org/` is My games, `https://maker.go-link.org/<game id>` opens that game. `?editor=classic` switches this browser to the classic editor and its home (remembered in `go-link.wm.editor` in localStorage), `?editor=next` back. go-link.org's old `/tools/willy-maker[/<game id>]` links send the browser to the same addresses (a client-side redirect in `apps/web`, `MakerRedirect`).
- **Code**: `frontend/willy-maker/src/maker/ui/studio/`, loaded as its own chunk. Texts in `i18n/studio.{en,es,pt}.ts`. Design tokens in `ui/modernist.css`.

## Design

The look is the Modernist design system: square corners everywhere, the Archivo font (400, 600, 800, served by the site itself), 2 px dividers between sections and 1 px borders on controls, ink and one red accent, light and dark. The tokens live on the editor's root (`.mdn`), so nothing else on the site changes; dark is used whenever the site is in its dark theme (the default), light with the site's light theme. Icons are [Lucide](https://lucide.dev) (ISC license, `lucide-react`). Buttons keep their label at the left.

## Layout

```
┌──────────────────────────── Header 48 px ────────────────────────────┐
├──────────┬──────────────── Options bar 44 px ───────────┬───────────┤
│ Tools    │                                               │ Properties│
│ 220 px   │                  Canvas                       │ and Layers│
│ (180-380)│                                               │ 288 px    │
│ or rail  │                                               │ (240-480) │
│ 52 px    │                                               │           │
├──────────┴──────────────── Footer 28 px ──────────────────┴───────────┤
```

- **Header**: back to My games, the brand, the game's title, the board tag (`CPS-1 · 384×224 · {players}P × {buttons}B`, buttons from the set layout), the workspaces (Level, Characters, Game, Menus, Export: the last four are the same screens the classic editor has, in the new look; see [Workspaces](#workspaces)), New game, Watch demo, the language (ES | EN | PT, the site's own setting), the two panels, light / dark (the site's theme), undo, redo and Play / Stop. Below 1180 px wide, New game and Watch demo show only their icon and the board tag hides.
- **Tools panel**: the tools (Select and move V, Draw zone B, Erase E, Hand H), Insert (background, character, enemy, object, and **Image AI prompts…**, the classic editor's prompt dialog for pictures an image AI draws, whose choices Characters' Assign by rows reads) and the four **first steps** (add a background, mark the floor, place your hero, try it), read from the level itself so they stay right after an undo. The « button, or dragging its edge under 140 px, turns it into the **icon rail**, whose Draw zone and Insert buttons open a flyout menu (click or right click); the rail counts the first steps done.
- **Options bar**: with Draw zone, "This is:" and a chip per zone kind with its description; with the other tools, a hint; while playing, the debug overlays (screen frame, collision, hitboxes, camera, FPS, slow motion ½). Then **View ▾** (grid and labels; the debug overlays, counted on the button), the grid size (8 or 16) and the zoom (−, the percentage, +: × or ÷ 1.25 around the view's centre, 50 % to 600 %).
- **Right panel**: Properties on top and Layers below, with a new group button and the zones' opacity (10-100 %).
- **Footer**: the cursor's place on the level, what is selected, the canvas hints, Shortcuts and whether the game is saved ("● saved in this browser", like the classic editor's autosave).
- **Panels**: Tab hides or shows both (only while the focus is on nothing in particular, so the keyboard can still move between controls), ⇧Tab or F7 the right one, F6 the left one, and the header's buttons. Dragging an edge resizes a panel (its strip is also a keyboard separator: arrow keys, ⇧ for bigger steps). The widths, the rail, the grid, the labels and the zones' opacity are this browser's preferences (`go-link.wm.studio`).

## Canvas

- **What it shows**: the level's art (its far, mid and play tile layers, drawn by the board's tiles on a canvas the size of the visible part), the grid (8 or 16 px; light lines over a picture), the zones, the objects and the screen frame (384 × 224, around player 1's start, or the level's first screen without one). An empty level (no picture, zones or objects) shows "Start with the background" with Insert background, Open example level and Watch the demo.
- **Zones** are drawn by kind (floor, platform, ladder, crate, breakable, hazard; water when the level has it) in ink and accent, with their name above (View › Labels) and the zones' opacity. They always sit on the 16 px collision grid. The level's collision layer is drawn from the visible zones on every change, so play mode and the ROM read exactly what the canvas shows; crates placed as objects add their own cells, as play mode and the ROM do.
- **Objects** (the game's starts, enemies, bosses, items, crates, people and helpers) are boxes the size of their sprite: heroes in ink, enemies in accent, the rest outlined, with an eye on the side they face. Their label is "name · role".
- **Tools**: Select and move picks objects first, then zones (2 px margin), then the background; dragging moves (zones on the 16 px grid, objects on the chosen grid) and a selected zone's corner handle resizes it. Draw zone drags a rectangle of the chosen kind (a click alone makes 4 × 2 cells) into the active group, or the zones' group; a locked group says so. Erase deletes what is clicked. Hand, or Space held, pans. Locked or hidden items (or items of a locked or hidden group) are never picked. Every change is one undo step; a drag is one step when it ends.
- **Zoom**: ⌘ / Ctrl / Alt + wheel around the pointer (×e^(−0.0022·deltaY)), the − and + buttons around the view's centre, ⌘0 fits the level, ⌘1 is 100 %, ⌘+ and ⌘− (50 % to 600 %).
- **Context menu** (right click): on nothing or the background, Insert here (background, character, enemy, object), Draw zone by kind, and lock or remove the background; on a zone, its kind (checked), duplicate, move to group and delete; on an object, choose sprite, look left or right, duplicate, move to group and delete. It stays inside the window and moves with the arrow keys.
- **The game's own characters are drawn with their sprite** (`ui/studio/ownSprites.tsx`): a player's start whose player plays one, an enemy or civilian whose kind is one, and a pickup with its own picture show the character's first standing frame at its size, feet on the object's place, on the canvas, in the sprite picker and in Properties; the engine's own parts keep their boxes.
- **Sprite picker**: Heroes (each player's start, named after the hero that player plays), Enemies (enemies and bosses) and Objects (items, crates, people to rescue and the level's helpers), as cards, the game's own enemy and civilian characters first (placed as an enemy or civilian whose kind is the character's id, the way play mode and the ROM draw them); a double click chooses at once. It places at the clicked point (or the view's centre) or gives the selected object another sprite of its kind. "Upload image or sheet…" opens the Characters workspace, where pictures become the game's own characters. A player has one start and the level one exit: placing another moves it.
- **Background**: Insert background (the tools panel, the context menu, ⌘O, or a picture dropped on the canvas) fits the picture to the board (12-bit colors, up to 32 palettes of 15 colors, 16 px tiles) on the level's play layer, scaled to the level's height; the level grows when the picture is wider, on the 32 px grid, and the picture is stretched a few pixels to end on it too, so no strip of the level is left without art. The play layer is the one that scrolls with the level, so zones drawn on the picture stay on it in the game. Anything that is not a picture says so.
- **Example level**: a 480 × 272 level over a neon city picture (`public/willy-maker/examples/neon.png`), with three floors, three platforms, a ladder, a crate and a hazard already marked, the hero, a trooper and a bazooka, in four groups, as one undo step.
- **Classic editor**: zones are made again from the collision layer when it was painted in the classic editor (their names are lost only then), so both editors can open the same game.

## Layers and groups

- **The list**: the level's groups from top to bottom, each with its objects and then its zones (the one drawn on top first), and the background last (its picture's thumbnail and file name, or "+ Insert background…"). A group's header shows open / close, show / hide, lock, its name and how many layers it holds; the base groups (Characters and Zones, under any name the user gives them) always exist.
- **Show, hide, lock**: hiding a zone or an object, or its group, takes it out of the canvas and out of the game: hidden zones are not in the collision layer, and hidden objects are left out of play mode and of Create ROM. Locked layers (or layers of a locked group, or a locked background) cannot be picked or edited on the canvas. A hidden group's name is dimmed and its layers more so.
- **Active group**: clicking a group's header makes it active (again to stop); new zones go into it when it is a custom group or the zones' group, new objects when it is a custom group or the characters' group, otherwise into their base group.
- **Rename**: double click a group or a layer (or Rename in its menu) and type; Enter, Esc or leaving the field confirms, an empty name brings the automatic one back ("Floor 2", "Group 1"). An object's `name` is its reference in the game and never changes: the name typed is its `label`.
- **Drag** a layer onto another group to move it there.
- **Group menu** (right click): Rename, New group, Show / Hide, Lock / Unlock, Move up, Move down, and for custom groups Ungroup (their layers go back to the base groups) and Delete group and its content. A layer's right click opens the canvas menu for it, whose Move to group and Group in a new group work too.
- **New group** (the folder button, Insert › New layer group) adds "Group n" at the top, active and ready to be renamed. Opening or closing a group is kept with the game but is not an undo step; everything else is.

## Properties

- **Zone**: its name (the automatic one until the user types another; emptied, the automatic one comes back), its kind (a grid of the kinds, with the kind's description), X, Y, width and height (on the 16 px grid and inside the level) and, for a breakable zone, its hits; Duplicate and Delete.
- **Character or object**: a picture at its size, its name (its `label`; the reference `name` stays), "role · sprite · size", Change sprite…, X and Y (the grid's step), Look left / right and Delete.
- **Pickup**: also its **Picture**, one of the game's characters (its idle animation) or the engine's icon; what it does still comes from its item.
- **Background**: a 16:9 picture of the level's art, the picture's file name, Replace… and Remove.
- The letters or digits typed in one field are one undo step; a number is used as it is typed and the field shows what the game kept when it is left.

## Shortcuts

One table (`ui/studio/keys.ts`) drives both the keys and the "Keyboard shortcuts" list (`?`, or the footer's Shortcuts). ⌘ is Ctrl on Windows and Linux; keys do nothing while typing in a field or with a dialog open.

| Action | Keys |
|---|---|
| Select and move / Draw zone / Erase / Hand | V / B / E / H |
| Zone kind (with B) | 1 … 6 |
| Hand while held | Space + drag |
| Zoom | ⌘ + wheel, Alt + wheel, ⌘+ / ⌘− |
| Fit / 100 % | ⌘0 / ⌘1 |
| Grid | ⌘' |
| Both panels / layers panel / tools panel / layers panel | Tab / ⇧Tab / F6 / F7 |
| Undo / redo | ⌘Z / ⇧⌘Z (also ⌘Y) |
| Duplicate / group / new group | ⌘D / ⌘G / ⇧⌘N |
| Rename | F2 or double click |
| Delete the selection | Del / Backspace |
| Move 1 cell / 4 cells | arrows / ⇧ + arrows (zones by 16 px, objects by the grid; holding them is one undo step) |
| Insert background | ⌘O |
| Play / stop | ⌘Enter / Esc |
| Cancel, close a menu or dialog | Esc |

## Playing

Play (or ⌘Enter) runs the level in the game's own play mode, the one play mode and the ROM share (the same rules, step by step, as Create ROM's engine), drawn as the board's 384 × 224 screen with the game's sprites, art, HUD and sound, inside the canvas area. Players join with Start (Enter on the keyboard) as on the arcade board; the arrows move and Z, X and C are B1, B2 and B3. A bar over it says so and shows player 1's lives and score, the enemies left and the people rescued; "Level complete!" shows when the level is cleared. Stop, Esc or ⌘Enter go back to building. The game's own enemies are drawn from their pictures, as the ROM draws them. The bar carries the running frame and player 1's place (`data-frame`, `data-p1-x`, `data-outcome`) for tests.

While playing, the options bar's debug chips (also in View ▾) drive the play mode's overlays: the screen frame (the 384 × 224 picture is the screen), the collision cells, the hitboxes, the camera (its dead zone and target), the FPS, and slow motion (half speed). What is hidden in the Layers panel is not in the game.

## New game wizard and demo

- **New game** (the header) opens the wizard: the game's type (every genre, each starting with its own rules, `editor/genres.ts`, shared with the classic wizard), the board (CPS-1; Neo Geo and more boards are shown as coming) and its buttons (3, or 2 with the special as both together), the title, author and players, the first level's background (the example picture, with or without its zones marked; a picture of your own, which makes the level as wide as it; or nothing but a floor), player 1's hero (Willy in his own colors or a recruit's shirt, or a sprite sheet, which opens Characters), and a summary. The first level is 480 × 272 with the players' starts on its floor and an exit at its end. The game is saved and opened, with a note on what to do next.
- **Watch demo** (the header, the wizard, the empty canvas) makes a level in front of you in six steps on a throwaway game that is never saved: the pretend cursor right clicks to insert the example picture, draws its zones kind by kind, places the hero, a trooper and a bazooka through the menu and the picker (finding the buttons by their translated text), and plays it with the real play mode while a bot joins, walks right, jumps and fires until the level is clear (a test checks the bot clears it on the engine). A cover stops other clicks; Exit or Esc ends it. At the end: Create my game (the wizard), Watch again, or Keep editing this level (saved as a new game).

Water, a collision tag the engine keeps but the ROM does not use yet, is a seventh zone kind offered only in levels that already have it, so no level loses it.

## My games

The site's home (`ui/studio/GamesHome.tsx`) in the same look: the brand, New game (the new game wizard), Open .zip (a project file, asking when a game with its id is already here) and Watch demo, then the games saved in this browser as cards with their first screen, board, levels and last change. A card opens its game; its … menu duplicates it, downloads its .zip or deletes it after asking. Watch demo runs on a game that is never saved (the editor's `scratch` mode): Exit or Esc goes back to My games, Create my game opens the wizard and Keep editing saves it as a new game. The editor's My games button comes back here, and each game saves itself a moment after each change ("● saved in this browser" in the footer).

## Pixel editor

The pixel editor (`sprites/ui/PixelEditor.tsx`, the drawing in `sprites/pixels.ts`) opens one animation of a character, laid out like Scratch's costume editor and made for the board. It opens from Characters: a click on a frame's picture under an animation (it has a pencil, and a bigger one shows on hover), **✎ Edit frames** under an animation with frames (**✎ Draw frames** under an empty one), or **✎ Draw from scratch** on a new character, which draws one with no sheet at all.

- **Frames** (left, like Scratch's costumes): the animation's frames in order; a new blank frame after the current one, duplicate, move up and down, remove from the animation (the sheet's box stays); ↑ ↓ ← → go from frame to frame.
- **Top**: the animation's name, the frame's number and size on the board, undo and redo (⌘Z, ⇧⌘Z; 100 steps, covering both drawing and the frame list), flip left to right and upside down, clear.
- **Tools**: pencil B, eraser E, bucket G (the area of one color, side by side), pick a color I (or Alt with any tool), line L, rectangle R and ellipse O (outlined or filled); a brush of 1 to 4 pixels for the pencil, the eraser and the line.
- **Canvas**: the frame at its size on the board, zoomed (fit, + and −) over a checkerboard for the transparent pixels, with a pixel grid, the 16 px zones counted from the feet (dashed), the feet point, and **onion skin**: the frame before (fainter) and the one after (faintest), lined up on the feet.
- **Layers** (right, top first): each frame is a stack of layers (body, clothes, weapon, outline…); the tools draw on the current one. Each layer can be shown or hidden, locked (no paint), renamed in place and marked as the **shirt** (its colors join the ones recolored for players 2 to 4); new layer, duplicate, up and down, merge onto the one below, delete. The frame is its layers that show, one over the other; flip turns every layer, clear empties the current one. A new frame gets the same layers, empty.
- **Vector layers** (like Scratch's vector costumes; `sprites/vector.ts`): a new vector layer holds shapes instead of pixels — rectangle R, ellipse O, line L and polygon P (click each corner; the first one again, a double click or Enter closes it) — each with a fill (or none), an outline color and an outline of 0 to 4 pixels. With Select V a click picks the top shape under the pointer, a drag moves it, the marked bottom right corner resizes it, the colors and the outline change it, and Forward, Backward, Duplicate and Delete (Del) act on it; Esc drops a polygon being drawn, then the selection. The shapes show as the board's pixels (a pixel is inside when its centre is), so the frame, the zones' counts and the game see pixels. **Convert to bitmap** keeps the pixels and drops the shapes, for the pencil to finish them; merging a layer onto a vector one does the same.
- **Colors and preview** (right): the current color, any color snapped to the board's nearest (the CPS-1 shows 4096), the character's colors, each zone's count of the colors the board gives it (15 on the CPS-1; over that, the board merges the closest), and the animation playing at its frames per second.
- **Use these frames** puts the animation back: its frames in order, the ones drawn on with their own pixels (marked "edited"), the new ones as drawn frames (`source.frames[]` with `drawn` and `edit`, [file-format.md](file-format.md)), a frame with more than one layer or a shirt keeps its layers (`edit.layers`, each a PNG, to edit them again), and the shirt layers' colors are added to the character's recolored colors; a vector layer keeps its shapes (`edit.layers[].shapes`). Save character keeps them; a character drawn from scratch saves with `source.sheet` null. The animations, zones, atlas, play mode and the ROM read them like any other frame, and detecting the sheet's frames again keeps the drawn ones.

- **More tools** (`sprites/tools.ts`):
  - **Mirror** (X): what the pencil, eraser, bucket, line, rectangle and ellipse draw on one side of the frame's middle (a dashed blue line) also appears on the other.
  - **Select pixels** (M): a box lifts those pixels off the current layer; drag inside it or use the arrows to move them, the top bar flips, turns (a quarter clockwise) or deletes them, ⌘C / ⌘X / ⌘V copy, cut and paste inside the editor; Enter, Esc, another tool, frame or layer puts them down (one undo step).
  - **Replace a color** (K): a click turns all of that color in the current layer into the current color; Shift+click does it in every layer of every frame (a vector layer's shapes change color too).
  - **Outline**: the current color on every see-through pixel beside the current layer's drawing (side by side).
  - **Colors per zone** counts the frame and, with more than one frame, the whole animation, since the board gives a zone one palette of 15 for every frame. **Bring down to 15 colors** appears when a zone goes over: over the whole animation, the least used colors become the nearest (as the eye sees it) of the 15 most used, in every layer; a vector layer whose pixels change becomes a bitmap one.
  - **Canvas size**: a new width and height (8 to 128) for every frame of the animation, the drawing as centred and as far from the bottom as before, the feet and the shapes moving with it.
  - **Open a picture** (or paste one with ⌘V from another program): a new layer with the picture shrunk to fit the frame (never enlarged), half see-through pixels made clear or solid, the colors snapped to the board's, standing on the feet and selected to move it. The editor keeps the paste to itself (the screen behind takes a pasted picture as a sheet only while the editor is closed).
  - **SVG** (`sprites/svg.ts`), opened, pasted as a file or pasted as code copied from a drawing program, in two ways:
    - On a bitmap layer, as a **picture**: the browser draws it at the biggest size that fits above the feet (a vector picture can grow), four times bigger, and each pixel takes its 4 × 4 block's most common board color (`tools.downsampleMode`), so smoothed edges add no in-between colors to the zones.
    - On a vector layer (or with **Import SVG** in its tools), as **shapes you can edit**: rectangles, circles, ellipses, lines, polylines, polygons and paths (curves and arcs cut into short straight pieces, at most 64 corners), with their transforms, fill and stroke from attributes, `style=""` and simple `.class` rules; a turned rectangle or ellipse becomes a polygon, an open path without fill its lines, a gradient its first color, a paint fainter than about a third none. The drawing is fitted into the frame standing on its feet and every color snapped to the board's. Text, embedded pictures, `<use>`, filters and masks are left out and the footer says how many. Holes (a letter O) fill in, since each part is its own shape.
  - **The board**: the editor takes its colors (`snap`), a zone's palette size and a zone's height from the game's board profile (`board/`, `editorBoard`), not from the CPS-1 directly, so another board's profile changes them with no change to the editor.
  - **In the level** (under the preview): the animation plays over the game's first level at the same scale, its feet on the level's player start.

## Workspaces

Characters, Game, Menus and Export are the classic editor's own screens, so both editors share one set of features. Inside the new editor they take its look from one stylesheet (`ui/studio/workspaces.css`): the site's token names those screens use (surface-2, text-muted, border-strong, accent-text, ok, danger…) are mapped to the Modernist palette in light and dark, and their capsules, round icon buttons, inputs, segmented choices and chips become square buttons, inputs, `.seg` and tags. The classic editor keeps its own look.

Texts: every part (`core`, `studio`, `sprites`, `game`, `menus`, `play`, `export`, `prompt`) has `en`, `es` and `pt` files of the same shape, checked by tests; keys are English names that never change with the wording.

## Steps

| Step | What | State |
|---|---|---|
| 0 | Zones and groups in the project file ([file-format.md](file-format.md)), design tokens, font and icons | done |
| 1 | Layout: header, resizable and hideable panels, icon rail, options bar, footer, light and dark | done |
| 2 | Canvas: wheel zoom, Space + drag, grid, tools, zones, characters, context menu, sprite picker, background, example level | done |
| 3 | Layers and groups: rename, hide, lock, drag between groups | done |
| 4 | Properties, undo and redo, every shortcut and the shortcuts list | done |
| 5 | Play with the real engine (play mode and the ROM read the same rules) and the debug overlays | done |
| 6 | The new game wizard and the automatic demo | done |
| 7 | The Characters, Game, Menus and Export workspaces in the new style; texts reviewed in the three languages | done |
| 8 | The new editor becomes the default: My games at `/`, the game at `/<id>`, the classic one behind `?editor=classic` | done |
