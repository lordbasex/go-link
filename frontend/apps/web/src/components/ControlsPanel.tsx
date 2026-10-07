// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useId, useState } from "react";
import {
  DEFAULT_KEYBOARD,
  MAX_LOCAL_PLAYERS,
  type GameControls,
  type InputAction,
  type InputConfig,
  type KeyMap,
} from "@go-link/shared";
import { t } from "../i18n";
import type { ControllerInfo } from "../signal/useHostStream";
import type { RemapTarget } from "./RemapDialog";
import { ControllerArt, familyOf } from "./ControllerArt";
import { Select } from "./ui/Select";

/** P1..P4, for the keyboard's player. */
const PLAYER_OPTIONS = Array.from({ length: MAX_LOCAL_PLAYERS }, (_, i) => ({ value: String(i), label: `P${i + 1}` }));

/** Short label of an action, shown on keys. */
const ACTION_LABEL: Record<InputAction, string> = {
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  b1: "B1",
  b2: "B2",
  b3: "B3",
  b4: "B4",
  b5: "B5",
  b6: "B6",
  start: "Start",
  coin: "Coin",
  l2: "L2",
  r2: "R2",
  l3: "L3",
  r3: "R3",
  home: "Home",
  capture: "Capture",
  start1: "1P",
  start2: "2P",
  start3: "3P",
  start4: "4P",
  pause: "Pause",
};

type Key = { code: string; label: string; w?: number };

/**
 * Whether the running game reads an action: the stick, Coin and Start
 * always; buttons up to the game's count; the players' starts up to its
 * players (4 when it does not say). L2, R2, L3, R3, Home, Capture and the
 * host's pause never reach the game.
 */
export function gameUses(action: InputAction, game: GameControls): boolean {
  switch (action) {
    case "up":
    case "down":
    case "left":
    case "right":
    case "coin":
    case "start":
      return true;
    case "b1":
    case "b2":
    case "b3":
    case "b4":
    case "b5":
    case "b6":
      return Number(action.slice(1)) <= game.buttons;
    case "start1":
    case "start2":
    case "start3":
    case "start4":
      return Number(action.slice(5)) <= (game.players > 0 ? game.players : 4);
    default:
      return false;
  }
}

const isMac =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
const META = isMac ? "Cmd" : "Win";
const ALT = isMac ? "Opt" : "Alt";

const letters = (codes: string) =>
  codes.split("").map((c) => ({ code: `Key${c}`, label: c }));

const ROWS: Key[][] = [
  [
    { code: "Backquote", label: "`" },
    ..."1234567890".split("").map((d) => ({ code: `Digit${d}`, label: d })),
    { code: "Minus", label: "-" },
    { code: "Equal", label: "=" },
    { code: "Backspace", label: "Backspace", w: 2 },
  ],
  [
    { code: "Tab", label: "Tab", w: 1.5 },
    ...letters("QWERTYUIOP"),
    { code: "BracketLeft", label: "[" },
    { code: "BracketRight", label: "]" },
    { code: "Backslash", label: "\\", w: 1.5 },
  ],
  [
    { code: "CapsLock", label: "Caps", w: 1.75 },
    ...letters("ASDFGHJKL"),
    { code: "Semicolon", label: ";" },
    { code: "Quote", label: "'" },
    { code: "Enter", label: "Enter", w: 2.25 },
  ],
  [
    { code: "ShiftLeft", label: "Shift", w: 2.25 },
    ...letters("ZXCVBNM"),
    { code: "Comma", label: "," },
    { code: "Period", label: "." },
    { code: "Slash", label: "/" },
    { code: "ShiftRight", label: "Shift", w: 2.75 },
  ],
  [
    { code: "ControlLeft", label: "Ctrl", w: 1.25 },
    { code: "MetaLeft", label: META, w: 1.25 },
    { code: "AltLeft", label: ALT, w: 1.25 },
    { code: "Space", label: "Space", w: 6.25 },
    { code: "AltRight", label: ALT, w: 1.25 },
    { code: "MetaRight", label: META, w: 1.25 },
    { code: "ContextMenu", label: "Menu", w: 1.25 },
    { code: "ControlRight", label: "Ctrl", w: 1.25 },
  ],
];

function KeyCap({
  k,
  held,
  keymap,
  game,
}: {
  k: Key;
  held: ReadonlySet<string>;
  keymap: KeyMap;
  game?: GameControls;
}) {
  const action = keymap[k.code];
  const mapped = action !== undefined;
  const used = mapped && game !== undefined && gameUses(action, game);
  const pressed = held.has(k.code);
  return (
    <span
      className={`kb-key${mapped ? " is-mapped" : ""}${used ? " is-game" : ""}${pressed ? " is-pressed" : ""}`}
      style={{ flexGrow: k.w ?? 1 }}
      title={used ? t.controls.gameKey : undefined}
    >
      {mapped && <span className="kb-legend">{k.label}</span>}
      <span className="kb-label">
        {mapped ? ACTION_LABEL[action] : k.label}
      </span>
    </span>
  );
}

/** On-screen keyboard with the game keys highlighted, like an arcade key map. */
export function KeyboardView({
  held,
  keymap = DEFAULT_KEYBOARD,
  game,
}: {
  held: ReadonlySet<string>;
  keymap?: KeyMap;
  /** The running game's controls: the keys it reads get an orange border. */
  game?: GameControls;
}) {
  const arrow = (code: string, label: string) => (
    <KeyCap k={{ code, label }} held={held} keymap={keymap} game={game} />
  );
  return (
    <div className="kb" aria-label={t.controls.keyboardLabel}>
      <div className="kb-main">
        {ROWS.map((row, i) => (
          <div key={i} className="kb-row">
            {row.map((k) => (
              <KeyCap key={k.code} k={k} held={held} keymap={keymap} game={game} />
            ))}
          </div>
        ))}
      </div>
      <div className="kb-arrows">
        <div className="kb-row kb-row-center">{arrow("ArrowUp", "Up")}</div>
        <div className="kb-row">
          {arrow("ArrowLeft", "Left")}
          {arrow("ArrowDown", "Down")}
          {arrow("ArrowRight", "Right")}
        </div>
      </div>
    </div>
  );
}

/** Live drawing of one gamepad. */
export function GamepadView({
  controller,
  onPlayer,
  onRemap,
}: {
  controller: ControllerInfo;
  onPlayer?: (slot: string, player: number | null) => void;
  onRemap?: () => void;
}) {
  const uid = `gp-player-${useId()}`;
  return (
    <figure className="gp">
      <ControllerArt
        family={familyOf(controller.id)}
        pad={controller.pad}
        label={t.controls.gamepadLabel(controller.player, controller.name)}
      />
      <figcaption className="small gp-caption">
        <span>
          <span className="controller-tag">P{controller.player + 1}</span>{" "}
          {controller.name}
        </span>
        {onPlayer && (
          <span className="gp-player">
            <label id={`${uid}-label`} htmlFor={uid}>
              {t.controls.playsAs}
            </label>
            <Select
              id={uid}
              labelId={`${uid}-label`}
              className="select-sm"
              value={controller.auto ? "auto" : String(controller.player)}
              onChange={(v) => onPlayer(controller.slot, v === "auto" ? null : Number(v))}
              options={[
                { value: "auto", label: t.controls.auto },
                ...Array.from({ length: MAX_LOCAL_PLAYERS }, (_, i) => ({ value: String(i), label: `P${i + 1}` })),
              ]}
            />
          </span>
        )}
        {onRemap && (
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={onRemap}
          >
            {t.controls.remapButtons}
          </button>
        )}
      </figcaption>
    </figure>
  );
}

export interface ControlsPanelProps {
  controllers: ControllerInfo[];
  heldKeys: ReadonlySet<string>;
  keyboardPlayer: number;
  onKeyboardPlayer: (player: number) => void;
  input?: InputConfig;
  onRemap?: (target: RemapTarget) => void;
  onPlayer?: (slot: string, player: number | null) => void;
  /** The running game's controls (room_state.controls). */
  game?: GameControls;
}

/**
 * Panel under the video. With gamepads connected it offers two tabs
 * (gamepads and keyboard); otherwise it shows the keyboard map.
 */
export function ControlsPanel({
  controllers,
  heldKeys,
  keyboardPlayer,
  onKeyboardPlayer,
  input,
  onRemap,
  onPlayer,
  game,
}: ControlsPanelProps) {
  const [tab, setTab] = useState<"gamepads" | "keyboard">("gamepads");
  const hasPads = controllers.length > 0;
  const view = hasPads ? tab : "keyboard";
  return (
    <section className="controls-panel" aria-label={t.controls.title}>
      <div className="controls-head">
        {hasPads ? (
          <div
            role="tablist"
            aria-label={t.controls.title}
            className="tabs tabs-compact"
          >
            {(["gamepads", "keyboard"] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={view === id}
                className={`tab${view === id ? " is-on" : ""}`}
                onClick={() => setTab(id)}
              >
                {t.controls.tabs[id]}
                {id === "gamepads" && (
                  <span className="tab-count">{controllers.length}</span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <span className="strong">{t.controls.keyboardTitle}</span>
        )}
        <span className="kb-player small muted">
          <label id="kb-player-label" htmlFor="kb-player">
            {t.controls.keyboardPlaysAs}
          </label>
          <Select
            id="kb-player"
            labelId="kb-player-label"
            className="select-sm"
            value={String(keyboardPlayer)}
            onChange={(v) => onKeyboardPlayer(Number(v))}
            options={PLAYER_OPTIONS}
          />
        </span>
      </div>
      {view === "gamepads" ? (
        <div className="gp-list">
          {controllers.map((c) => (
            <GamepadView
              key={c.slot}
              controller={c}
              onPlayer={onPlayer}
              onRemap={
                onRemap
                  ? () => onRemap({ kind: "pad", id: c.id, name: c.name })
                  : undefined
              }
            />
          ))}
        </div>
      ) : (
        <>
          <KeyboardView held={heldKeys} keymap={input?.keyboard} game={game} />
          <div className="kb-footer">
            <p className="small muted">
              {t.controls.keyboardHint}
              {game && <> <span className="kb-game-note">{t.controls.gameKeysNote}</span></>}
            </p>
            {onRemap && (
              <button
                type="button"
                className="button button-secondary button-small"
                onClick={() => onRemap({ kind: "keyboard" })}
              >
                {t.controls.remapKeys}
              </button>
            )}
          </div>
        </>
      )}
      {hasPads && controllers.some((c) => c.player === keyboardPlayer) && (
        <p className="small muted">{t.controls.shared(keyboardPlayer)}</p>
      )}
    </section>
  );
}
