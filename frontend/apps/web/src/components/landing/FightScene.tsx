// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import { GamepadIcon, SoundOffIcon, SoundOnIcon } from "../Icons";
import { Chiptune } from "./chiptune";

const SOUND_KEY = "go-link.landing-sound";

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) === "off";
  } catch {
    return false;
  }
}

/**
 * The retro music of the landing page: on unless the person muted it
 * (remembered), starting at the first tap or key when the browser does not
 * let a page play sound by itself, and gone when the page is left.
 */
function useChiptune() {
  const [muted, setMuted] = useState(readMuted);
  const music = useRef<Chiptune | null>(null);
  useEffect(() => {
    const tune = new Chiptune(performance.now());
    music.current = tune;
    return () => {
      tune.close();
      music.current = null;
    };
  }, []);
  useEffect(() => {
    const tune = music.current;
    if (!tune) return;
    if (muted) {
      tune.pause();
      return;
    }
    let started = false;
    const start = () => {
      void tune.play().then((ok) => {
        started = ok;
        if (ok) remove();
      });
    };
    const remove = () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", start);
    start();
    return () => {
      remove();
      if (!started) tune.pause();
    };
  }, [muted]);
  const toggle = () => {
    const next = !muted;
    setMuted(next);
    try {
      window.localStorage.setItem(SOUND_KEY, next ? "off" : "on");
    } catch {
      // storage blocked: the choice lasts for this page
    }
  };
  return { muted, toggle };
}

// An arcade screen drawn in code: two pixel fighters trade blows while
// their health bars drop, like any retro fighting game, but no real one
// (no game names, no game art). Under it, the two players who control
// them from far apart, joined by a live link. The motion is plain CSS
// (lp-* classes in global.css) and stops with prefers-reduced-motion.

/** One fighter, drawn facing right with its feet at (0, 0). */
function Fighter({ gi, pants, band }: { gi: string; pants: string; band: string }) {
  return (
    <g shapeRendering="crispEdges">
      <rect x="-18" y="-66" width="7" height="22" fill="#e7b48b" />
      <g className="lp-leg-back">
        <rect x="-12" y="-40" width="9" height="40" fill={pants} />
        <rect x="-14" y="-4" width="12" height="4" fill="#2a2f3d" />
      </g>
      <g className="lp-leg">
        <rect x="3" y="-40" width="9" height="40" fill={pants} />
        <rect x="3" y="-4" width="13" height="4" fill="#2a2f3d" />
      </g>
      <rect x="-12" y="-70" width="24" height="30" fill={gi} />
      <rect x="-12" y="-44" width="24" height="4" fill="#161a23" />
      <rect x="-9" y="-88" width="18" height="18" fill="#f0c29a" />
      <rect x="-10" y="-90" width="20" height="6" fill="#1b1f2a" />
      <rect x="-10" y="-84" width="20" height="3" fill={band} />
      <rect x="3" y="-80" width="3" height="3" fill="#161a23" />
      <g className="lp-arm">
        <rect x="10" y="-66" width="16" height="7" fill="#e7b48b" />
        <rect x="24" y="-68" width="9" height="10" fill={band} />
      </g>
    </g>
  );
}

function Spark({ className, x, y }: { className: string; x: number; y: number }) {
  return (
    <g className={className} transform={`translate(${x} ${y})`}>
      <polygon points="0,-16 4,-5 16,-6 6,2 11,14 0,6 -11,14 -6,2 -16,-6 -4,-5" fill="#fff4c2" />
      <polygon points="0,-8 2,-2 8,-3 3,1 5,7 0,3 -5,7 -3,1 -8,-3 -2,-2" fill="#f2a33a" />
    </g>
  );
}

export function FightScene() {
  const { muted, toggle } = useChiptune();
  return (
    <figure className="lp-scene">
      <div className="lp-screen">
        <svg viewBox="0 0 480 280" className="lp-svg" role="img" aria-label={t.landing.sceneLabel}>
          <defs>
            <linearGradient id="lp-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1a1440" />
              <stop offset="0.65" stopColor="#4a1d4f" />
              <stop offset="1" stopColor="#c0503a" />
            </linearGradient>
          </defs>
          <rect width="480" height="280" fill="url(#lp-sky)" />
          <circle cx="380" cy="70" r="26" fill="#ffd9a0" opacity="0.9" />
          {/* A city far away, then the floor. */}
          <g fill="#241a3d" shapeRendering="crispEdges">
            <rect x="0" y="170" width="40" height="40" />
            <rect x="36" y="150" width="30" height="60" />
            <rect x="70" y="176" width="44" height="34" />
            <rect x="120" y="140" width="26" height="70" />
            <rect x="150" y="166" width="50" height="44" />
            <rect x="290" y="156" width="36" height="54" />
            <rect x="330" y="176" width="46" height="34" />
            <rect x="380" y="146" width="28" height="64" />
            <rect x="412" y="170" width="68" height="40" />
          </g>
          <rect y="210" width="480" height="70" fill="#2b2336" />
          <g fill="#3a2f47" shapeRendering="crispEdges">
            <rect y="222" width="480" height="3" />
            <rect y="240" width="480" height="3" />
            <rect y="262" width="480" height="3" />
          </g>

          {/* Health bars and the round clock. */}
          <g shapeRendering="crispEdges">
            <rect x="20" y="18" width="180" height="12" fill="#161a23" />
            <rect x="22" y="20" width="176" height="8" fill="#e0627a" />
            <rect className="lp-hp lp-hp1" x="22" y="20" width="176" height="8" fill="#f2c94c" />
            <rect x="280" y="18" width="180" height="12" fill="#161a23" />
            <rect x="282" y="20" width="176" height="8" fill="#e0627a" />
            <rect className="lp-hp lp-hp2" x="282" y="20" width="176" height="8" fill="#f2c94c" />
          </g>
          <text x="20" y="46" className="lp-hud">1P</text>
          <text x="460" y="46" className="lp-hud" textAnchor="end">2P</text>
          <text x="240" y="32" className="lp-clock" textAnchor="middle">99</text>

          <g transform="translate(178 238) scale(1.4)">
            <g className="lp-f lp-f1">
              <Fighter gi="#f2a33a" pants="#b86d12" band="#ffffff" />
            </g>
          </g>
          <g transform="translate(302 238) scale(-1.4 1.4)">
            <g className="lp-f lp-f2">
              <Fighter gi="#4fc3d9" pants="#2b6573" band="#e0627a" />
            </g>
          </g>
          <Spark className="lp-spark lp-spark-on2" x={276} y={146} />
          <Spark className="lp-spark lp-spark-on1" x={202} y={184} />
        </svg>
        <div className="lp-scanlines" aria-hidden="true" />
        <button
          type="button"
          className={`icon-button lp-sound${muted ? "" : " is-on"}`}
          aria-pressed={!muted}
          aria-label={muted ? t.landing.soundOn : t.landing.soundOff}
          data-tip={muted ? t.landing.soundOn : t.landing.soundOff}
          onClick={toggle}
        >
          {muted ? <SoundOffIcon /> : <SoundOnIcon />}
        </button>
      </div>

      <figcaption className="lp-players">
        <span className="lp-player">
          <span className="lp-player-badge is-p1">P1</span>
          <GamepadIcon size={18} />
          <span className="lp-voice" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="small muted">{t.landing.p1Place}</span>
        </span>
        <span className="lp-link" aria-hidden="true">
          <span className="lp-link-line" />
          <span className="lp-link-chip">{t.landing.linkChip}</span>
        </span>
        <span className="lp-player">
          <span className="small muted">{t.landing.p2Place}</span>
          <span className="lp-voice is-late" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <GamepadIcon size={18} />
          <span className="lp-player-badge is-p2">P2</span>
        </span>
      </figcaption>
    </figure>
  );
}
