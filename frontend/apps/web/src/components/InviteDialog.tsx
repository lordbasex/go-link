// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  formatCode,
  groupInvitationUrl,
  parseGroupResult,
  parseInvitePass,
  type GroupInvite,
  type InvitePass,
} from "@go-link/shared";
import { t } from "../i18n";
import { useSignal } from "../signal/SignalProvider";
import { invitationUrl } from "../role";
import { CopyButton } from "./CopyButton";
import { QrCode } from "./QrCode";

type Mode = "one" | "group";
const MODE_KEY = "go-link.invite-mode";
const USES = [2, 5, 10, 20, 50];
const HOURS = [1, 6, 24];

function readMode(): Mode {
  try {
    return window.localStorage.getItem(MODE_KEY) === "group" ? "group" : "one";
  } catch {
    return "one";
  }
}

/**
 * The owner's way to invite people, in two modes:
 *
 * - One person: the room's link with its QR code, or the 9 digit code, and
 *   a PIN made for this invitation. The PIN lets in only the first browser
 *   that uses it, so every opening (and "Invite someone else") asks the
 *   device for a new one.
 * - A group: one link and QR code for several people (its key after #,
 *   never sent to a server), up to a number of people and a time, each one
 *   let in by the host when "Ask me first" is on (the default).
 *
 * "New link" replaces the room's link and code for everyone.
 */
export function InviteDialog({
  room,
  fallbackUrl,
  onAction,
  onClose,
}: {
  room: { id: string; name: string; invite: string; inviteCode: string; groupInvite?: GroupInvite };
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
  const { sendToDevice, onDeviceMessage, panel } = useSignal();
  const link = room.invite ? invitationUrl(room.invite, panel) : fallbackUrl;
  const [pass, setPass] = useState<InvitePass | null>(null);
  const [mode, setModeState] = useState<Mode>(readMode);
  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(MODE_KEY, m);
    } catch {
      // storage blocked: the choice lasts for this dialog
    }
  };
  const [uses, setUses] = useState(10);
  const [hours, setHours] = useState(6);
  const [approval, setApproval] = useState(true);
  const [groupError, setGroupError] = useState("");
  // The device answers at once; device_status follows a moment later.
  const [fresh, setFresh] = useState<GroupInvite | null>(null);
  const group = room.groupInvite ?? (fresh && new Date(fresh.expiresAt) > new Date() ? fresh : undefined);
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
        const g = parseGroupResult(msg);
        if (g && g.id === room.id && g.type !== "knock_answer") {
          setGroupError(g.ok ? "" : g.error || t.invite.groupFailed);
          setFresh(g.type === "invite_group" && g.ok ? (g.group ?? null) : null);
        }
      }),
    [onDeviceMessage, room.id],
  );
  const makeGroup = () => {
    setGroupError("");
    send.current({ type: "invite_group", id: room.id, uses, hours, approval });
  };
  const endGroup = () => send.current({ type: "end_group", id: room.id });
  const groupLink = group ? groupInvitationUrl(link, group.key) : "";
  const groupExpires = group?.expiresAt
    ? new Date(group.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";
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
        <div className="dash-segmented invite-modes" role="group" aria-label={t.invite.modes}>
          {(["one", "group"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} className={mode === m ? "is-on" : ""} onClick={() => setMode(m)}>
              {m === "one" ? t.invite.modeOne : t.invite.modeGroup}
            </button>
          ))}
        </div>
        <p className="muted small-plus">{mode === "one" ? t.invite.introOne : t.invite.introGroup}</p>

        {mode === "one" ? (
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
        ) : (
          <div className="invite-grid">
            <div className="invite-qr">
              {group ? (
                <>
                  <QrCode text={groupLink} label={t.invite.qrLabel} />
                  <span className="small faint">{t.invite.groupQrHint}</span>
                </>
              ) : (
                <span className="invite-qr-empty small muted">{t.invite.groupNone}</span>
              )}
            </div>
            <div className="stack-md invite-fields">
              {group ? (
                <>
                  <div className="stack-xxs">
                    <span className="field-label">{t.invite.link}</span>
                    <div className="invite-row">
                      <span className="invite-url mono" data-link={groupLink}>
                        {groupLink.replace(/^https?:\/\//, "").replace(/#k=.*/, "#k=…")}
                      </span>
                      <CopyButton text={groupLink} label={t.invite.copyLink} />
                    </div>
                  </div>
                  <ul className="invite-group-facts small">
                    <li>{t.invite.groupUsed(group.used, group.uses)}</li>
                    <li>{t.invite.groupUntil(groupExpires)}</li>
                    <li>{group.approval ? t.invite.groupAsks : t.invite.groupOpen}</li>
                  </ul>
                </>
              ) : (
                <>
                  <label className="stack-xxs">
                    <span className="field-label">{t.invite.groupUses}</span>
                    <select className="input input-small" value={uses} onChange={(e) => setUses(Number(e.target.value))}>
                      {USES.map((n) => (
                        <option key={n} value={n}>
                          {t.invite.people(n)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="stack-xxs">
                    <span className="field-label">{t.invite.groupHours}</span>
                    <select className="input input-small" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                      {HOURS.map((n) => (
                        <option key={n} value={n}>
                          {t.invite.hours(n)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="invite-check small-plus">
                    <input type="checkbox" checked={approval} onChange={(e) => setApproval(e.target.checked)} />
                    <span>
                      {t.invite.groupApproval}
                      <span className="small faint block">{t.invite.groupApprovalHint}</span>
                    </span>
                  </label>
                </>
              )}
              {groupError && <p className="form-error small">{groupError}</p>}
              {!room.invite && <p className="small muted">{t.invite.unavailable}</p>}
            </div>
          </div>
        )}

        <div className="dialog-actions invite-actions">
          {room.invite && (
            <button type="button" className="button button-secondary" title={t.invite.newLinkHint} onClick={() => onAction("new_link")}>
              {t.invite.newLink}
            </button>
          )}
          {mode === "one" ? (
            <button type="button" className="button button-secondary" title={t.invite.anotherHint} onClick={invite}>
              {t.invite.another}
            </button>
          ) : group ? (
            <button type="button" className="button button-secondary" title={t.invite.groupEndHint} onClick={endGroup}>
              {t.invite.groupEnd}
            </button>
          ) : (
            <button type="button" className="button button-primary" onClick={makeGroup} disabled={!room.invite}>
              {t.invite.groupMake}
            </button>
          )}
          <button ref={closeRef} type="button" className="button button-primary" onClick={onClose}>
            {t.help.close}
          </button>
        </div>
      </div>
    </div>
  );
}
