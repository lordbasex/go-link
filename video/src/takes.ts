// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

// Where the good moments of each recorded take are (seconds into its WebM;
// e2e/tests/video.spec.ts records them, npm run video). Every take starts
// with the site's start logo (about 3 s).
export const T = {
  landing: { hero: 4, steps: 18, howItWorks: 34 },
  link: { code: 3, dashboard: 12, roms: 24 },
  room: { video: 8, controls: 14, latency: 24, invite: 42 },
  guest: { join: 8, playing: 14 },
  phone: { play: 4 },
  maker: { wizard: 1, editor: 10, preview: 20 },
  makerRoom: { title: 4, play: 10 },
  network: { charts: 4, log: 16 },
};
