// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { romFile, type DeviceRom } from "@go-link/shared";
import { t } from "../i18n";
import { MiniArt } from "./device/RomsTab";

export interface GameOption {
  id: string;
  game: string;
  detail: string;
  /** A warning from the device's check, if any. */
  note?: string;
  /** The device's ROM, for its Boxart (absent in demo mode). */
  rom?: DeviceRom;
}

/** How many matches the list draws at once; typing narrows the rest. */
const MAX_SHOWN = 80;

const initials = (s: string) =>
  s
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

function Art({ option }: { option: GameOption }) {
  return option.rom ? (
    <MiniArt rom={option.rom} fallback={initials(option.game)} />
  ) : (
    <span className="roms-mini-screen" aria-hidden="true">
      {initials(option.game)}
    </span>
  );
}

/**
 * Picks one game from a library of any size: a button with the chosen
 * game's Boxart opens a searchable list (combobox). Arrows move, Enter
 * picks, Escape closes.
 */
export function GamePicker({
  options,
  value,
  onChange,
  label,
}: {
  options: GameOption[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.id === value);

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      q
        ? options.filter(
            (o) => o.game.toLowerCase().includes(q) || o.id.includes(q) || o.detail.toLowerCase().includes(q),
          )
        : options,
    [options, q],
  );
  const shown = matches.slice(0, MAX_SHOWN);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  // Keep the highlighted option in view while moving with the arrows.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const openList = () => {
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.id === value)));
    setOpen(true);
  };
  const pick = (o: GameOption) => {
    onChange(o.id);
    setOpen(false);
  };

  return (
    <div className="game-picker" ref={rootRef}>
      <button
        type="button"
        className={`game-picker-button${open ? " is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={selected ? `${label}: ${selected.game}` : label}
        onClick={() => (open ? setOpen(false) : openList())}
      >
        {selected ? (
          <>
            <Art option={selected} />
            <span className="game-picker-text">
              <span className="strong game-picker-title">{selected.game}</span>
              <span className="small muted">
                {selected.detail} · <span className="mono">{selected.rom ? romFile(selected.rom) : `${selected.id}.zip`}</span>
              </span>
            </span>
          </>
        ) : (
          <span className="muted grow">{t.create.pickGame}</span>
        )}
        <svg className="game-picker-caret" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="game-picker-panel">
          <label className="dash-search game-picker-search">
            <span className="visually-hidden">{t.create.searchGame}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              type="search"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
              placeholder={t.create.searchGame}
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, shown.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (shown[active]) pick(shown[active]);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                }
              }}
            />
          </label>
          <ul className="game-picker-list" role="listbox" id={listId} ref={listRef} aria-label={label}>
            {shown.map((o, i) => (
              <li
                key={o.id}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={o.id === value}
                className={`game-picker-option${i === active ? " is-active" : ""}${o.id === value ? " is-on" : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
              >
                <Art option={o} />
                <span className="game-picker-text">
                  <span className="game-picker-title">{o.game}</span>
                  <span className="small faint">
                    {o.detail} · <span className="mono">{o.rom ? romFile(o.rom) : `${o.id}.zip`}</span>
                  </span>
                  {o.note && <span className="small option-note">{o.note}</span>}
                </span>
              </li>
            ))}
            {shown.length === 0 && <li className="game-picker-empty muted small-plus">{t.create.noGames}</li>}
          </ul>
          <div className="game-picker-foot small faint">
            {matches.length > shown.length ? t.create.moreGames(shown.length, matches.length) : t.roms.showing(matches.length, options.length)}
          </div>
        </div>
      )}
    </div>
  );
}
