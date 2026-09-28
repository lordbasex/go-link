// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { formatCode, parseInvitePass, type InvitePass } from "@go-link/shared";
import { t } from "../i18n";
import { useSignal } from "../signal/SignalProvider";
import { CopyButton } from "./CopyButton";
import { QrCode } from "./QrCode";

/**
 * The owner's way to invite one person: the room's link with its QR code,
 * or the 9 digit code, and a PIN made for this invitation. The PIN lets in
 * only the first browser that uses it, so every opening of the dialog (and
 * "Invite someone else") asks the device for a new one. "New link"
 * replaces the room's link and code for everyone.
 */
export function InviteDialog({
  room,
  fallbackUrl,
  onAction,
  onClose,
}: {
  room: { id: string; name: string; invite: string; inviteCode: string };
  /** The room's plain link, while there is no invitation yet. */
  fallbackUrl: string;
  onAction: (action: "new_link") => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => (e.key === "Escape" || e.code === "Escape") && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const link = room.invite ? `${window.location.origin}/g/${room.invite}` : fallbackUrl;
  const { sendToDevice, onDeviceMessage } = useSignal();
  const [pass, setPass] = useState<InvitePass | null>(null);
  // One new PIN when the dialog opens and one per "Invite someone else",
  // never on a mere re-render.
  const send = useRef(sendToDevice);
  send.current = sendToDevice;
  const invite = useCallback(() => {
    setPass(null);
    send.current({ type: "invite", id: room.id });
  }, [room.id]);
  useEffect(
    () =>
      onDeviceMessage((msg) => {
        const p = parseInvitePass(msg);
        if (p && p.id === room.id) setPass(p);
      }),
    [onDeviceMessage, room.id],
  );
  useEffect(invite, [invite]);
  const expires =
    pass && "pin" in pass && pass.expiresAt
      ? new Date(pass.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog invite-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className="dialog-title">
          {t.invite.title(room.name)}
        </h2>
        <p className="muted small-plus">{t.invite.introOne}</p>

        <div className="invite-grid">
          <div className="invite-qr">
            <QrCode text={link} label={t.invite.qrLabel} />
            <span className="small faint">{t.invite.qrHint}</span>
          </div>
          <div className="stack-md invite-fields">
            <div className="stack-xxs">
              <span className="field-label">{t.invite.link}</span>
              <div className="invite-row">
                <span className="invite-url mono">{link.replace(/^https?:\/\//, "")}</span>
                <CopyButton text={link} label={t.invite.copyLink} />
              </div>
            </div>
            {room.inviteCode && (
              <div className="stack-xxs">
                <span className="field-label">{t.invite.code}</span>
                <div className="invite-row">
                  <span className="invite-code mono">{formatCode(room.inviteCode)}</span>
                  <CopyButton text={room.inviteCode} label={t.invite.copyCode} />
                </div>
                <span className="small faint">{t.invite.codeHint}</span>
              </div>
            )}
            <div className="stack-xxs">
              <span className="field-label">{t.invite.pin}</span>
              <div className="invite-row">
                {pass && "pin" in pass ? (
                  <>
                    <span className="invite-code mono">{pass.pin}</span>
                    <CopyButton text={pass.pin} label={t.invite.copyPin} />
                  </>
                ) : pass ? (
                  <span className="form-error small">{t.invite.pinFailed}</span>
                ) : (
                  <span className="small muted">{t.invite.pinMaking}</span>
                )}
              </div>
              {expires && <span className="small faint">{t.invite.pinOnce(expires)}</span>}
            </div>
            {!room.invite && <p className="small muted">{t.invite.unavailable}</p>}
          </div>
        </div>

        <div className="dialog-actions invite-actions">
          {room.invite && (
            <button type="button" className="button button-secondary" title={t.invite.newLinkHint} onClick={() => onAction("new_link")}>
              {t.invite.newLink}
            </button>
          )}
          <button type="button" className="button button-secondary" title={t.invite.anotherHint} onClick={invite}>
            {t.invite.another}
          </button>
          <button ref={closeRef} type="button" className="button button-primary" onClick={onClose}>
            {t.help.close}
          </button>
        </div>
      </div>
    </div>
  );
}
