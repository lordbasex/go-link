// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { deviceErrorText } from "../components/device/RoomControls";
import { t } from "../i18n";
import { DEMO_ROMS, DEMO_ROOM_ID } from "../fixtures";
import { useSignal } from "../signal/SignalProvider";
import { romCheckText } from "../components/romCheck";
import { romFile, romPlayable, type DeviceRom } from "@go-link/shared";
import { GamePicker } from "../components/GamePicker";
import { GamepadIcon, LockIcon } from "../components/Icons";
import { Chip, HeroTile, PageHero } from "../components/ui/PageHero";
import { useThumbKind, useThumbnail } from "../components/device/useThumbnail";
import { OwnBadge, ownControlsText } from "../components/device/OwnBadge";
import { useRomPages, useRomsByName } from "../components/device/useLibrary";

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
  const summary = library?.summary;
  // The ROM library stays on the linked device: the picker asks it for
  // the playable sets that match what is typed, a page at a time.
  const [pickerQuery, setPickerQuery] = useState("");
  const playablePages = useRomPages({ q: pickerQuery, filter: "playable" }, { enabled: !demo && !!library });
  const [showUnplayable, setShowUnplayable] = useState(false);
  const unplayablePages = useRomPages({ filter: "unplayable" }, { page: 50, enabled: !demo && showUnplayable });
  const roms: RomOption[] = demo
    ? DEMO_ROMS.map((r) => ({
        id: r.id,
        game: r.game,
        detail: t.create.players(r.minPlayers, r.maxPlayers),
        playable: true,
        note: "",
      }))
    : (playablePages.roms ?? []).map(toOption);
  const unplayable = (unplayablePages.roms ?? []).map(toOption);
  const playableCount = demo ? roms.length : (summary?.playable ?? 0);
  const unplayableCount = demo ? 0 : (summary?.total ?? 0) - playableCount;
  // "Play" in My device › ROMs opens this page with ?rom=<set>.
  const [params] = useSearchParams();
  const [romId, setRomId] = useState(
    demo ? DEMO_ROMS[0]!.id : (params.get("rom") ?? ""),
  );
  const [name, setName] = useState(demo ? "Laundry co-op" : "");
  const [nameEdited, setNameEdited] = useState(false);
  const [voice, setVoice] = useState(true);
  const [chat, setChat] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // The chosen set may be on no page loaded (a link from My device › ROMs).
  const chosen = useRomsByName(demo || !romId ? [] : [romId]).get(romId);
  const selected = demo ? (roms.find((r) => r.id === romId) ?? roms[0]) : chosen && romPlayable(chosen) ? toOption(chosen) : undefined;
  const firstId = !pickerQuery ? roms[0]?.id : undefined;
  useEffect(() => {
    if (!romId && firstId) setRomId(firstId);
  }, [romId, firstId]);
  // A set that is not in the folder (null) or cannot run: the first one instead.
  useEffect(() => {
    if (!demo && romId && chosen !== undefined && (chosen === null || !romPlayable(chosen))) setRomId("");
  }, [demo, romId, chosen]);
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
  // a go-link HD package needs go-link HD's core, every other game the MAME core
  const coreReady = demo || (selected?.rom?.kind === "glhd" ? library?.core.hdInstalled === true : library?.core.installed === true);
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

  const ready = demo ? roms.length : (summary?.total ?? 0);
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
                <Chip>{t.create.playableChip(playableCount)}</Chip>
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
                {unplayableCount > 0 && (
                  <span className="small faint">
                    {t.create.unplayableTitle(unplayableCount)}
                  </span>
                )}
              </div>
              {playableCount === 0 && linked ? (
                <p className="muted small-plus">
                  {t.create.libraryEmpty}{" "}
                  <Link to="/device/roms">{t.create.libraryEmptyLink}</Link>
                </p>
              ) : (
                <GamePicker
                  options={roms}
                  value={selected?.id ?? ""}
                  selectedOption={selected}
                  onChange={setRomId}
                  label={t.create.game}
                  remote={
                    demo
                      ? undefined
                      : {
                          total: playablePages.total,
                          loading: playablePages.roms === null,
                          onQuery: setPickerQuery,
                          onMore: playablePages.more ? playablePages.loadMore : undefined,
                        }
                  }
                />
              )}
              {unplayableCount > 0 && (
                <details className="unplayable" onToggle={(e) => setShowUnplayable(e.currentTarget.open)}>
                  <summary className="small-plus muted">
                    {t.create.unplayableShow}
                  </summary>
                  <ul className="unplayable-list">
                    {unplayable.map((r) => (
                      <li key={r.id} className="small">
                        <span className="strong">{r.game}</span>{" "}
                        <span className="mono faint">{r.rom ? romFile(r.rom) : `${r.id}.zip`}</span>
                        <span className="option-note">{r.note}</span>
                      </li>
                    ))}
                  </ul>
                  {unplayablePages.more && (
                    <button type="button" className="button button-secondary button-small" onClick={unplayablePages.loadMore}>
                      {t.common.showMore}
                    </button>
                  )}
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

function toOption(r: DeviceRom): RomOption {
  return {
    rom: r,
    id: r.name,
    game: r.title || r.name,
    detail: [r.year, r.maker, ownControlsText(r)].filter(Boolean).join(" · ") || romFile(r),
    playable: romPlayable(r),
    note: romCheckText(r.check),
  };
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
        <span className="create-preview-title">
          {option.game}
          {option.rom?.own && <OwnBadge />}
        </span>
        <span className="small muted">{option.detail}</span>
        <span className="small faint mono">{option.rom ? romFile(option.rom) : `${option.id}.zip`}</span>
      </div>
    </div>
  );
}
