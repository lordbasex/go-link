# Deploying

go-link has three pieces to put in front of people:

| Piece | Where it runs | How |
|---|---|---|
| Signaling server (signalhub + coturn) | Any Linux server with Docker | From [its own repository](https://github.com/lordbasex/signalhub) |
| Website | Any static web host or CDN | `make web-build`, then upload `frontend/apps/web/dist` |
| Device | The hosts' computers | GitHub releases (`make release`) |

## Signaling server

signalhub is a separate, generic project. Its README has the step-by-step deployment, the ports to open (TCP 80/443, TCP and UDP 3478, the UDP relay range) and every variable. Its server builds the image from source with `docker compose`; no image is published to a registry.

For go-link, set in its `deploy/.env`:

| Variable | Value for go-link |
|---|---|
| `ALLOWED_ORIGINS` | Your website's origin, for example `https://go-link.org` (plus `http://localhost:5180` for development) |
| `ALLOWED_APPS` | Must include `go-link` |
| `MAX_ROOMS_PER_SESSION` | More than 1: each game room of a device is a room of the same session |

Then point the website (`SIGNAL_URL` at build time) and the devices (`--server-signaling` or `signal_url`) at `wss://<your domain>/ws`.

## Website

The website is a static single-page app:

```bash
make web-build                                      # frontend/apps/web/dist
SIGNAL_URL=wss://signal.example.com/ws make web-build   # for your own signaling server
```

Whatever serves it must:

1. **Serve `index.html` for every route** (`/rooms`, `/device`, `/g/<invite>`…): unknown paths return `index.html` with status 200.
2. **Cache** `assets/` (hashed file names) for a year (`public, max-age=31536000, immutable`) and **never cache** `index.html` (`no-cache`).
3. **Add the security headers** listed in [security.md](security.md#http-headers-for-the-website).
4. Serve over **HTTPS**.
5. Never publish `.map`, `.env` or other local files (`make web-build` already removes source maps).

`make web-deploy` builds the site and runs the upload defined in **`deploy/local/hosting.mk`**. That folder is gitignored, because upload commands, bucket or server names and account details belong to each deployment, not to the repository. Start from the example:

```bash
mkdir -p deploy/local
cp deploy/hosting.example.mk deploy/local/hosting.mk   # an rsync-over-SSH example
make web-deploy WEB_SERVER=user@host WEB_ROOT=/var/www/go-link
```

The file can define `web-deploy`, a `hosting-help` target (shown by `make help`) and `HOSTING_TARGETS = 1`, and it may include private settings from a gitignored `.env.deploy`. Without it, `make web-deploy` only builds the site and says where it is.

## Device

Hosts download the device from the GitHub releases: a `.dmg` for macOS, a `.zip` for Windows, `.tar.gz` for Linux (with and without window) and optionally a Docker image. See [building.md](building.md#releases) for `make release`, and [device.md](device.md#docker) for running the Docker image on a server or a Raspberry Pi.

The device's defaults point to the project's public services (`wss://signal.go-link.org/ws` and `https://go-link.org`). A self-hosted setup changes them with `signal_url` and `web_url` in `device.json`.
