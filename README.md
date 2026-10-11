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
| Desk (remote desktop) | https://desk.go-link.org | in progress |
| Meet (video calls) | https://meet.go-link.org | coming soon |
| Store (send files directly between two computers) | https://store.go-link.org | coming soon |
| Terminal (SSH terminal from the browser) | https://terminal.go-link.org | coming soon |

### The page

One page you scroll: the ecosystem (the hub and the five projects on a circle), a card per project (what it does, three key points, its links), how it works in three steps, the principles and a footer. Sections slide in with CSS scroll-driven animations where the browser has them (`animation-timeline: view()`), and simply show elsewhere or with reduced motion.

### Redirects

Until 2026-10-11 go-link.org was go-link Console's site. `edge/redirects.js` is a CDN function that runs on every request:

- `/` and the page's own files are served here.
- Any other path goes to `https://console.go-link.org` with the same path and query.
- `www.go-link.org` goes to `go-link.org`.

### Development

```bash
python3 -m http.server 5199 -d site    # http://localhost:5199
```

The page has no build step and no external requests: one HTML file, one stylesheet and one script (the Content Security Policy forbids inline ones) and the favicon. The layout is pure CSS: the projects sit on a circle around the hub (`--a` is each one's angle), and phones get a list. Each project keeps its own icon as inline SVG.

### License

MIT, see [LICENSE](LICENSE).
