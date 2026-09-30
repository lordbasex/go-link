// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useState } from "react";
import { Button, EMPTY_PAD, type Pad } from "@go-link/shared";
import { t } from "../../i18n";
import { ControllerArt, type ControllerFamily } from "../ControllerArt";
import { JoyConPair } from "../../controllers/JoyConPair";

// The controllers go-link knows, each "playing" a fighting game move on
// its own (down, down-forward, forward and a punch, then a kick), so the
// page shows that every button reaches the game. Still drawings when the
// person asked for less motion.

const MOVE: number[] = [
  0,
  Button.Down,
  Button.Down | Button.Right,
  Button.Right,
  Button.Right | Button.B3,
  0,
  Button.B1,
  0,
  Button.B5 | Button.B6,
  0,
  Button.Start,
  0,
];
const STEP_MS = 260;
const FAMILIES: ControllerFamily[] = ["nintendo", "playstation", "xbox", "generic"];

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export function ControllersShowcase() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reducedMotion()) return;
    const id = window.setInterval(() => setTick((n) => n + 1), STEP_MS);
    return () => window.clearInterval(id);
  }, []);
  return (
    <ul className="lp-pads">
      {FAMILIES.map((family, i) => {
        // Each controller starts the move at another moment.
        const buttons = MOVE[(tick + i * 3) % MOVE.length] ?? 0;
        const pad: Pad = { ...EMPTY_PAD, buttons };
        const info = t.landing.pads[i];
        if (!info) return null;
        return (
          <li key={family} className="lp-pad">
            {family === "nintendo" ? (
              <JoyConPair pad={pad} label={info.name} />
            ) : (
              <ControllerArt family={family} pad={pad} label={info.name} />
            )}
            <strong>{info.name}</strong>
            <span className="small muted">{info.text}</span>
          </li>
        );
      })}
    </ul>
  );
}
