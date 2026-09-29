# The Android app (go-link Player)

`mobile/android/` is **go-link Player**, a native Android app (Kotlin, Jetpack Compose) for joining a game as a player. It is not a web view: it speaks the same signaling and WebRTC protocol as the website ([protocol.md](protocol.md), signalhub's README) with a prebuilt libwebrtc. It only joins rooms. Hosting stays on the device app.

| | |
|---|---|
| Package | `org.golink.player` |
| Android | 8.0 (API 26) or newer; built against API 37, targets API 36 |
| Distribution | An APK attached to the GitHub releases (`go-link-player-vX.Y.Z.apk`), not in Play Store yet |
| Build, sign, install | [`mobile/android/README.md`](../mobile/android/README.md) |

## Layout

| Module | What it is |
|---|---|
| `:core` | Plain Kotlin, no Android types, tested on the JVM: the signalhub envelope and client (`SignalClient`, reconnect with jittered backoff, FIFO requests), invitation parsing, signaling URL rules, ICE servers from `hello`, the `input` packet (byte for byte the web's `encodeInput`), the touch pad and gamepad mapping, `room_state` / `chat` / `typing` / `stream_stats` parsing, the PIN gate, and `RoomClient`, which runs one room visit. It is the reference for an iOS (Swift) port. |
| `:app` | Android: Compose screens, OkHttp WebSockets, `AndroidRtcPeer` (stream-webrtc-android), the audio route, controllers, CameraX + ML Kit for the QR code, SharedPreferences. |

`RoomClient` is a port of the website's `useJoinRoom` + `useHostStream` + `HostStream`; the platform plugs in a WebSocket factory and an `RtcPeer` factory. Web files it mirrors: `packages/shared/src/{protocol,signal-client,stream,room-state,touch-pad,gamepad}.ts` and `apps/web/src/pages/roomModel.ts`.

## Joining

1. **Scan the QR code** (the invitation link `https://go-link.org/g/<invite>`), **type the 9-digit code** (or paste the link), or open an invitation link with the app installed (Android App Links).
2. The PIN screen: the **6-digit PIN** the host made for this person, and the terms checkbox (`Terms.VERSION` equals `TERMS_VERSION` in `frontend/apps/web/src/legal.ts`, a test checks it).
3. `join` with `invite` or `code` → `joined`; the device sends `pin_required` and the app sends the typed PIN; `pin_result` admits it (or says why not: wrong, used, blocked, locked). Then the device offers and the app answers.

Rules:

- **The PIN is never in a QR code or a link.** The QR code stays the website's invitation link.
- **Every new join asks for the PIN**, even when a return token for that room is stored. The `pin_result` token (kept per `room_id` in SharedPreferences `go-link.room-passes`, the last 20, like the website's localStorage) is only used to get back in by itself after the connection drops (network change, app in the background) during the same visit. A refused token is forgotten and the person is asked again.
- **A QR code is parsed strictly**: only exactly `https://go-link.org/g/<22 base64url characters>` (an optional trailing `/`) or a 9-digit code. Other hosts, `http://`, ports, user info, query strings and fragments are rejected. A QR code or a link never changes the signaling server or carries a PIN.
- The App Link intent filter only takes `https://go-link.org/g/…`, and only the path is read.

## Signaling server

The app uses `wss://signal.go-link.org/ws?v=1`. It sends no `Origin` header (signalhub accepts native clients) and `app` is `go-link`. STUN and TURN come only from `hello`, kept in memory and taken again on every reconnect. Nothing is hardcoded.

Settings has **Signaling server**, like the website's button: only `wss://`, tested for a `hello` before saving, a notice on the home screen while a custom server is active, and **Back to the official server**. Links and QR codes never change it. The network security config forbids clear-text traffic.

**Debug builds only** also accept `ws://` to the development machine (`localhost`, `127.0.0.1`, and `10.0.2.2`, the emulator's address for the computer), like the website's loopback exception: `SignalUrls.check(url, allowDevHosts = BuildConfig.DEBUG)` and a debug-only network security config (`app/src/debug/res/xml`). It is set by hand in Settings, like any server. Release builds keep `wss://` only and never take a server from a link or an intent.

## The room

- **Media:** VP8 video (drawn by an `EglRenderer` into a `TextureView`, stretched to the display `aspect` from `stream_stats`, since arcade pixels are not square), Opus game sound, and the `voice-p1`…`voice-p4` tracks. Per-player silence and a game sound switch use each remote track's volume.
- **Voice:** the microphone m-line the device offers `recvonly` is answered `sendonly` (`RtcSignals.micMid`), and the mic track is set with `RtpSender.setTrack`, so turning it on never renegotiates. Only seated players can talk in rooms with voice (the device enforces it too).
- **Channels:** `control` (JSON: `hello` with the name and local players, `chat`, `typing`, `spectate`, `queue`, `swap_seat`, `swap_answer`, `pause`, and `pong` to the device's pings) and `input` (12-byte packets, repeated every 100 ms while held, two extra releases). `files` is refused: it is only for the host's own browser.
- **Layout:** portrait is a Game Boy (picture on top, dock, gamepad below); landscape is a Switch (gamepad halves on both sides, dock on the right). Full screen, screen kept on.
- **On-screen gamepad:** buttons from `room_state.controls` (D-pad with 4-way games limited to four directions, 1 to 6 action buttons, Coin, 1P…NP start buttons from `startButtonCount`). Several fingers at once, a finger can slide between buttons, a short vibration on each press. Hidden while a physical controller is connected, and with the gamepad button of the dock.
- **Controllers:** Android `KeyEvent` and `MotionEvent` from Bluetooth and USB pads, mapped to the browser's standard Gamepad layout (A = bottom = button 1, B = right, X = left, Y = top, L1/R1, L2/R2 as keys or triggers, Select = Coin, Start, sticks and hats; the left stick also presses the directions). Each controller is a local player in the order it is first used (the first one shares player 0 with the touch pad), and `hello.local_players` lists them.
- **Chat and players:** a sheet with the chat (system notices translated from their `event`, generated guest names translated, the typing indicator) and the seats (move to a free seat, ask to swap, silence a voice), the queue, spectators, and Just watch / Join the queue. Swap requests show over the picture with Accept / Decline. Seated players can pause and resume a game.

## Permissions

Each one is asked when needed, after a short explanation screen:

| Permission | When | Without it |
|---|---|---|
| `CAMERA` | Opening the QR scanner | Type the code or paste the link; the scanner offers the system settings after a denial |
| `RECORD_AUDIO` | The first time the microphone is turned on | Play and listen; the mic button says it is blocked and opens the explanation again |
| `BLUETOOTH_CONNECT` (Android 12+) | Before the first room | Bluetooth headsets are not used; wired and USB headsets still are |
| `MODIFY_AUDIO_SETTINGS`, `INTERNET` | Install time (normal permissions) | |

**Audio route** (`audio/AudioRouter.kt`): while a room is open the app uses the communication audio mode, which gives echo cancellation and lets a headset's microphone work. It picks, in order, a Bluetooth LE headset, a Bluetooth SCO headset, a hearing aid, a USB headset or wired headphones, and otherwise the **loudspeaker** (never the earpiece). Android 12+ uses `setCommunicationDevice`; older versions use Bluetooth SCO and the speakerphone switch. It follows headsets being plugged in or out. Over Bluetooth, the communication mode means the headset's call profile (mono, lower quality than music), which is the price of using its microphone. Leaving the room restores the previous mode.

## App Links

The app declares `https://go-link.org/g/*` with `autoVerify`. Android trusts it only when `https://go-link.org/.well-known/assetlinks.json` lists the app's signing certificate. The file is in `frontend/apps/web/public/.well-known/assetlinks.json` with a **placeholder** fingerprint; fill it from the release keystore before a web deploy (steps in the [app README](../mobile/android/README.md#app-links-fingerprint)). The host must serve it as `application/json`, without redirects. Until it is verified, Android asks which app should open the link.

On Android, the website's `/g/:invite` page shows a small card under the PIN form (`components/AndroidAppCard.tsx`) linking to the latest release, with the browser as the other way to play.

## Tests and CI

- `./gradlew :core:test`: protocol parsing, input packets against vectors produced by the website's `encodeInput`, invitation parsing (hostile QR codes), signaling URLs, ICE servers, the terms version, room passes, and a full `RoomClient` visit with a fake signalhub and a fake peer (join, PIN, offer/answer, candidates, control, input repeats, drop and return with the token, refused token, host leaving).
- `./gradlew :app:assembleDebug` builds the app. CI runs both (`android` job in `.github/workflows/ci.yml`).
- `cd e2e && npm run test:android`: the app end to end on an emulator or phone (below).
- Not covered by automated tests: a real game with ROMs (the e2e uses the test pattern room), the camera, real headsets and controllers.

### End-to-end test on an emulator

`e2e/tests/android.spec.ts` (Playwright project `android`) starts the usual e2e stack (its own signalhub on 8191, a headless device with `--debug` and its own HOME, the website on 5191). A Chromium page with a fake microphone is the owner: it links the device, opens the test pattern room (taking P1) and makes the invitations. The debug APK, driven with `adb` and UiAutomator (Compose test tags exposed as resource ids: `join-pin`, `terms-check`, `room-seat`, `dock-mic`, `pad-dpad`, `chat-input`…), then:

1. points the app at `ws://10.0.2.2:8191/ws` in Settings (debug builds only);
2. joins by App Link (`am start -d https://go-link.org/g/<invite>`), types the PIN, ticks the terms, gets a seat, and the picture area of a screenshot is lit and varied (not black);
3. presses the D-pad, button 1 and Coin: the device's debug log shows each `input` packet;
4. game sound: inbound RTP packets and audio energy grow and the audio level is above 0 (decoded, not only received);
5. chat both ways (owner → app, app → owner);
6. voice both ways: the owner's fake microphone reaches the app's `voice-pN` track; with `RECORD_AUDIO` granted (`pm grant`), the app's microphone reaches the owner's `voice-pN` track (packets flowing; the emulator's microphone may be silence);
7. airplane mode on and off: the app comes back to its seat with the return token, never asking the PIN;
8. a wrong PIN and an already used PIN are refused (`used`), then a new invitation's PIN gets in;
9. joins with the 9-digit code typed on the home screen.

The app's debug build logs its room events and WebRTC counters (inbound/outbound RTP per track, audio levels, the candidate pair) once a second with the tag `GoLinkE2E` (`app/src/debug/.../E2eProbe.kt`; the release build has an empty probe in `app/src/release`), and the test reads them with `adb logcat -s GoLinkE2E`. Audio is proven with these counters: `screenrecord` records video only. The screen is recorded in chunks (`screenrecord`, 175 s each) and a screenshot is saved per step, all in `e2e/test-results/android/` (and copied to `E2E_EVIDENCE_DIR` when set).

ICE with the emulator works without TURN or `--announce`: the emulator sends its checks to the device's host candidate through the emulator's NAT, and the device learns a peer-reflexive candidate (`GoLinkE2E` shows `prflx->host`).

```bash
cd mobile/android && ./gradlew :app:assembleDebug     # the debug APK
emulator -avd <name> -no-window -no-snapshot -gpu swiftshader_indirect &   # keep audio on
cd ../../e2e && npm run test:android
```

Without a device in `adb devices` the project is skipped; `npm test` runs only the web project. `ANDROID_SERIAL` picks a device, `ANDROID_APK` another APK, and `ANDROID_SIGNAL_URL` another server (a phone can use `adb reverse tcp:8191 tcp:8191` and `ws://127.0.0.1:8191/ws`). `.github/workflows/android-e2e.yml` runs it weekly and by hand on an emulator with KVM. `E2E_CHROMIUM_SINGLE_PROCESS=1` runs Chromium as one process, only for a local macOS session where Chromium cannot start.

## Releases

`VERSION=x.y.z make android-apk` runs the tests and builds the signed release APK into `dist/android/`. Attach it to the GitHub release (`gh release upload vX.Y.Z dist/android/go-link-player-vX.Y.Z.apk`); the website's card and the guide point to the latest release. `scripts/release.sh` does not build it yet.
