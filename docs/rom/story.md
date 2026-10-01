# Willy Gorklingo: The Lag Protocol — game bible

The story, characters, factions and the ten levels of go-link's own arcade game. Every name, organization and device here is original to go-link. The structure (a criminal cell that poses as an allied agency, a council of bosses above it, an older order hunting a Renaissance inventor's machines, missions across the world) is a homage to the spy series *Alias*; nothing else is taken from it.

The technical plan (hardware, tools, how it reaches go-link) is in [README.md](README.md).

## Logline

A counter-cyberterror major has to fight his way across the world to free the three teammates the Lag turned against him, before the Lag's council switches on a machine that makes every network on Earth wait forever.

## The world

The near future. Everything runs on networks: hospitals, banks, trains, power grids and the games people play together. Whoever controls **latency**, the time a signal takes to arrive, controls everything that depends on it. A delay of a second stops a stock exchange; a delay of a minute stops a city.

## The heroes: Task Force Uplink

Task Force Uplink is a small counter-cyberterror unit of the **Bureau of Clear Signals**, an international agency that protects the networks civilians depend on. Uplink operates where the Bureau officially is not.

### Major Wilson Gorklingo, "Willy" (player 1)

- Commander of Task Force Uplink. Black T-shirt with the unit's link logo, dark jeans, white sneakers, a short beard going grey. Wilson on paper, **Willy** to his friends and to anyone he has pulled out of a fire.
- Surname: an anagram of *go-link.org*.
- Personality: dry humor, stubborn loyalty. Never leaves anyone behind, which is exactly the weakness the Lag counts on.
- Skills (the sprite sheet's moves): run, jump and double jump, a short jetpack burst, crouch and crawl under fire, flying kick, a machine gun that aims in 8 directions, a combat knife, a bazooka, and the rescue of civilians. Thumbs up when someone is safe; yawns if the player leaves him idle.
- His promise, the game's line: *"Nobody waits. Not on my watch."*

### Captain Vera Valen, codename "Buffer" (player 2 once freed)

- Infiltration and marksmanship; blonde, fast, sarcastic. Called Buffer because she can hold any situation in her head and release it at the right moment.
- Brainwashed by the Lag, she becomes **Vera Buffer**, their elite enforcer.
- Moves: pistol, punch combo, air kick, crouch, a victory taunt.

### Glitch-9 (player 3 once freed)

- The unit's combat android, built by the Bureau. Its first boot crashed on the ninth try, and the name stuck. Blue armor plates, one red optic.
- Rewritten by the Lag's firmware, it guards their data vaults.
- Moves: arm cannon, punch, jump attack; it can take more hits than the humans.

### Jitter (player 4 once freed)

- A stranded extraterrestrial engineer. Willy rescued it from a crashed craft years ago and it chose to stay with the unit. Green, with a big domed head and long claws. It speaks only in clicks that Glitch-9 translates.
- Its own body signal shakes and flickers, hence the name. Under the Lag's control it is their most unpredictable soldier.
- Moves: plasma shots, claw slash, hover jump with thrusters.

### Civilians

The four kinds from the sprite sheet, in every level, trapped by the Lag: a woman, a child, a baby and an elderly man. Saving them is never optional for Willy. In gameplay it gives score, a health refill and the "Nobody waits" bonus at the end of the level.

## The villains: the Lag

To the world, **the Lag** is a terrorist group that holds networks hostage: blackouts, frozen hospitals, ransoms paid in anything untraceable. Their calling card is an hourglass with a broken neck. Their slogan, spray-painted after every attack: *"Everything waits."*

The Lag is three layers deep, and the players only see the next one after beating the last.

### Layer 1: Section Null, the cell

A black-operations office that recruits agents believing it is a secret branch of the Bureau of Clear Signals. Its people think they serve the good side; their missions actually feed the Lag. Task Force Uplink took its orders through Section Null for two years without knowing it. That is how the Lag knew where Willy's team would be the night they were captured.

- **Director Arvid Kessler**: the man who signed Uplink's mission orders. Calm, paternal, polite to the very end.

### Layer 2: the Round Trip, the council

Seven bosses, called **the Hops**, who meet only by video with a deliberate delay so nobody can trace them. Each Hop owns an industry: arms, banks, satellites, shipping, data centers, pharmaceuticals, private armies. Their money is effectively infinite and so is their arsenal of devices.

The Hops the players meet:

- **Desmond Hollowell, "Mr. Round-Trip"**: chairman of the council. A tech billionaire who sells "low latency" to the world while owning its delays. Final boss.
- **Kasimir Spool**: the Round Trip's banker, the money behind every Lag attack. Hides his vaults in mountains and pays mercenaries by the second.
- **"The Choke"**: the council's enforcer, a giant in a pressure suit who cuts undersea cables by hand.
- **Dr. Ilsa Laggard**: neuroscientist, inventor of the **Throttle Crown**, the device that turned Willy's teammates. She calls it *buffering a will*.

### Layer 3: the Order of the Long Wait

Older than the Lag. A secret order that has spent five centuries hunting the notebooks of **Aurelio Lattenza**, a Renaissance engineer who believed time can be made to stretch. The Order funded the Round Trip; the Round Trip built the Lag. Their goal is Lattenza's last design: the **Delay Engine**, a machine that, broadcast from orbit, adds a delay to every signal on the planet. Whoever holds the only clock without delay rules a world that waits.

Lattenza's notebooks (**Lattenza pages**) are the game's collectibles: one hidden in every level. Collecting all ten unlocks the true ending.

### Lag foot soldiers and devices

- Lag troopers in grey with the broken hourglass: rifle, grenade and shield variants.
- **Spinners**: flying drones shaped like loading wheels; they hover, then dive.
- **Pingers**: wall turrets that fire a sound pulse before the shot. The pulse is the tell.
- **Throttle Crowns**: the brainwashing headsets. Breaking a teammate's crown, never killing them, is how you free them.
- **Delay mines**: anything caught in their field moves at half speed for 3 seconds, the player included.
- Their vehicles: armored trucks, a gunship, a cable-cutter submarine and the airship *Long Wait*.

## How the brainwashing plays

When a brainwashed teammate's health reaches zero they kneel, their crown sparks, and Willy has 5 seconds to stand next to them and press rescue. That breaks the crown and frees them, after a short cutscene. If the timer runs out, the crown restarts them at a third of their health. Players are never asked to kill a teammate.

Once freed, that teammate becomes selectable for players 2 to 4 (go-link rooms have four seats). Before that, players 2 to 4 play **Uplink recruits**: palette swaps of Willy with a different shirt color (the prototype's player 2 wears green).

## The ten levels

Every level has the same frame: an opening briefing (Willy, then a Bureau radio call), several areas joined by scrolling, civilians to rescue, at least one Lattenza page, a mid-boss, a boss, and a closing scene. Destructible scenery everywhere, in homage to *Destroy this page*: crates, walls, cars, signs and floors break, and some floors are the only way down.

### Level 1: "Dead Air" — Buenos Aires, Puerto Madero

- **Setting:** night and rain over the docks; the Lag has taken a glass data tower and the city's lights are blinking out floor by floor.
- **Story:** Willy's team arrives on orders from Section Null. It is a trap: the floor collapses into a server pit, the team is gassed and taken. Only Willy escapes, falling three floors through breaking glass.
- **Areas:** the flooded dock and cranes (tutorial: move, jump, shoot); the tower's lobby (crouch under laser fences, rescue the first civilians); the server floors (break the floor to go down, the jetpack to climb back up); the rooftop helipad.
- **Enemies:** troopers, Pingers, the first Spinners.
- **Civilians:** 4, night-shift technicians and a lost child.
- **Mid-boss:** an armored truck that rams through the lobby wall.
- **Boss:** the Lag gunship over the helipad: break its armor plates with the bazooka while dodging its rockets.
- **Close:** on the gunship's radio, a distorted woman's voice: *"Your friends are being buffered, Major. Everything waits."*
- **Lattenza page 1:** inside a server rack that only breaks with the knife.

### Level 2: "The Hourglass Vault" — Cairo, museum and catacombs

- **Setting:** a museum at dusk, then the limestone catacombs underneath.
- **Story:** the Lag is robbing a sealed Lattenza notebook from an exhibition. Willy follows the thieves underground and meets Vera, now in black, with a Throttle Crown on her temple.
- **Areas:** the museum halls (glass cases, statues that topple into platforms); rooftop chase; collapsing catacombs with moving sand floors; the burial chamber.
- **Enemies:** troopers with lanterns, sand-colored Spinners, delay mines.
- **Civilians:** 5, a tour group locked in the gift shop.
- **Mid-boss:** a trooper squad on a rolling sarcophagus cart.
- **Boss:** **Vera Buffer.** Pistol from range, punch combos up close, air kicks across the chamber. Free her by breaking her crown.
- **Close:** Vera, dizzy, recognizes Willy: *"How long was I gone?"* — *"Long enough. Welcome back, Buffer."* Player 2 can now pick Vera.
- **Lattenza page 2:** behind a breakable hieroglyph wall.

### Level 3: "Night Market Network" — Hong Kong, markets and harbor

- **Setting:** neon street markets, crowded stairways, then a container ship in the harbor.
- **Story:** Vera remembers a Lag shipment of Throttle Crowns leaving from the harbor. The team boards the ship to stop it and learns about the Round Trip.
- **Areas:** the night market (signs and stalls to climb and break); a minibus chase on rooftops; the container stacks (doors that open into troopers or civilians); the ship's bridge.
- **Enemies:** troopers, shield troopers, crane-mounted Pingers, a Spinner swarm.
- **Civilians:** 6, sailors and market vendors held in containers.
- **Mid-boss:** a crane that swings containers at the players.
- **Boss:** **Commander Rook**, Kasimir Spool's mercenary chief, in a mech walker on the ship's deck.
- **Close:** Rook's tablet names the money behind everything: *Spool Private Bank, Alps vault*.
- **Lattenza page 3:** in a fortune-teller's booth in the market.

### Level 4: "The Bank of Delays" — Swiss Alps

- **Setting:** snow, cable cars, a vault city carved into a mountain.
- **Story:** the team infiltrates Kasimir Spool's private bank to follow the money and finds that the Lag is paid by a council called the Round Trip.
- **Areas:** the cable cars (fight on their roofs while they move); the snowy loading docks; the gold vaults (laser grids, gold bars that fall when shelves break); Spool's office.
- **Enemies:** troopers in snow gear, ski troopers, Spinners, delay mines in the vault.
- **Civilians:** 5, bank clerks the mercenaries locked in the vault.
- **Mid-boss:** an armored snowcat.
- **Boss:** **Kasimir Spool** in a vault-cannon suit that fires bundles of banknotes and gold bars. Break the coin hoppers to stop his ammunition.
- **Close:** Spool, captured, laughs: *"You think money is the Lag? Money is just the delay between a wish and its price."* He leaks the location of the android Glitch-9.
- **Lattenza page 4:** in a safety deposit box opened by blowing up the wall.

### Level 5: "Insert Coin" — Tokyo, arcade tower

- **Setting:** a 12-floor arcade tower in Akihabara with cabinets, prize machines and a rhythm-game floor.
- **Story:** the Lag is recruiting gamers through rigged cabinets; Glitch-9 guards the server at the top.
- **Areas:** the street and the entrance (crowds of civilians to protect); floors of cabinets (break them for power-ups); the elevator shaft (climb with the jetpack while the elevator falls); the server floor.
- **Enemies:** troopers in hoodies, Spinners shaped like arcade sprites, Pingers inside cabinets.
- **Civilians:** 6, players trapped in the prize floor.
- **Mid-boss:** a giant claw machine that grabs players.
- **Boss:** **Glitch-9.** Arm cannon from range, punches up close, jump attacks across the floor. Break its crown, which here is a firmware module on its back, to free it.
- **Close:** Glitch-9 reboots with a cheerful *"Boot attempt ten: success."* Player 3 can now pick Glitch-9, and it decodes Section Null's orders.
- **Lattenza page 5:** in the high-score table, in a cabinet that only breaks with the bazooka.

### Level 6: "Undersea Cable" — North Atlantic

- **Setting:** an oil platform in a storm, then a sea-floor base where the Lag cuts fiber cables.
- **Story:** the Round Trip's enforcer, the Choke, is cutting the cables that link two continents. The team goes down in a diving bell.
- **Areas:** the platform in the storm (wind pushes the players); the diving bell shaft; the underwater base (pressure doors, flooding rooms that rise slowly); the cable trench.
- **Enemies:** troopers in diving suits, torpedo Spinners, Pingers on the cables.
- **Civilians:** 5, platform engineers in a flooding room.
- **Mid-boss:** the cable-cutter submarine's claws.
- **Boss:** **The Choke**, in a pressure suit, cutting the cable while the room floods. Hit the valves to drain the water before it fills.
- **Close:** the Choke's helmet camera shows a desert facility and a cage holding Jitter.
- **Lattenza page 6:** in a sunken wreck behind the base.

### Level 7: "Area Ping" — Nevada desert

- **Setting:** a secret desert lab with radar dishes, hangars and a test site.
- **Story:** Jitter is held here, its body used to power a Throttle Crown prototype. Dr. Ilsa Laggard appears for the first time, on video.
- **Areas:** a motorcycle chase in the desert (shooting while riding); the radar dishes (climb and break them); the hangars (falling crates, crawling under vents); the test chamber.
- **Enemies:** desert troopers, sand Spinners, Pinger dishes, delay mines.
- **Civilians:** 5, abducted scientists.
- **Mid-boss:** a hangar door turret.
- **Boss:** **Jitter** in a hover mech: plasma shots, claw slashes and hover jumps. Break the crown to free it.
- **Close:** Jitter clicks a message that Glitch-9 translates: *"Section Null signs the orders."* The team realizes the Bureau office they trusted is the enemy. Player 4 can now pick Jitter.
- **Lattenza page 7:** in the alien craft's wreck, kept in a hangar.

### Level 8: "Masquerade" — Venice

- **Setting:** carnival night, canals, palaces and a ballroom where Section Null meets the Round Trip.
- **Story:** the twist, made playable. The team crashes the masked ball where Section Null hands the Delay Engine's last component to the council. Director Kessler takes off his mask.
- **Areas:** the canals (gondolas as moving platforms, bridges that break); rooftops and bell towers; the palace and its hidden corridors; the ballroom (chandeliers to shoot down).
- **Enemies:** masked troopers, dancers who turn into agents, Spinners in the shape of carnival masks.
- **Civilians:** 6, guests held in the ballroom.
- **Mid-boss:** a gondola fleet of troopers.
- **Boss:** **Director Arvid Kessler**, with a cane-sword and a decoy hologram of himself (break the projectors to find the real one).
- **Close:** Kessler's last words: *"The Order waited five hundred years. They can wait for you to fail."* He reveals the Order of the Long Wait.
- **Lattenza page 8:** inside a painting in the palace gallery.

### Level 9: "The Long Wait" — Antarctica

- **Setting:** a monastery-lab of the Order buried in the ice, with an ice cavern full of clocks that run slow.
- **Story:** Dr. Laggard is building the global version of the Throttle Crown, to buffer the will of everyone who looks at a screen when the Delay Engine goes live.
- **Areas:** the ice field (slippery floors, snow troopers); the monastery (clocks as platforms, bells that ring delay fields); the crown lab (vats and cables); the clock cavern (time slows in zones).
- **Enemies:** monks of the Order in robes with delay staffs, ice Spinners, Pingers inside frozen pillars.
- **Civilians:** 6, kidnapped neuroscientists who refused to help.
- **Mid-boss:** a giant clock pendulum that sweeps the cavern.
- **Boss:** **Dr. Ilsa Laggard** in a crown-shaped exoskeleton that tries to put a Throttle Crown back on one of the players' teammates. Each phase, protect the teammate she targets.
- **Close:** Laggard's lab feed shows the airship *Long Wait* taking off with the Delay Engine.
- **Lattenza page 9:** in the frozen hand of the monastery's founder.

### Level 10: "Round Trip" — the airship *Long Wait*, over Buenos Aires

- **Setting:** a giant airship above the city where the game started, at dawn, climbing toward the stratosphere to fire the Delay Engine at an orbital relay.
- **Story:** Desmond Hollowell, Mr. Round-Trip, plans to switch on the Engine from the sky over Willy's home city, as a message. The whole team goes up in a stolen gunship.
- **Areas:** boarding under fire (jump between the gunship and the airship); the hangar decks; the engine rooms (break the cooling pipes to weaken the Engine); the top deck, open to the sky.
- **Enemies:** every Lag soldier type, Spinner swarms, Pingers, delay mines, elite troopers.
- **Civilians:** 8, people the Lag took as human shields.
- **Mid-boss:** the Engine's guardian drones, three at a time.
- **Boss:** **Desmond Hollowell** in a Round-Trip suit that sends every attack back after a delay: a hit you land returns to you 2 seconds later unless you dodge your own echo. Final phase: the Delay Engine itself, broken piece by piece while the clock on the HUD slows down.
- **Ending:** the Engine shatters, the airship comes down into the river, and the team jumps with the civilians. On the dock where it all began, Vera, Glitch-9 and Jitter stand next to Willy at sunrise. Willy: *"Nobody waits."* Thumbs up. The country and its networks are safe, and the Lag is finished.
- **True ending (all 10 Lattenza pages):** the pages form a drawing of the Delay Engine with a note in Lattenza's hand: *"There is a second machine."* An hourglass turns over. To be continued.
- **Lattenza page 10:** in the Engine's core, taken during the final phase.

## Controls and weapons

Three buttons per player, the same move set as the website's *Destroy this page*, on a 4-player CPS-1 board whose sets declare three buttons ([journal, step 0b](journal.md#step-0b--rethinking-the-set-buttons)). go-link's device maps the RetroPad B, A, Y to buttons 1, 2, 3 on every seat.

| Input | Action |
|---|---|
| Stick | Walk. **Double tap** toward a side (left-left or right-right within 250 ms) to **run** until the stick is released: a full-stick run is not reliable on digital arcade sticks |
| Button 1 | **Jump**; down + jump drops through a floor |
| Button 2 | **Fire**: the machine gun, aimed with the stick. When an enemy is right in front of Willy at the moment of the press, it is a **knife** slash instead (automatic) |
| Button 3 | **Special**: the picked-up weapon, with limited ammo |
| Start / Coin | Join / credit, like any arcade board |

On two-button boards the special is button 1 + button 2 pressed together.

**Weapons.** Willy always carries the machine gun on Fire. Special weapons are pickups found along the levels, one at a time, each with limited ammo; picking another replaces it, and with no ammo left the special throws a grenade.

- **Bazooka**: one slow rocket that speeds up and blows through armored troopers and vehicles. 3 rockets.
- **Multicast**: a spread gun that fires a fan of five shots; for drones and crowds. 30 bursts.
- **Overclock**: a short flamethrower that melts shields; 4 seconds of fire.
- **Ping grenade**: thrown in an arc; the special's fallback with no weapon, and a pickup of 5.

The prototype has the walk/run double tap, the automatic knife, the machine gun and the bazooka as a crate pickup ([journal, step 2a](journal.md#step-2a--three-buttons-the-slammast-layout-and-the-controls)).

## How a level plays

In the style of Metal Slug (prototype: [journal, step 4](journal.md#step-4--a-metal-slug-style-level)):
- **Forward:** levels scroll left to right, and the camera never goes back more than a few steps. Wide stages also climb and drop: the camera follows on both axes.
- **Two routes:** the street and an upper route (rooftops, fire escapes, scaffolding). Players walk in front of the buildings; a roof or a platform is a one-way ledge: jump up through it, stand on it, down + jump to drop.
- **Climbing:** walking against one crate climbs it; a stack of two needs a jump. Crates break (bullets, rockets) and can hide pickups. Ladders link the routes: up/down on the stick.
- **Scale:** characters about 44 px tall on the 384×224 screen, so the world reads big around them.
- **Co-op:** players 2-4 join at any time with a credit and Start, next to player 1. Before their character is freed, a player is an Uplink recruit: Willy's sprite with their own shirt color. The camera keeps everyone in view, pulling a trailing player forward.

## Tone and look

- Arcade action in the line of the side-scrolling run-and-gun classics of the 80s and 90s: fast, readable, generous with explosions, short levels (5 to 8 minutes), boss fights with clear tells.
- Humor in the dialogue, never in the stakes: civilians are always rescued, teammates are always freed, never killed.
- Pixel art from the go-link sprite sheets (Willy, Vera, Glitch-9, Jitter, the civilians and the neon city stage), with the go-link palette: night blues, accent orange, warning red, rescue green.
- On screen: score, lives as hearts, a health bar, rescued civilians, Lattenza pages found, and a mission timer.

## Scoring and progression

- Score for every enemy, every destroyed object and every civilian; a **Nobody waits** bonus when all of a level's civilians are rescued.
- Lives as hearts (3, plus one every 100 000 points), a health bar per life, continues with Coin like any arcade game.
- Up to 4 players at once (go-link's four seats), each with their own score; teammates join as they are freed.
- One Lattenza page per level; the true ending needs all ten.
- Difficulty set by the arcade's DIP switches: Easy, Normal, Hard, Lag (enemies fire twice as often).
