# go-link Player (Android)

The native Android app for joining a go-link game as a player. How it works: [docs/mobile.md](../../docs/mobile.md).

```
mobile/android/
├── core/   plain Kotlin: protocol, signaling client, room logic (JVM tests)
└── app/    Android: Compose UI, libwebrtc, camera, audio route, controllers
```

## Requirements

- JDK 17 (`brew install openjdk@17`; set `JAVA_HOME=/usr/local/opt/openjdk@17` on Intel Macs, `/opt/homebrew/opt/openjdk@17` on Apple silicon)
- The Android SDK (`~/Library/Android/sdk` on macOS). Gradle installs the platform and build tools it needs when the SDK licenses are accepted (`sdkmanager --licenses`).
- A `local.properties` with `sdk.dir=/path/to/Android/sdk`, or `ANDROID_HOME` set. It is gitignored.

## Build

```bash
cd mobile/android
./gradlew :core:test              # the portable logic's tests
./gradlew :app:assembleDebug      # app/build/outputs/apk/debug/app-debug.apk
```

From the repository root: `make android-debug`.

## Install and run

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n org.golink.player/.MainActivity
# open an invitation link straight on the PIN screen:
adb shell am start -a android.intent.action.VIEW -d "https://go-link.org/g/<invite>" org.golink.player
# debug builds only: play the startup intro 5 times slower (after force-stop, it runs on a cold start)
adb shell am start -n org.golink.player/.MainActivity --es introSlow 5
# debug builds only: the name step alone, or the room's overlays (stats box, see-through pad,
# pause banner) with sample values and no room, for screenshots
adb shell am start -n org.golink.player/.MainActivity --es lab alias
adb shell am start -n org.golink.player/.MainActivity --es lab overlay
```

A cold start shows the "INSERT COIN" intro (about 2 s, a tap skips it) with the coin sound from `res/raw/coin.wav`, an original sound written by `scripts/coin-sound.mjs`; Settings › Startup sound turns the sound off, and it never plays with the phone on silent or vibrate.

An emulator: `emulator -avd <name> -no-window -gpu swiftshader_indirect` (add `-no-audio` only when the sound does not matter). The scanner needs a camera (an emulator's virtual scene camera does not show QR codes, so type the code there).

## Name, pause, stats and controllers

- After the PIN the app asks **What's your name?** (2 to 20 letters, digits and spaces, no symbols or emoji; `core/.../PlayerName.kt`, the device's rules) and remembers it.
- Only the host pauses: the dock's pause button **asks for a pause** (`pause_request`) and can cancel it; it explains when the host is away or the game cannot pause.
- The round **stats** button at the top left of the picture shows fps, resolution and codec, ping, direct or relay, loss and audio, read from `getStats` once a second (`AndroidRtcPeer.sample()`, `core/.../LiveStats.kt`).
- With a real controller connected, the gamepad button shows the on-screen pad **see-through and display only**, lighting what you press on the controller. **Test controller** on the home screen checks a controller offline, with the input latency.
- Home and Settings show **go-link Player v*X.Y.Z* (build *N*)** from `BuildConfig` (" · debug" in debug builds).

Details: [docs/mobile.md](../../docs/mobile.md#your-name).

## Sound

In the room, **Players › Sound** picks the microphone (Automatic, the phone's, or a headset's) and the output (Automatic, the loudspeaker, or a headset), with a **Test sound** chime. Automatic is the usual route: headphones when connected, otherwise the loudspeaker, never the earpiece. The choice is remembered; when the chosen device disconnects the app goes back to Automatic and says so. The rules are in `core/.../AudioDevices.kt` (JVM tests), the Android side in `app/.../audio/AudioRouter.kt`; API-level limits in [docs/mobile.md](../../docs/mobile.md#sound-devices).

## End-to-end test

An emulator (or a phone) in `adb devices` and the debug APK, then from the repository root:

```bash
cd mobile/android && ./gradlew :app:assembleDebug
cd ../../e2e && npm run test:android
npm run test:android:camera     # opt-in: the QR scanner on the emulator's virtual camera
```

It starts its own signalhub, device and website, points the app at `ws://10.0.2.2:8191/ws` (debug builds accept `ws://` to the development machine), and checks joining by link and by code, PIN errors, the picture, the gamepad, game sound, the Sound sheet, chat, voice both ways, reconnecting after the network drops, the start buttons, the queue and spectating with the seats full of browser guests, and swapping seats. The camera test restarts the emulator with `-camera-back virtualscene`, shows it a QR code of a real invitation and starts it again as it was. Debug builds log room events and WebRTC counters with the tag `GoLinkE2E` (`adb logcat -s GoLinkE2E`); release builds do not. Details: [docs/mobile.md](../../docs/mobile.md#end-to-end-test-on-an-emulator).

## Release build and signing

The release build is minified (R8) and signed when signing values exist; otherwise it is left unsigned (`app-release-unsigned.apk`). Secrets are never committed: `keystore.properties`, `*.jks` and `*.keystore` are gitignored.

1. Create the key once and keep it safe (losing it means users must uninstall to update):

   ```bash
   keytool -genkeypair -v -keystore ~/keys/go-link-player.jks -alias go-link-player \
     -keyalg RSA -keysize 4096 -validity 10000
   ```

2. Either write `mobile/android/keystore.properties`:

   ```properties
   storeFile=/Users/you/keys/go-link-player.jks
   storePassword=...
   keyAlias=go-link-player
   keyPassword=...
   ```

   or keep that file outside the repository and point `GOLINK_SIGNING` (Gradle) or `ANDROID_SIGNING` (make, e.g. in the gitignored `deploy/local/hosting.mk`) to it, or export `GOLINK_KEYSTORE`, `GOLINK_KEYSTORE_PASSWORD`, `GOLINK_KEY_ALIAS` and `GOLINK_KEY_PASSWORD` (CI).

3. Build:

   ```bash
   ./gradlew :core:test :app:assembleRelease -PversionName=0.1.4 -PversionCode=104
   apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
   ```

   Or from the root: `VERSION=0.1.4 make android-apk` (JDK 17 from Homebrew, `versionCode` from the version: 0.1.4 → 104; it refuses an unsigned APK and copies it to `dist/android/go-link-player-v0.1.4.apk`). `versionCode` must grow with every release, or Android refuses the update. The app shows both on Home and in Settings ("go-link Player v0.1.4 (build 104)"); a build without the properties shows v0.1.0 (build 1).

4. `VERSION=x.y.z make release` builds it too (`ANDROID=0` skips it) and publishes it as `go-link-vx.y.z-android.apk`; the website's Android card downloads that file.

The APK holds libwebrtc for `arm64-v8a`, `armeabi-v7a` and `x86_64` (about 49 MB).

## App Links fingerprint

Invitation links (`https://go-link.org/g/…`) open the app without asking only when the website publishes the release key's fingerprint:

1. Read the SHA-256 of the release certificate:

   ```bash
   keytool -list -v -keystore ~/keys/go-link-player.jks -alias go-link-player | grep SHA256
   ```

2. Put it (the `AA:BB:…` form) in `frontend/apps/web/public/.well-known/assetlinks.json`, in `sha256_cert_fingerprints` (it already holds the current release key's). The debug key has its own fingerprint (`keytool -list -v -keystore ~/.android/debug.keystore -storepass android`); add it next to the release one only for testing.
3. Deploy the website. The file must be served at `https://go-link.org/.well-known/assetlinks.json` as `application/json`, with no redirect.
4. Check it on a phone with the app installed: `adb shell pm verify-app-links --re-verify org.golink.player`, then `adb shell pm get-app-links org.golink.player` (it should say `verified`).

## Rules for this code

- Source files start with the project's copyright line; code, comments and logs are in English. Only `values-es/strings.xml` and `values-pt/strings.xml` hold other languages, with the same keys as `values/strings.xml`.
- Nothing about STUN/TURN is hardcoded: they come from signalhub's `hello`.
- Protocol changes go to signalhub's README first, then the Go models, the TypeScript types and `:core`.
