// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useRef } from "react";
import { t } from "../i18n";
import { PictureIcon } from "./Icons";
import { Select } from "./ui/Select";
import { inSheet, useSheetLayout } from "./sheet";
import {
  PICTURE_BANDS,
  PICTURE_STYLES,
  SITE_DEFAULT,
  samePicture,
  type PictureSettings,
} from "../picture/settings";

/** "CRT arcade · Ambient": a picture's style and sides, in the page's language. */
export function pictureLook(p: PictureSettings): string {
  return `${t.picture.styles[p.style]} · ${t.picture.bandNames[p.bands]}`;
}

/** The style and sides choices, shared by the dock's popover and the demo page. */
export function PictureFields({
  settings,
  onChange,
  idPrefix,
}: {
  settings: PictureSettings;
  onChange: (next: Partial<PictureSettings>) => void;
  idPrefix: string;
}) {
  return (
    <>
      <div className="audio-field">
        <label htmlFor={`${idPrefix}-style`} id={`${idPrefix}-style-label`} className="audio-label">
          {t.picture.style}
        </label>
        <Select
          id={`${idPrefix}-style`}
          labelId={`${idPrefix}-style-label`}
          className="audio-select"
          value={settings.style}
          onChange={(style) => onChange({ style })}
          options={PICTURE_STYLES.map((s) => ({ value: s, label: t.picture.styles[s], detail: t.picture.styleDetail[s] }))}
        />
      </div>
      <div className="audio-field">
        <label htmlFor={`${idPrefix}-bands`} id={`${idPrefix}-bands-label`} className="audio-label">
          {t.picture.bands}
        </label>
        <Select
          id={`${idPrefix}-bands`}
          labelId={`${idPrefix}-bands-label`}
          className="audio-select"
          value={settings.bands}
          onChange={(bands) => onChange({ bands })}
          options={PICTURE_BANDS.map((b) => ({ value: b, label: t.picture.bandNames[b], detail: t.picture.bandDetail[b] }))}
        />
      </div>
    </>
  );
}

/**
 * The dock's Picture button and its popover (a bottom sheet on phones):
 * how this browser draws the game. Changes apply at once, without a
 * reload, and only on this screen.
 */
export function PictureControl({
  open,
  setOpen,
  settings,
  onChange,
  compare,
  onCompare,
  available,
  roomDefault = null,
  saved = false,
  onReset,
  onSetRoomDefault,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  settings: PictureSettings;
  onChange: (next: Partial<PictureSettings>) => void;
  compare: boolean;
  onCompare: (on: boolean) => void;
  /** False when this browser has no WebGL (the plain picture stays). */
  available: boolean;
  /** The host's default for this room (room_state.picture), if any. */
  roomDefault?: PictureSettings | null;
  /** The viewer chose a picture of their own, and onReset forgets it. */
  saved?: boolean;
  onReset?: () => void;
  /** The room's owner only: makes the current picture the room's default. */
  onSetRoomDefault?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const sheet = useSheetLayout();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!rootRef.current?.contains(target) && !popRef.current?.contains(target)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => (e.key === "Escape" || e.code === "Escape") && setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open, setOpen]);
  return (
    <div className="picture-control" ref={rootRef}>
      <button
        type="button"
        className={`icon-button picture-button${open ? " is-on" : ""}`}
        aria-expanded={open}
        aria-label={t.picture.button}
        data-tip={open ? undefined : t.picture.button}
        onClick={() => setOpen(!open)}
      >
        <PictureIcon />
      </button>
      {open &&
        inSheet(
          sheet,
          setOpen,
          <div
            ref={popRef}
            className={`voice-pop picture-pop${sheet ? " is-sheet" : ""}`}
            role="dialog"
            aria-label={t.picture.title}
          >
            {sheet && <span className="sheet-handle" aria-hidden="true" />}
            <span className="strong">{t.picture.title}</span>
            <span className="small muted">{available ? t.picture.note : t.picture.unavailable}</span>
            {available && (
              <>
                <PictureFields settings={settings} onChange={onChange} idPrefix="room-picture" />
                {roomDefault && (
                  <span className="small muted picture-room-default">{t.picture.roomDefault(pictureLook(roomDefault))}</span>
                )}
                {saved && onReset && !samePicture(settings, roomDefault ?? SITE_DEFAULT) && (
                  <button type="button" className="button button-secondary picture-reset" onClick={onReset}>
                    {roomDefault ? t.picture.useRoomDefault : t.picture.useSiteDefault}
                  </button>
                )}
                {onSetRoomDefault &&
                  (samePicture(settings, roomDefault) ? (
                    <span className="small faint picture-owner-note">{t.picture.isRoomDefault}</span>
                  ) : (
                    <>
                      <button type="button" className="button button-secondary picture-set-default" onClick={onSetRoomDefault}>
                        {t.picture.setRoomDefault}
                      </button>
                      <span className="small faint picture-owner-note">{t.picture.ownerHint}</span>
                    </>
                  ))}
                <button
                  type="button"
                  className={`button button-secondary picture-compare${compare ? " is-on" : ""}`}
                  aria-pressed={compare}
                  onClick={() => onCompare(!compare)}
                >
                  {t.picture.compare}
                </button>
                {compare && <span className="small faint">{t.picture.compareHint}</span>}
              </>
            )}
          </div>,
        )}
    </div>
  );
}
