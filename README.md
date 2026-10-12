<!-- Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com> -->
# go-link

> [!IMPORTANT]
> **The arcade game project that lived here moved.** It is now **go-link Console**:
> - Code and downloads: **[github.com/lordbasex/go-link-console](https://github.com/lordbasex/go-link-console)** ([latest release](https://github.com/lordbasex/go-link-console/releases/latest))
> - Website: **[console.go-link.org](https://console.go-link.org)**
>
> Since version 0.4.0 the app is `go-link-console` (Homebrew: `brew tap lordbasex/go-link-console https://github.com/lordbasex/go-link-console` and `brew install --cask go-link-console`). Older versions are not compatible: download the new one.

This repository is now the home of **[go-link.org](https://go-link.org)**, the index of the go-link project ecosystem.

## go-link.org

The GO-LINK project ecosystem: a landing page (`site/`) that links to every go-link project, all of them built on WebRTC, served at go-link.org and www.go-link.org. In English (default), Spanish and Portuguese: `site/i18n.js` swaps the texts and remembers the visitor's choice (`go-link.lang`); without JavaScript the page reads in English.

| Project | Address | Repository |
|---|---|---|
| Console (arcade games with friends) | https://console.go-link.org | [go-link-console](https://github.com/lordbasex/go-link-console) (available) |
| Desk (remote desktop) | https://desk.go-link.org | [go-link-desk](https://github.com/lordbasex/go-link-desk) (available) |
| Meet (video calls) | https://meet.go-link.org | coming soon |
| Store (send files directly between two computers) | https://store.go-link.org | coming soon |
| Terminal (SSH terminal from the browser) | https://terminal.go-link.org | coming soon |

### The page

One page you scroll, with the look of [desk.go-link.org](https://desk.go-link.org) (the same color tokens, fonts and landing components; dark by default, with a light theme behind the sun/moon button): the hero with the ecosystem (the go-link hub and the five projects on a circle, drawn in pure CSS: `--a` is each one's angle, sizes follow the circle's width in container units; the projects orbit the hub once a minute, like planets, and stop while one is pointed at or focused, or not at all with reduced motion), Console and Desk with their real screenshots, Meet, Store and Terminal with concept screens, how it works in three steps, the principles and a footer.

The images are in `site/img`: Console's screenshots come from go-link-console (`frontend/apps/web/public/shots` and `media`), Desk's from go-link-desk (`frontend/apps/web/public/landing`), and the Meet, Store and Terminal concepts were drawn as HTML pages with Desk's tokens and captured with headless Chrome. Screenshots with words in them exist in each language (`console-web-en.webp`…); `data-src-lang` swaps them.

### Redirects

Until 2026-10-11 go-link.org was go-link Console's site. `edge/redirects.js` is a CDN function that runs on every request:

- `/` and the page's own files are served here.
- Any other path goes to `https://console.go-link.org` with the same path and query.
- `www.go-link.org` goes to `go-link.org`.

### Analytics

The page counts visits with Google Analytics 4 (`G-MGF9L3YHVB`), only with the visitor's consent. A notice at the bottom says go-link keeps no data and asks; until they press Accept nothing from Google loads. `analytics.js` then adds `gtag.js` and sets it up (Google's snippet is inline; the Content Security Policy forbids inline scripts). The choice is remembered in the browser (`go-link.consent`); "Cookie settings" in the footer asks again, and rejecting after accepting stops it and deletes Google's `_ga` cookies. The CDN's response headers policy for this distribution (`go-link-index-security-headers`) allows exactly what GA4 needs:

```
script-src 'self' https://*.googletagmanager.com
img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com
connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com
```

### Development

```bash
python3 -m http.server 5199 -d site    # http://localhost:5199
```

The page has no build step: one HTML file, one stylesheet, three small scripts (`theme.js` applies the saved theme before the page paints, `i18n.js` swaps the texts and runs the theme button, `analytics.js`), the favicon, the images and the fonts. The fonts (Chakra Petch, IBM Plex Sans and JetBrains Mono, SIL Open Font License 1.1, see `site/fonts/OFL.txt`) are served from the site itself, latin and latin-ext only. Besides Google Analytics there are no external requests.

### License

MIT, see [LICENSE](LICENSE).
