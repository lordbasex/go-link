// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { Easing } from "remotion";
import "@fontsource/chakra-petch/600.css";
import "@fontsource/chakra-petch/700.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/jetbrains-mono/500.css";

// go-link's colors (packages/shared/src/tokens.css, dark theme) and fonts.
export const C = {
  bg: "#0e1016",
  surface: "#161a23",
  surface2: "#1b2030",
  border: "#262c3a",
  borderStrong: "#3a4256",
  text: "#e9ecf2",
  muted: "#a3abbd",
  faint: "#8c95a8",
  accent: "#f2a33a",
  accentHi: "#ffc06b",
  onAccent: "#1a1206",
  voice: "#4fc3d9",
  ok: "#7ee2a8",
  p1: "#f2a33a",
  p2: "#4fc3d9",
  p3: "#e0627a",
  p4: "#9d8cf0",
};

export const F = {
  display: "'Chakra Petch', system-ui, sans-serif",
  text: "'IBM Plex Sans', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
};

export const FPS = 30;

// The motion identity (energetic arcade): one signature curve for
// entrances, its mirror for exits, and three durations.
export const EASE_IN = Easing.bezier(0.16, 1, 0.3, 1); // entrances: fast, soft landing
export const EASE_OUT = Easing.bezier(0.7, 0, 0.84, 0); // exits: gentle start, quick leave
export const EASE_ON = Easing.bezier(0.45, 0, 0.55, 1); // on screen: smooth both ends
export const D = { quick: 8, standard: 14, reveal: 24 }; // frames at 30 fps: 0.27 s, 0.47 s, 0.8 s

export const sec = (s: number) => Math.round(s * FPS);
