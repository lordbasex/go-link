// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useId, useRef, useState } from "react";
import {
  INPUT_ACTIONS,
  bind,
  bindingOf,
  type InputAction,
  type KeyMap,
  type PadMap,
} from "@go-link/shared";
import { t } from "../i18n";

export type RemapTarget =
  { kind: "keyboard" } | { kind: "pad"; id: string; name: string };

export interface RemapDialogProps {
  target: RemapTarget;
  keyboard: KeyMap;
  pad: PadMap;
  onKeyboard: (map: KeyMap) => void;
  onPad: (map: PadMap) => void;
  onReset: () => void;
  onClose: () => void;
}

/** A readable name for a KeyboardEvent.code ("KeyZ" -> "Z"). */
export function keyName(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Arrow")) {
    const dir = code.slice(5).toLowerCase() as "up" | "down" | "left" | "right";
    return t.remap.arrow(t.remap.actions[dir] ?? code.slice(5));
  }
  return code.replace(/(Left|Right)$/, " $1");
}

/**
 * Lets the player pick the key or gamepad button of each action. It listens
 * for the next key (capture phase, so the game does not get it) or the next
 * gamepad button pressed on that model.
 */
export function RemapDialog({
  target,
  keyboard,
  pad,
  onKeyboard,
  onPad,
  onReset,
  onClose,
}: RemapDialogProps) {
  const titleId = useId();
  const [listening, setListening] = useState<InputAction | null>(null);
  const listeningRef = useRef(listening);
  listeningRef.current = listening;

  // Keyboard: the next key press is the new binding.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = listeningRef.current;
      if (e.code === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (action) setListening(null);
        else onClose();
        return;
      }
      if (!action || target.kind !== "keyboard") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onKeyboard(bind(keyboard, e.code, action));
      setListening(null);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, [target, keyboard, onKeyboard, onClose]);

  // Gamepad: poll for a button that goes down while listening.
  useEffect(() => {
    if (target.kind !== "pad" || !listening) return;
    const pressedNow = (): Set<number> => {
      const out = new Set<number>();
      for (const gp of navigator.getGamepads?.() ?? []) {
        if (gp?.id === target.id)
          gp.buttons.forEach(
            (b, i) => (b.pressed || b.value > 0.5) && out.add(i),
          );
      }
      return out;
    };
    const before = pressedNow(); // buttons already held do not count
    let frame = 0;
    const tick = () => {
      const now = pressedNow();
      const fresh = [...now].find((i) => !before.has(i));
      if (fresh !== undefined) {
        onPad(bind(pad, fresh, listening));
        setListening(null);
        return;
      }
      for (const i of before) if (!now.has(i)) before.delete(i);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, listening, pad, onPad]);

  const current = (action: InputAction): string => {
    if (target.kind === "keyboard") {
      const code = bindingOf(keyboard, action);
      return code ? keyName(code) : t.remap.none;
    }
    const index = bindingOf(pad, action);
    return index !== undefined ? t.remap.button(Number(index)) : t.remap.none;
  };

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="dialog remap-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="dialog-title">
          {target.kind === "keyboard"
            ? t.remap.keyboardTitle
            : t.remap.padTitle(target.name)}
        </h2>
        <p className="muted small">
          {target.kind === "keyboard"
            ? t.remap.keyboardIntro
            : t.remap.padIntro}
        </p>
        <ul className="remap-list">
          {INPUT_ACTIONS.map(({ id }) => (
            <li key={id}>
              <span>{t.remap.actions[id]}</span>
              <button
                type="button"
                className={`button button-secondary button-small remap-key${listening === id ? " is-listening" : ""}`}
                onClick={() => setListening(listening === id ? null : id)}
              >
                {listening === id
                  ? target.kind === "keyboard"
                    ? t.remap.pressKey
                    : t.remap.pressButton
                  : current(id)}
              </button>
            </li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button
            type="button"
            className="button button-primary"
            onClick={onClose}
          >
            {t.remap.done}
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={onReset}
          >
            {t.remap.reset}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface ConfirmDialogProps {
  title: string;
  text: string;
  confirm: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** A safer choice, offered first (e.g. pause instead of closing). */
  alternative?: { label: string; onClick: () => void };
}

/** A modal that asks before something that cannot be undone. */
export function ConfirmDialog({
  title,
  text,
  confirm,
  onConfirm,
  onCancel,
  alternative,
}: ConfirmDialogProps) {
  const titleId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const alternativeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    (alternativeRef.current ?? confirmRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => (e.key === "Escape" || e.code === "Escape") && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="dialog-title">
          {title}
        </h2>
        <p className="muted">{text}</p>
        <div className="dialog-actions">
          {alternative && (
            <button
              ref={alternativeRef}
              type="button"
              className="button button-primary"
              onClick={alternative.onClick}
            >
              {alternative.label}
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            className="button button-danger"
            onClick={onConfirm}
          >
            {confirm}
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={onCancel}
          >
            {t.remap.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
