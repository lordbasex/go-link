// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { deviceErrorText } from "../components/device/RoomControls";
import { t } from "../i18n";
import { DEMO_ROMS, DEMO_ROOM_ID } from "../fixtures";
import { useSignal } from "../signal/SignalProvider";
import { romCheckText } from "../components/romCheck";
import { romPlayable, type DeviceRom } from "@go-link/shared";
import { GamePicker } from "../components/GamePicker";
import { GamepadIcon, LockIcon } from "../components/Icons";
import { Chip, HeroTile, PageHero } from "../components/ui/PageHero";
import { useThumbKind, useThumbnail } from "../components/device/useThumbnail";

interface RomOption {
  id: string;
  game: string;
  detail: string;
  /** The device's check says the core can run it (or it is unchecked). */
  playable: boolean;
  /** Why it will not run, or a warning. */
  note: string;
  /** The device's ROM, for its Boxart (absent in demo mode). */
  rom?: DeviceRom;
}

export function CreateRoomPage() {
  const { hostLink, demo, linkedDevice, sendToDevice, onDeviceMessage } =
    useSignal();
  const navigate = useNavigate();
  const library = linkedDevice.status?.library;
  // The ROM library comes from the linked device over WebRTC.
  const all: RomOption[] = demo
    ? DEMO_ROMS.map((r) => ({
        id: r.id,
        game: r.game,
        detail: t.create.players(r.minPlayers, r.maxPlayers),
        playable: true,
        note: "",
      }))
    : (library?.roms ?? []).map((r) => ({
        rom: r,
        id: r.name,
        game: r.title || r.name,
        detail:
          [r.year, r.maker].filter(Boolean).join(" · ") || `${r.name}.zip`,
        playable: romPlayable(r),
        note: romCheckText(r.check),
      }));
  // Only sets the device's check accepts can be chosen; the rest are
  // listed apart with the reason, so the host knows what to fix.
  const roms = all.filter((r) => r.playable);
  const unplayable = all.filter((r) => !r.playable);
  // "Play" in My device › ROMs opens this page with ?rom=<set>.
  const [params] = useSearchParams();
  const [romId, setRomId] = useState(
    demo ? DEMO_ROMS[0]!.id : (params.get("rom") ?? ""),
  );
  const [name, setName] = useState(demo ? "Turtles co-op" : "");
  const [nameEdited, setNameEdited] = useState(false);
  const [voice, setVoice] = useState(true);
  const [chat, setChat] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const selected = roms.find((r) => r.id === romId) ?? roms[0];
  useEffect(() => {
    if (!romId && roms[0]) setRomId(roms[0].id);
  }, [romId, roms]);
  // Until the host types a name, the room is named after the game.
  const roomName = nameEdited ? name : (selected?.game ?? "");

  useEffect(() => {
    if (demo) return;
    return onDeviceMessage((msg) => {
      const m = msg as {
        type?: string;
        room_id?: string;
        error?: string;
        code?: string;
        limit?: number;
      };
      if (m.type === "room_created" && m.room_id) {
        setCreating(false);
        navigate(`/r/${m.room_id}`);
      } else if (m.type === "room_error") {
        setCreating(false);
        setError(m.code ? deviceErrorText(m) : m.error || t.create.failed);
      }
    });
  }, [demo, onDeviceMessage, navigate]);

  const linked = demo || hostLink !== null;
  const coreReady = demo || library?.core.installed === true;
  const canCreate =
    linked && coreReady && !!selected && roomName.trim() !== "" && !creating;
  const roomId = demo ? DEMO_ROOM_ID : "";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canCreate || !selected) return;
    if (demo) {
      navigate(`/r/${roomId}`);
      return;
    }
    setError("");
    setCreating(true);
    sendToDevice({
      type: "create_room",
      rom: selected.id,
      title: roomName.trim(),
      public: false,
      voice,
      chat,
    });
  };

  const ready = all.length;
  return (
    <div className="page">
      <div className="page-body dash-page create-page">
        <PageHero
          tile={
            <HeroTile status={linked ? "live" : "idle"}>
              <GamepadIcon size={34} />
            </HeroTile>
          }
          eyebrow={t.create.eyebrow}
          title={t.create.title}
          subtitle={t.create.subtitle}
          chips={
            linked && !demo && library ? (
              <>
                <Chip tone="live" dot>
                  {t.create.libraryChip(ready)}
                </Chip>
                <Chip>{t.create.playableChip(roms.length)}</Chip>
              </>
            ) : undefined
          }
          actions={
            <Link to="/rooms" className="button button-secondary">
              {t.create.cancel}
            </Link>
          }
        />

        {!linked && (
          <div className="help-box">
            <strong>{t.create.needDevice}</strong>
            <p className="muted">{t.create.needDeviceText}</p>
            <Link to="/device" className="button button-primary button-small">
              {t.lobby.linkDevice}
            </Link>
          </div>
        )}

        {linked && !demo && library && !library.core.installed && (
          <div className="help-box">
            <strong>{t.create.coreMissing}</strong>
            <p className="muted">{t.create.coreMissingText}</p>
            <button
              type="button"
              className="button button-primary button-small"
              disabled={library.core.downloading}
              onClick={() => sendToDevice({ type: "download_core" })}
            >
              {library.core.downloading
                ? t.create.coreDownloading
                : t.create.coreDownload}
            </button>
            {library.core.error && (
              <p className="form-error">{library.core.error}</p>
            )}
          </div>
        )}

        {linked &&
          !demo &&
          library &&
          library.core.installed &&
          !library.core.catalog && (
            <div className="help-box">
              <strong>{t.create.catalogMissing}</strong>
              <p className="muted">{t.create.catalogMissingText}</p>
              <button
                type="button"
                className="button button-secondary button-small"
                disabled={library.core.downloading}
                onClick={() => sendToDevice({ type: "download_core" })}
              >
                {library.core.downloading
                  ? t.create.coreDownloading
                  : t.create.catalogDownload}
              </button>
              {library.core.error && (
                <p className="form-error">{library.core.error}</p>
              )}
            </div>
          )}

        <form className="create-grid" onSubmit={submit} noValidate>
          <div className="stack-md create-main">
            <section className="card dash-card stack-md">
              <div className="dash-card-head">
                <h2 className="card-title">{t.create.game}</h2>
                {unplayable.length > 0 && (
                  <span className="small faint">
                    {t.create.unplayableTitle(unplayable.length)}
                  </span>
                )}
              </div>
              {roms.length === 0 && linked ? (
                <p className="muted small-plus">
                  {t.create.libraryEmpty}{" "}
                  <Link to="/device/roms">{t.create.libraryEmptyLink}</Link>
                </p>
              ) : (
                <GamePicker
                  options={roms}
                  value={selected?.id ?? ""}
                  onChange={setRomId}
                  label={t.create.game}
                />
              )}
              {unplayable.length > 0 && (
                <details className="unplayable">
                  <summary className="small-plus muted">
                    {t.create.unplayableShow}
                  </summary>
                  <ul className="unplayable-list">
                    {unplayable.map((r) => (
                      <li key={r.id} className="small">
                        <span className="strong">{r.game}</span>{" "}
                        <span className="mono faint">{r.id}.zip</span>
                        <span className="option-note">{r.note}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>

            <section className="card dash-card stack-md">
              <h2 className="card-title">{t.create.options}</h2>
              <div className="stack-sm">
                <label htmlFor="roomname" className="field-label">
                  {t.create.roomName}
                </label>
                <input
                  id="roomname"
                  className="input"
                  type="text"
                  maxLength={60}
                  value={roomName}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameEdited(true);
                  }}
                />
              </div>

              <p className="small muted create-private">
                <LockIcon size={13} /> {t.create.privateNote}
              </p>

              <div className="switch-row">
                <div className="stack-xxs">
                  <span className="strong">{t.create.voice}</span>
                  <span className="small muted">{t.create.voiceDesc}</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={voice}
                  aria-label={t.create.voice}
                  className={`switch${voice ? " is-on" : ""}`}
                  onClick={() => setVoice(!voice)}
                >
                  <span className="switch-knob" />
                </button>
              </div>
              <div className="switch-row">
                <div className="stack-xxs">
                  <span className="strong">{t.create.chat}</span>
                  <span className="small muted">{t.create.chatDesc}</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={chat}
                  aria-label={t.create.chat}
                  className={`switch${chat ? " is-on" : ""}`}
                  onClick={() => setChat(!chat)}
                >
                  <span className="switch-knob" />
                </button>
              </div>
            </section>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>

          <aside className="card dash-card create-preview stack-md">
            <GamePreview option={selected} />
            <div className="dash-chips">
              <Chip>{t.create.privateChip}</Chip>
              <Chip>{voice ? t.create.voiceOn : t.create.voiceOff}</Chip>
            </div>
            <ul className="create-rules">
              {t.create.rules.map((rule) => (
                <li key={rule} className="small muted">
                  {rule}
                </li>
              ))}
            </ul>
            <button
              type="submit"
              className="button button-primary button-large button-block"
              disabled={!canCreate}
            >
              {creating ? t.create.creating : t.create.submit}
            </button>
          </aside>
        </form>
      </div>
    </div>
  );
}

/** The chosen game, big: its Boxart (the host's own), title and details. */
function GamePreview({ option }: { option: RomOption | undefined }) {
  const kind = useThumbKind();
  const art = useThumbnail(
    option?.rom?.name ?? "",
    kind,
    "card",
    !!option?.rom?.thumbs[kind],
  );
  if (!option) return <p className="muted small-plus">{t.create.pickGame}</p>;
  return (
    <div className="create-preview-game stack-sm">
      <div className={`create-preview-art${art ? " has-art" : ""}`}>
        {art ? <img src={art} alt="" /> : <span>{option.game.toUpperCase()}</span>}
      </div>
      <div className="stack-xxs">
        <span className="create-preview-title">{option.game}</span>
        <span className="small muted">{option.detail}</span>
        <span className="small faint mono">{option.id}.zip</span>
      </div>
    </div>
  );
}
