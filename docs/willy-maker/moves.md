# Willy Maker: the moves

The moves a hero makes, the same in play mode (`engine/game.ts`) and in the ROM engine (`rom/engine/engine.c`), task T-25 of [experiment 1's verdict](../experiments/verdict.md). A full sprite sheet (idle, walk and run, turn, jump, jump kick, crouch, crawl, machine gun, knife, bazooka, a yawn, a thumbs up) has an animation for each; a hero without one falls back as listed. Numbers are in pixels and frames (60 per second); vertical speeds in 1/16 px per frame, as in [rules.ts](../../frontend/apps/web/src/willy-maker/engine/rules.ts).

## Moves everyone has

| Move | Control | What it does | Animation (fallbacks) |
|---|---|---|---|
| Crouch | Down on the ground (not on a ladder's top, where Down climbs down, and not with B1, which drops through a one-way ledge) | The body is 24 px tall instead of 40: shots fired at standing height (an enemy's, 26 px up) pass over it. No running. A crouched player stands up only when there is room for 40 px | `crouch` (`idle`) |
| Crawl | Left or Right while crouched | 1 px every 2 frames; turns to the side pressed. Fits under a ceiling 32 px over the floor | `crawl` (`crouch`, `walk`) |
| Fire crouched | B2 while crouched | The machine gun's shots leave 12 px up (instead of 27) | `crouch` |
| Land | Touching the ground after 10 or more frames in the air | Shown for 8 frames; nothing else changes | `land` (`idle`) |
| Turn | Pressing the other side on the ground | Shown for 6 frames while the player already moves | `turn` (`run`) |
| Jump kick | Down + B2 pressed in the air (not on a ladder) | For 20 frames no shots; the first enemy within 24 px in front, with its body overlapping the player's, takes 2 hits (as a knife), once per kick | `jump_kick` (`knife`, `jump`) |
| Thumbs up | Rescuing a civilian | Shown for 45 frames to that player, while standing still on the ground | `thumbs_up` (`idle`) |
| Victory | The section is cleared | Every player in the game, until the next screen | `victory` (`thumbs_up`, `idle`) |
| Yawn | 300 frames (5 s) standing on the ground with nothing pressed | Until something is pressed | `yawn` (`bored`, `idle`) |

## Moves a game turns on (the Rules card)

| Rule | Default | Control | What it does | Animation (fallbacks) |
|---|---|---|---|---|
| Double jump (`doubleJump`) | off | B1 pressed again in the air (not on a ladder), once until the next landing | Vertical speed becomes −96 (a second jump of about 45 px) | `double_jump` (`jump`) |
| Jet pack (`jetpack`) | off | B1 held in the air: it starts while falling (vertical speed 0 or more before gravity), or at once after the double jump, and goes on while B1 is held | After gravity each frame: vertical speed −10, at most −32 upward (a faster rise, like the double jump's, is left as it is); 90 frames of fuel, filled again on landing | `jetpack` (`jump`) |

With both, the first press in the air is the double jump and holding B1 afterwards is the jet pack. The **reach check** (`editor/reach.ts`) climbs as far as the moves allow (`jumpRowsFor`): 3 rows (48 px) with a plain jump (it peaks at 62 px), 6 rows (96 px) with the double jump (107 px), 14 rows (224 px) with the jet pack (239 px with its full fuel), measured on play mode's engine by `engine/game.test.tsx`.

## In the ROM

The engine draws every move from the player's look (`struct wm_look`): Willy's built-in art gains `turn`, `jump_kick`, `crouch`, `crawl`, `yawn` and `thumbs_up` from his sprite sheet; an own hero's animations are chosen by the names above with their fallbacks. The two rules are flags in the data block's header. The lab state reports a crouched player as crouching and a crawling one as crawling.
