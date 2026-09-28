# Device protocol (WebRTC)

This page describes what the device and the website say to each other over WebRTC. The signaling protocol (pairing, rooms, invitations, the `signal` envelope) belongs to signalhub and is documented in [its README](https://github.com/lordbasex/signalhub). A protocol change goes to signalhub's README first, then to the Go models (`backend-device/internal/models`, `pkg/signalclient`) and the TypeScript types (`frontend/packages/shared`).

## Two kinds of connection

| Who | How they arrived | Gets | For |
|---|---|---|---|
| **Room guest** | signalhub `join` (invitation) | Video, audio, voice, `control`, `input` | Playing or watching |
| **Linked browser** | `claim` with the code, or `reach` | `control` + `files` | Managing the device: hardware, CPU, RAM, latency, ROM library, core, rooms, history |

Hardware and usage data go **only** to linked browsers, never to room guests.

## Channels

| Channel | Kind | Settings | Content |
|---|---|---|---|
| Video | Track | VP8 | Emulator frames at the game's native resolution |
| Audio | Track | Opus 48 kHz stereo | Game sound |
| Voice | Track (one per seat) | Opus 48 kHz mono | Seated players' microphones, forwarded by the device |
| `control` | DataChannel | `ordered: true`, reliable | JSON: chat, room state, queue, device status |
| `input` | DataChannel | `ordered: false`, `maxRetransmits: 0` | 12-byte binary packets: sequence, local player, buttons, sticks |
| `files` | DataChannel | `ordered: true`, reliable | Linked browsers only: ROM zips and images dropped on the website |

### Audio and voice tracks

Each guest connection carries these m-lines, in this order:

| # | Track | Direction | `stream id` | Content |
|---|---|---|---|---|
| 0 | Video | device → browser | `go-link` | VP8 game video |
| 1 | Audio | device → browser | `go-link` | Opus game sound |
| 2-5 | Voice P1 to P4 | device → browser | `voice-p1` … `voice-p4` | Forwarded voice of each port |
| 6 | Microphone | browser → device | | The guest's microphone |

- Voice is **never mixed** with the game or with other voices: the device forwards each player's RTP packets to the other players' `voice-pN` tracks. So the browser has separate volumes for game and voice and can silence one player.
- Every track exists from the first offer: winning or losing a seat never renegotiates or interrupts the video.
- The browser answers the microphone m-line as `sendonly` and attaches the microphone with `replaceTrack` when the player turns it on (with echo cancellation, noise suppression and auto gain).
- **Rules, enforced on the device:** only seated players' audio is forwarded; nobody gets their own voice; spectators and the queue get none, unless the room has `spectators_hear_voice`.
- Cost: each voice is ~30 kbps Opus. With 4 players talking it is under 5 % of the video, and forwarding uses no codec CPU.

## Negotiation

The **device always offers** and the browser answers. Messages travel inside signalhub's `signal` payload, which signalhub does not read:

```json
{ "kind": "offer", "sdp": "..." }
{ "kind": "answer", "sdp": "..." }
{ "kind": "candidate", "candidate": { "candidate": "...", "sdpMid": "0", "sdpMLineIndex": 0 } }
```

ICE is trickle: candidates are sent as they appear. STUN/TURN servers for `RTCPeerConnection` come from signalhub's `hello`.

### The room PIN gate

Also inside `signal`, before any offer:

```json
{ "kind": "pin_required" }                                         // device → guest, on joining
{ "kind": "pin", "pin": "123456" }                                 // guest → device (the PIN of their invitation)
{ "kind": "pin", "token": "<43 chars base64url>" }                 // guest → device (return token or owner key)
{ "kind": "pin_result", "ok": true, "token": "<return token>" }    // device → guest
{ "kind": "pin_result", "ok": false, "reason": "used", "left": 4 } // device → guest
```

`reason` is `wrong` (`left` tries remain), `used` (another person used that invitation), `blocked` (this guest used their 5 tries) or `locked` (20 failures in 10 minutes in this room: nothing is accepted for 10 minutes, `retry_after` in seconds). A made-up token counts as a failed try. The website tries, in order, the owner key, the saved return token and the PIN typed on the guest page, and only shows the form when none works.

## `input` channel

12 bytes, big endian:

| Bytes | Field | Type |
|---|---|---|
| 0-1 | Sequence (wraps at 65535) | `uint16` |
| 2 | Local player (0 to 3) | `uint8` |
| 3 | Reserved (0) | `uint8` |
| 4-7 | Buttons | `uint32` (bits below) |
| 8-11 | Left stick X, Y and right stick X, Y | `int8` (-127 to 127, 0 = center) |

The **local player** lets two or more people play from the same browser (for example one on the keyboard and one on a gamepad) over the same channel. The device keeps one state per browser and local player and drops packets older than the last one. The browser repeats the state every 100 ms while anything is pressed, because the channel does not retransmit.

| Bit | Button | Keyboard | Standard gamepad |
|---|---|---|---|
| 0-3 | Up, down, left, right | Arrows | D-pad and left stick |
| 4 | Button 1 (bottom) | `Z` | 0 |
| 5 | Button 2 (right) | `X` | 1 |
| 6 | Button 3 (left) | `C` | 2 |
| 7 | Button 4 (top) | `A` | 3 |
| 8 | Button 5 (L1) | `S` | 4 |
| 9 | Button 6 (R1) | `D` | 5 |
| 10 | Start (your own seat's) | `Enter` | 9 |
| 11 | Coin | `5` | 8 |
| 12, 13 | L2, R2 | `Q`, `W` | 6, 7 |
| 14, 15 | L3, R3 | | 10, 11 |
| 16 | Home | | 16 |
| 17 | Capture | | 17 |
| 18-21 | Start of player 1 to 4 (1P to 4P) | `1`, `2`, `3`, `4` | |

- Bits 18 to 21 are the **Start row of an arcade panel**: any seated player can press another port's Start. The device merges them into that port's Start (`PortPad`) and ignores them from people without a seat.
- L2, R2, L3 and R3 never reach the core: in mame2003-plus they toggle things for everyone (L3 turns the game sound off, R2 opens MAME's menu).
- In the emulator: RetroPad B, A, Y, X, L, R are MAME buttons 1 to 6; Select is Coin.
- Gamepads are read with the browser's **Gamepad API** (USB and Bluetooth, no permissions or drivers). WebUSB is not used: Chrome blocks it for HID devices. Each gamepad is a local player in connection order. Gamepads without the standard mapping take their first reading as rest, so an idle gamepad never sends buttons, and the website has a remap screen.

## `control` channel (JSON)

### Room guests

| `type` | Direction | Content |
|---|---|---|
| `welcome` | device → guest | Greeting when the channel opens |
| `hello` | guest → device | `name` (up to 24 characters) and `local_players` (list of local players, 0 to 3). Sent again when they change |
| `room_state` | device → guest | Seats P1-P4, queue, spectators, `chat` (on/off), `info` (title, game, host, artwork), `you` (your ports, queue position, `swap_offers` and `swap_asked`), `pausable`, `paused`, `paused_by` and `controls` (`{players, buttons, control}` from the game's control panel, to draw the touch gamepad). Personal to each guest, sent on every change |
| `stream_stats` | device → guest | Frames per second sent, video size, display `aspect`. Every 2 s |
| `chat` | guest → device | `text` (up to 300 characters, 5 messages every 5 s) |
| `chat` | device → guest | `name`, `port`, `role`, `text`, `ts`, or `system` for notices. The last 50 on joining |
| `typing` | guest → device | `on` (`true` while typing, repeated every ~2.5 s; `false` when cleared). Sending a `chat` also clears it; the device clears it after 6 s without a repeat |
| `typing` | device → guest | `names` (`[{name, port}]`): who else is typing, never yourself |
| `spectate` | guest → device | Leave the seat and the queue, to just watch |
| `queue` | guest → device | Back to the queue from spectating |
| `swap_seat` | guest → device | `from`, `to` (ports). Swap controllers. Only from the person seated in `from` |
| `swap_answer` | guest → device | `from`, `to`, `accept`. The answer of the player in `to` |
| `pause` | guest → device | `paused` (`true` or `false`). Only from a seated player, only while a game runs (the test card cannot pause). While paused, the device repeats the last frame and sends no sound |
| `ping` / `pong` | device → browser → device | `id`. The device measures peer-to-peer latency every 2 s |

The browser measures its own latency from WebRTC ICE stats (`currentRoundTripTime`).

### Linked browsers

| `type` | Direction | Content |
|---|---|---|
| `auth` | linked → device | First message. Empty after redeeming a code; `link_id` and `token` when coming back with `reach`. Optional `terms`: the version of the terms of use accepted in that browser, kept with the link (`terms`, `terms_at` in `device.json`) |
| `auth_challenge` / `auth_proof` | linked ⇄ device | `link_id` + `nonce`, answered with `proof` (see [flows](flows.md#2-linking-a-browser-with-the-device)) |
| `auth_ok` | device → linked | `device_id`, `link_id` and, only after a code, the `token` to keep |
| `auth_failed` | device → linked | Readable `error`. The link no longer exists: the website forgets it and the device hangs up |
| `unlink` / `unlinked` | both | Remove this browser's link / the link was removed (from the website or the device window) |
| `device_status` | device → linked | Every 2 s: `rooms` (below), hardware (with `hostname`), CPU, RAM, machine-wide network traffic (`net_sent_bps`, `net_recv_bps`), STUN/TURN in use, the ROM library (each set with its `check` and `thumbs`, `library.thumb_kind`, `library.disk`, `library.thumbnails_bytes`), `saves_bytes` and the core state (`installed`, `catalog`). Never includes the pairing code |
| `create_room` | linked → device | `rom`, `title`, `voice`, `chat` (absent = on) and optional `art` (`boxart`, `title` or `snap`). Opens a **new** room |
| `room_created` / `room_error` | device → linked | `id` (device room), `room_id` (signalhub) or a readable `error`. Some errors carry a `code` the website translates: `too_many_rooms` with `limit`, `no_saves` |
| `room_action` | linked → device | `id` and `action`: `pause`, `resume`, `save` (optional `name`), `archive`, `delete` (to the trash), `purge` (forever, from the trash), `favorite`, `unfavorite`, `new_link` (new invitation), `chat_on` / `chat_off` |
| `room_start` | linked → device | `id` of an archived or trashed room and `from`: `continue`, `fresh` or `slot` (with `slot`) |
| `room_result` | device → linked | `id`, `action`, `ok`, readable `error` (and `code`) and, for `save`, `slot` |
| `close_room` | linked → device | `id`: archives that room (kept for older websites) |
| `invite` | linked → device | `id` of a room (or `test`): make a new invitation PIN |
| `invite_pass` | device → linked | `id`, `pin`, `expires_at` (or `error`) |
| `get_thumb` / `thumb` | both | `set`, `kind` (empty = the host's choice) and `size` (`card` 360x480, `mini` 96x128) / the same plus `data` (JPEG, base64) or `missing: true` |
| `download_core` | linked → device | Download the core and its game list (whatever is missing) |
| `set_roms_dir` / `roms_dir_result` | both | `dir`: absolute path of an existing folder on the device / `dir`, `ok`, `error` |
| `upload_result` | device → linked | Result of one file of the `files` channel: `id`, `name`, `ok`, `error` |
| `get_history` / `clear_history` | linked → device | Ask for (or clear) the game history. The device answers `history` |
| `history` | device → linked | `items`, newest first (up to 500): `room_id`, `name`, `rom`, `game`, `started_at`, `ended_at`, `peak_players`, `peak_spectators`, `reason` (`archived`, `deleted`, `failed` or `device_stopped`) and `people` (each browser that joined: `name`, `ports`, `ip` as seen on the chosen ICE pair, empty through TURN, and `path`, `direct` or `relay`). Only the owner sees it |

Each room in `device_status.rooms`:

```json
{ "id": "…", "name": "Turtles co-op", "rom": "tmnt", "game": "Teenage Mutant Ninja Turtles",
  "voice": true, "state": "live", "favorite": true, "room_id": "…",
  "invite": "…", "invite_code": "…", "owner_key": "…",
  "players": 3, "max_players": 4, "spectators": 5, "queue": 0,
  "since": "2026-09-27T01:10:00Z", "deleted_at": null, "no_saves": false,
  "saves": [{ "slot": 1, "name": "Stage 3", "at": "2026-09-26T22:17:00Z" }], "autosave": true }
```

## `files` channel

Only on linked browsers' connections. The host drops ROM zips on the website, and they land in the device's ROM folder, with no web server on the device. One file at a time:

```json
{ "type": "begin", "id": "f1", "name": "robby.zip", "size": 307200 }
```

Then the content in 16 KB **binary** messages, and finally:

```json
{ "type": "end", "id": "f1" }
```

The device answers on `control` with `upload_result`. Rules, enforced on the device:

- The name is a MAME set name: `.zip`, lowercase letters, digits and `_`, up to 16 characters. Only the base name is used, never a path.
- The file must start like a real ZIP, be at most 512 MB and match the announced `size`.
- It is written to a temporary file in the same folder and renamed at the end. It **never replaces** an existing set. Files get mode `0644`.
- If the channel closes halfway, the partial file is removed.
- The browser watches `bufferedAmount` so large files do not fill its memory.
