# Willy Maker e2e art

The pictures `tests/willy-maker-games.spec.ts` builds its games with. Each was made by an image AI (ChatGPT, one new chat per picture) from the prompt Willy Maker itself writes (`frontend/willy-maker/src/maker/prompts/imagePrompt.ts`, the editor's Image AI prompts dialog), with the choices listed under each one, and is used exactly as it came: the test checks what the tool does with an image AI's real output (frame detection, the magenta background, rows, colors, the ROM).

To make a new set, paste each prompt below in a new chat, download the picture and save it here under its file name. Without the four files the test is skipped.

## Background (one screen, sky included)

- File: `background.png`
- Prompt choices: Background, sub Static (one screen), the app's example place
- Used by: the wizard's Upload my picture, then the zones are drawn over it

```text
A background for a 2D side-scrolling arcade game, seen straight from the side, the horizon level. A single screen. Puerto Madero docks in Buenos Aires at night: the skyline of glass towers, the Puente de la Mujer footbridge, the river with neon reflections, a museum frigate, old red-brick dock warehouses, harbour cranes, and at the end a corporate tower with a helipad for the boss. Color mood: deep blues and purples, warm window lights, magenta and cyan neon accents. Place and time period: Puerto Madero, Buenos Aires, Argentina, present day. Time of day and weather: night, clear, a light haze over the river. Make sure of this: a night or day sky band across the top; a layered city skyline with lit windows; water with reflections of the lights; neon signs and glowing accents (made of solid pixel colors, no glow halos); a moon; bridges; harbour cranes; a clearly walkable floor along the bottom, flat and readable; flat platforms a short jump above each other; open space above the floor to run and jump, no clutter in the walking lane. Design it for the arcade board's real screen, 384 x 224 game pixels, shown enlarged with crisp nearest-neighbor pixels: big, simple, readable shapes, no detail smaller than 2 game pixels, and a muted, slightly desaturated distance so the characters stand out in front of it. Detailed 16-bit arcade pixel art, like the hand-drawn sprites and backgrounds of 1990s arcade games: crisp pixels, dark outlines tinted by the color they surround, shading in a few flat tones with light from the top left, rich but limited colors. Style: inspired by 1990s arcade beat 'em ups and run and gun games, used only as a style: no existing characters, logos, names or text from any game.

Make it a 16:9 image, as large as you can.

Avoid: blur, gradients, soft glow, anti-aliased soft edges, photorealism, 3D render, tilted camera, text, labels, letters or numbers, grid lines, logos or brand names, watermark or signature, user interface or HUD, existing game characters, characters or people.
```

## Hero sprite sheet

- File: `hero.png`
- Prompt choices: Character, sub Hero; animations idle, walk, jump, shoot, hit, death; description "a young courier in a red jacket with a blaster"
- Used by: Characters › Hero, Assign by rows

```text
Create a pixel art sprite sheet of an original hero for a 1990s-style 2D side-scrolling arcade game. The character: a young courier in a red jacket with a blaster. Make sure of this: every frame facing right (the game mirrors it); the shirt in one clear flat color zone, so it can be recolored for players 2 to 4. Show these animations, each in its own row from top to bottom, every frame facing right: 1. Idle (Standing still, breathing: the loop players see most): 4 frames, looping; 2. Walk (Walking at normal speed): 8 frames, looping; 3. Jump (Take-off, in the air and falling): 3 frames; 4. Shoot (Firing the gun forward, with recoil): 3 frames, looping; 5. Hit (Taking a hit: knocked back for a moment): 2 frames; 6. Death (Losing a life: falling and fading out): 6 frames. Make the poses expressive and exaggerated like classic arcade games: anticipation, impact and follow-through, a clear silhouette in every frame. Keep the same face, build, proportions and colors in every frame, with a slightly large head and hands so they read at a small size. Design every frame for its real size on the arcade board, about 44 game pixels tall on a 384 x 224 screen, shown enlarged with crisp nearest-neighbor pixels, like a 1990s Neo Geo run-and-gun sprite: a bold, readable silhouette, a clean dark outline, no detail smaller than one game pixel. Detailed 16-bit arcade pixel art, like the hand-drawn sprites and backgrounds of 1990s arcade games: crisp pixels, dark outlines tinted by the color they surround, shading in a few flat tones with light from the top left, rich but limited colors. Style: inspired by 1990s arcade beat 'em ups and run and gun games, used only as a style: no existing characters, logos, names or text from any game. Everything on a plain, flat magenta (#FF00FF) background, the frames large with generous space between them so no two touch, the feet of a row on one line. No labels, text or grid lines.

Make it a 3:2 image, as large as you can.

Avoid: blur, gradients, soft glow, anti-aliased soft edges, photorealism, 3D render, tilted camera, text, labels, letters or numbers, grid lines, logos or brand names, watermark or signature, user interface or HUD, existing game characters, background scenery, cropped limbs, frames touching each other, a different face or build between frames.
```

## Enemy sprite sheet

- File: `enemy.png`
- Prompt choices: Character, sub Enemy, every enemy animation; description "a security robot with one red eye"
- Used by: Characters › Enemy, Assign by rows (the role's own six animations, so no prompt choices are needed)

```text
Create a pixel art sprite sheet of an original enemy for a 1990s-style 2D side-scrolling arcade game. The character: a security robot with one red eye. Make sure of this: every frame facing right (the game mirrors it). Show these animations, each in its own row from top to bottom, every frame facing right: 1. Idle (Standing still, breathing: the loop players see most): 4 frames, looping; 2. Walk (Walking at normal speed): 6 frames, looping; 3. Shoot (Firing the gun forward, with recoil): 3 frames, looping; 4. Melee (An enemy's close attack): 4 frames; 5. Hit (Taking a hit: knocked back for a moment): 2 frames; 6. Death (Losing a life: falling and fading out): 6 frames. Make the poses expressive and exaggerated like classic arcade games: anticipation, impact and follow-through, a clear silhouette in every frame. Keep the same face, build, proportions and colors in every frame, with a slightly large head and hands so they read at a small size. Design every frame for its real size on the arcade board, about 44 game pixels tall on a 384 x 224 screen, shown enlarged with crisp nearest-neighbor pixels, like a 1990s Neo Geo run-and-gun sprite: a bold, readable silhouette, a clean dark outline, no detail smaller than one game pixel. Detailed 16-bit arcade pixel art, like the hand-drawn sprites and backgrounds of 1990s arcade games: crisp pixels, dark outlines tinted by the color they surround, shading in a few flat tones with light from the top left, rich but limited colors. Style: inspired by 1990s arcade beat 'em ups and run and gun games, used only as a style: no existing characters, logos, names or text from any game. Everything on a plain, flat magenta (#FF00FF) background, the frames large with generous space between them so no two touch, the feet of a row on one line. No labels, text or grid lines.

Make it a 4:3 image, as large as you can.

Avoid: blur, gradients, soft glow, anti-aliased soft edges, photorealism, 3D render, tilted camera, text, labels, letters or numbers, grid lines, logos or brand names, watermark or signature, user interface or HUD, existing game characters, background scenery, cropped limbs, frames touching each other, a different face or build between frames.
```

## Item (a pickup's picture)

- File: `item.png`
- Prompt choices: Object, sub Item; description "a glowing green energy battery pickup"
- Used by: Characters (any role, 20 px tall), then the pickup's Picture in Properties

```text
Create pixel art of an item for a 1990s-style 2D side-scrolling arcade game, drawn large. a glowing green energy battery pickup. Make sure of this: seen from the side, the same angle as a side-scrolling game. Design it for its real size on the arcade board (about 32 x 32 game pixels a frame), shown enlarged with crisp nearest-neighbor pixels: bold, readable shapes, no detail smaller than one game pixel. Detailed 16-bit arcade pixel art, like the hand-drawn sprites and backgrounds of 1990s arcade games: crisp pixels, dark outlines tinted by the color they surround, shading in a few flat tones with light from the top left, rich but limited colors. Style: inspired by 1990s arcade beat 'em ups and run and gun games, used only as a style: no existing characters, logos, names or text from any game. Everything on a plain, flat magenta (#FF00FF) background, with space between frames. No labels or text.

Make it a 1:1 image, as large as you can.

Avoid: blur, gradients, soft glow, anti-aliased soft edges, photorealism, 3D render, tilted camera, text, labels, letters or numbers, grid lines, logos or brand names, watermark or signature, user interface or HUD, existing game characters, scenery behind it, frames touching each other.
```
