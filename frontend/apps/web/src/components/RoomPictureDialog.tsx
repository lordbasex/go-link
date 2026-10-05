// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useId, useState } from "react";
import { roomPictureAction } from "@go-link/shared";
import { t } from "../i18n";
import { PictureFields, pictureLook } from "./PictureControl";
import { SITE_DEFAULT, samePicture, type PictureSettings } from "@go-link/ui/picture";

/**
 * The host's default picture for one room (a game room, or "test" for the
 * test pattern room): what guests see until they pick their own. It sends
 * room_action picture; the device keeps it in device.json.
 */
export function RoomPictureDialog({
  id,
  name,
  current,
  send,
  onClose,
}: {
  id: string;
  name: string;
  /** The room's default now (null: the site's default). */
  current: PictureSettings | null;
  send: (msg: unknown) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const [choice, setChoice] = useState<PictureSettings>(current ?? SITE_DEFAULT);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => (e.key === "Escape" || e.code === "Escape") && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const save = (picture: PictureSettings | null) => {
    send(roomPictureAction(id, picture));
    onClose();
  };
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog room-picture-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className="dialog-title">
          {t.picture.defaultTitle(name)}
        </h2>
        <p className="small muted">{t.picture.defaultText}</p>
        <p className="small faint">
          {t.picture.defaultNow(current ? pictureLook(current) : t.picture.siteDefault(pictureLook(SITE_DEFAULT)))}
        </p>
        <div className="stack-sm">
          <PictureFields settings={choice} onChange={(next) => setChoice((c) => ({ ...c, ...next }))} idPrefix={`default-${id}`} />
        </div>
        <div className="dialog-actions">
          <button
            type="button"
            className="button button-primary"
            disabled={samePicture(choice, current)}
            onClick={() => save(choice)}
          >
            {t.picture.save}
          </button>
          {current && (
            <button type="button" className="button button-secondary" onClick={() => save(null)}>
              {t.picture.useSiteDefault}
            </button>
          )}
          <button type="button" className="button button-secondary" onClick={onClose}>
            {t.picture.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
