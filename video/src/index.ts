// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { Composition, registerRoot } from "remotion";
import { createElement, Fragment } from "react";
import { Trailer, TRAILER_FRAMES } from "./Trailer";
import { FPS } from "./theme";

function Root() {
  return createElement(
    Fragment,
    null,
    createElement(Composition, { id: "Trailer", component: Trailer, durationInFrames: TRAILER_FRAMES, fps: FPS, width: 1920, height: 1080 }),
  );
}

registerRoot(Root);
