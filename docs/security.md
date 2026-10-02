# Security

## Signaling (signalhub)

Details in [signalhub's README](https://github.com/lordbasex/signalhub). In short:

- Single-use pairing codes that expire, cryptographically random `session_id`, relay only within the same session, `From` always set by the server, `Origin` check, message size limits, TLS (`wss://`).
- `register` requires the `device_secret`, and signalhub binds each `device_id` to it: nobody else can register as that device.
- Rate limits on `claim` and `join`, per-IP and total connection caps, a per-connection message rate, and a limit on room and invitation creation. IPv6 is limited by `/64`.
- TURN credentials are short-lived and unique to each connection; coturn has quotas, no TCP relay, and never relays into private or reserved networks.

## Device

- **With a window it opens no port.** The window uses the services inside the same process, and browsers reach the device only over WebRTC after linking with a code.
- **Headless**, it opens the local panel (:7373): only the website files and a WebSocket for the WebRTC negotiation. Login is a nonce + HMAC proof of the panel token (the token never travels), same-panel `Origin` only, and an IP block after 5 wrong proofs in a minute.
- **Linked browsers:** only the SHA-256 of each token is stored. On a reconnect the device proves itself first (HMAC challenge), and a browser that has not shown a valid token within 15 s gets nothing and is dropped.
- **Rooms:** every room is private. One PIN per invitation and per person, a return token per guest, an owner key per room session, all in memory only. 5 tries per guest, and 20 failures in 10 minutes lock the room for 10 minutes. The owner key and return tokens are checked before the lockout, so an attack does not lock out the host or admitted guests.
- **Room guests never see device data** (hardware, usage, history, IPs); only linked browsers do. The history with guests' IPs is visible only to the owner.
- **Input and voice rules are enforced on the device:** only seated players' input reaches the game, and only seated players' voice is forwarded.
- **Uploads:** strict set names, ZIP signature check, size limit, temporary file + rename, never overwrites.
- **Thumbnails:** size limits on files and pixels before decoding.
- `device.json`, `history.json` and the recordings (`rec/`) are `0600`. `device.lock` prevents two devices at once.
- Recordings are served only to linked browsers that proved their link, only on their `files` channel and only by recording id (`<room id>/<file>.webm`, checked against a strict pattern): never a path. The device serves no recording to room guests.

## Website

- Never handles ROMs.
- Strict Content Security Policy, with `connect-src wss:` to allow self-hosted signaling servers. No inline scripts or styles.
- The signaling server is kept in `localStorage` and changed only by hand, never from a link.
- PINs are never put in URLs.
- No third-party requests: fonts are bundled, and there are no analytics, ads or trackers.
- Text from other users is always rendered as text.
- SHA-256 and HMAC are implemented in TypeScript (`packages/shared/src/hmac.ts`), because `crypto.subtle` is missing on plain `http` pages such as the local panel.

## HTTP headers for the website

A `<meta>` CSP cannot set everything. Whatever static host or CDN serves the website should add these headers to every response:

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' wss:; media-src 'self' blob:; base-uri 'none'; form-action 'self'; object-src 'none'; frame-ancestors 'none'` | Own scripts and styles only (plus WebAssembly, for the in-browser MP4 conversion), WebSockets only over `wss:`, and no one can frame the site |
| `X-Frame-Options` | `DENY` | The same for older browsers (clickjacking) |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Always HTTPS |
| `X-Content-Type-Options` | `nosniff` | No content type guessing |
| `Referrer-Policy` | `no-referrer` | Invitation links do not leak to other sites |
| `Permissions-Policy` | `microphone=(self), camera=(), geolocation=(), payment=()` | The microphone is for voice between players and for dictation in Willy Maker (Chrome's on-device recognition only) |

If the CSP in `frontend/apps/web/index.html` changes, change it on the host too.

## Repository hygiene

- Secrets never go in the repository: `.env` files are gitignored (only `.env.example` templates are committed), and hosting settings live in the gitignored `deploy/local/`.
- CI runs gitleaks over the whole history on every push. Fake tokens in tests carry a `gitleaks:allow` comment.
- CI runs `govulncheck` for Go and `npm audit` for the website.

## Reporting a vulnerability

Please report security issues privately by email to lord.basex@gmail.com instead of opening a public issue.
