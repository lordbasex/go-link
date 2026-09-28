# frontend: the go-link website

React + TypeScript with npm workspaces.

| Package | What it is |
|---|---|
| `packages/shared` (`@go-link/shared`) | Protocol types, signaling client, WebRTC player, SHA-256/HMAC, design tokens |
| `apps/web` (`@go-link/web`) | The website |

```bash
npm install
npm run dev          # http://localhost:5180
npm test
npm run typecheck
npm run build        # apps/web/dist, a static site
```

Configuration goes in `apps/web/.env.local` (template: `apps/web/.env.example`). UI text lives in `apps/web/src/i18n/` (`en.ts` is the reference; `es.ts` and `pt.ts` keep its exact shape).

Full documentation: [docs/web.md](../docs/web.md).
