// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  DEFAULT_CONTROLS,
  bindingOf,
  isTouchDevice,
  padMapFor,
  parseInvite,
  recordStart,
  recordStop,
  startButtonCount,
  startOf,
  type TypingView,
} from "@go-link/shared";
import { playDing } from "../components/ding";
import { t } from "../i18n";
import { DEMO_DEVICE_NAME } from "../fixtures";
import { useSignal } from "../signal/SignalProvider";
import { useJoinRoom, usePublicRoomMeta } from "../signal/useJoinRoom";
import { useHostStream } from "../signal/useHostStream";
import { forgetRoomPass, roomPass, saveRoomPass } from "../signal/roomPasses";
import { ServerHelp } from "../components/ServerSettings";
import {
  ChevronLeftIcon,
  ControllerIcon,
  ExitFullscreenIcon,
  FullscreenIcon,
  HelpIcon,
  GamepadIcon,
  LockIcon,
  MicIcon,
  MicOffIcon,
  PauseIcon,
  PlayIcon,
  SendIcon,
  SoundOffIcon,
  SoundOnIcon,
  SwapIcon,
  BellIcon,
  BellOffIcon,
  ChatIcon,
  PanelCloseIcon,
  UserPlusIcon,
  PowerIcon,
  CameraIcon,
  RecordIcon,
  StopIcon,
  LogOutIcon,
  SlidersIcon,
  CloseIcon,
} from "../components/Icons";
import { Chip, HeroTile, PageHero } from "../components/ui/PageHero";
import { portStyle } from "../components/Seats";
import { ControlsPanel } from "../components/ControlsPanel";
import {
  ConfirmDialog,
  RemapDialog,
  type RemapTarget,
} from "../components/RemapDialog";
import { useInputConfig } from "../signal/useInputConfig";
import { TouchPad } from "../components/TouchPad";
import { InviteDialog } from "../components/InviteDialog";
import { StreamInfo } from "../components/StreamInfo";
import { PlayersCapsule, type SeatSwap } from "../components/PlayersCapsule";
import { TermsCheck } from "../components/legal/TermsCheck";
import { acceptTerms, termsAccepted } from "../legal";
import { HelpDialog } from "../components/HelpDialog";
import { saveScreenshot } from "../components/screenshot";
import { useFullscreen } from "../components/useFullscreen";
import {
  demoModel,
  liveModel,
  type RoomModel, localName } from "./roomModel";
import {
  useAudioLevels,
  useMicrophone,
  type MicState,
} from "../signal/useVoice";

const CONTROLS_KEY = "go-link.show-controls";
const TOUCH_KEY = "go-link.touchpad";
const CHAT_HIDDEN_KEY = "go-link.chat-hidden";
const CHAT_SOUND_KEY = "go-link.chat-sound";
/** How long the controls over the video stay without a movement or tap. */
const IDLE_MS = 3000;

/** play() as a promise, also where it returns nothing (old browsers, tests). */
function tryPlay(media: HTMLMediaElement): Promise<void> {
  return Promise.resolve().then(() => media.play());
}
const KEYBOARD_PLAYER_KEY = "go-link.keyboard-player";
const NAME_KEY = "go-link.player-name";
const GAME_VOLUME_KEY = "go-link.game-volume";
const VOICE_VOLUME_KEY = "go-link.voice-volume";

function readVolume(key: string, fallback: number): number {
  const n = Number(readStorage(key));
  return readStorage(key) !== null && Number.isFinite(n) && n >= 0 && n <= 100
    ? n
    : fallback;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage disabled: the choice lasts for this page only
  }
}

function readKeyboardPlayer(): number {
  const n = Number(readStorage(KEYBOARD_PLAYER_KEY));
  return Number.isInteger(n) && n >= 0 && n < 4 ? n : 0;
}

type Tab = "chat" | "queue" | "spectators";


/**
 * A private room asks for its PIN before the device streams: six digits,
 * checked by the device, which limits the tries.
 */
function PinPrompt({
  busy,
  last,
  onSend,
}: {
  busy: boolean;
  last: { reason: string; left: number; retryAfter: number } | null;
  onSend: (pin: string) => void;
}) {
  const [value, setValue] = useState("");
  // A guest who came straight from a link accepts the terms here.
  const [needsTerms] = useState(() => !termsAccepted());
  const [agreed, setAgreed] = useState(false);
  const [askTerms, setAskTerms] = useState(false);
  const blocked = last?.reason === "blocked";
  const error = !last
    ? ""
    : last.reason === "wrong"
      ? t.room.pinWrong(last.left)
      : last.reason === "used"
        ? t.room.pinUsed
      : last.reason === "locked"
        ? t.room.pinLocked(Math.ceil(last.retryAfter / 60))
        : t.room.pinBlocked;
  return (
    <form
      className="pin-prompt card stack-md"
      onSubmit={(e) => {
        e.preventDefault();
        if (needsTerms && !agreed) {
          setAskTerms(true);
          return;
        }
        if (value.length === 6 && !busy && !blocked) {
          if (needsTerms) acceptTerms();
          onSend(value);
          setValue("");
        }
      }}
    >
      <span className="pin-prompt-icon" aria-hidden="true">
        <LockIcon size={26} />
      </span>
      <div className="stack-xxs">
        <h2 className="card-title">{t.room.pinTitle}</h2>
        <p className="small muted">{t.room.pinText}</p>
      </div>
      <label className="visually-hidden" htmlFor="room-pin">
        {t.room.pinLabel}
      </label>
      <input
        id="room-pin"
        className="input input-mono pin-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        autoFocus
        disabled={blocked}
        placeholder="••••••"
        aria-invalid={error ? true : undefined}
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
      />
      {error && (
        <p className="form-error small" role="alert">
          {error}
        </p>
      )}
      {needsTerms && <TermsCheck guest checked={agreed} onChange={setAgreed} showError={askTerms} />}
      <button
        type="submit"
        className="button button-primary button-block"
        disabled={value.length !== 6 || busy || blocked}
      >
        {busy ? t.room.pinChecking : t.room.pinEnter}
      </button>
    </form>
  );
}

/**
 * One start button of the arcade panel (1P, 2P...). It stays down while
 * held with the mouse or a finger; from the keyboard, a click is a short
 * press.
 */
function StartButton({
  port,
  mine,
  onHold,
}: {
  port: number;
  mine: boolean;
  onHold: (held: boolean) => void;
}) {
  const [down, setDown] = useState(false);
  const hold = (held: boolean) => {
    setDown(held);
    onHold(held);
  };
  return (
    <button
      type="button"
      className={`start-button${mine ? " is-mine" : ""}${down ? " is-on" : ""}`}
      aria-label={t.touch.startLabel(port)}
      title={t.touch.startLabel(port)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        hold(true);
      }}
      onPointerUp={() => hold(false)}
      onPointerCancel={() => hold(false)}
      onLostPointerCapture={() => down && hold(false)}
      onClick={(e) => {
        if (e.detail !== 0) return; // mouse and touch use the pointer events
        hold(true);
        setTimeout(() => hold(false), 150);
      }}
    >
      {t.touch.startPlayer(port)}
    </button>
  );
}

function VolumeSlider({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="volume">
      <span className="small muted">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        disabled={disabled}
        aria-label={t.room.volumeLabel(label)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

interface VolumeProps {
  game: number;
  voice: number;
  onGame: (v: number) => void;
  onVoice: (v: number) => void;
}

/**
 * The voice in the video's dock: the microphone (seated players), a small
 * level meter and a settings popover with the game and voice volumes and
 * what the voice rules are.
 */
function VoiceControl({
  model,
  micOn,
  toggleMic,
  micLevel = 0.6,
  micState = "on",
  volumes,
}: {
  model: RoomModel;
  micOn: boolean;
  toggleMic: () => void;
  micLevel?: number;
  micState?: MicState;
  volumes?: VolumeProps;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => (e.key === "Escape" || e.code === "Escape") && setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  const player = model.voice === "player";
  const label = micOn ? t.room.micOpen : t.room.micClosed;
  const lit = Math.round(micLevel * 5);
  const title = player
    ? `${t.room.voiceTitle} · ${label}`
    : model.voice === "off"
      ? t.room.voiceOffTitle
      : model.voice === "pending"
        ? t.room.voicePendingTitle
        : t.room.spectatorVoiceTitle;
  const note = player
    ? micState === "denied"
      ? t.room.micDenied
      : micState === "starting"
        ? t.room.micStarting
        : model.hearVoice
          ? t.room.voicePlayersHeard
          : t.room.voicePlayersOnly
    : model.voice === "off"
      ? t.room.voiceOffNote
      : model.voice === "pending"
        ? t.room.voicePendingNote
        : model.hearVoice
          ? t.room.spectatorHearsNote
          : t.room.spectatorVoiceNote;
  return (
    <div className="dock-group voice-control" ref={rootRef}>
      {player ? (
        <button
          type="button"
          className={`icon-button mic-toggle${micOn ? " is-on" : ""}`}
          aria-pressed={micOn}
          aria-label={label}
          data-tip={label}
          onClick={toggleMic}
        >
          {micOn ? <MicIcon size={17} /> : <MicOffIcon size={17} />}
        </button>
      ) : (
        <button
          type="button"
          className="icon-button mic-toggle is-locked"
          disabled
          aria-label={t.room.micUnavailable}
        >
          <LockIcon size={15} />
        </button>
      )}
      {player && (
        <span className="mini-meter" role="img" aria-label={t.room.micLevel}>
          {Array.from({ length: 5 }, (_, i) => (
            <i key={i} className={micOn && i < lit ? "is-lit" : ""} />
          ))}
        </span>
      )}
      <button
        type="button"
        className={`icon-button voice-settings${open ? " is-on" : ""}`}
        aria-expanded={open}
        aria-label={t.room.voiceSettings}
        data-tip={open ? undefined : t.room.voiceSettings}
        onClick={() => setOpen(!open)}
      >
        <SlidersIcon />
      </button>
      {open && (
        <div className="voice-pop" role="dialog" aria-label={t.room.voiceTitle}>
          <span className="strong">{title}</span>
          <span className="small muted">{note}</span>
          {volumes && (
            <div className="stack-sm">
              <VolumeSlider
                label={t.room.gameVolume}
                value={volumes.game}
                onChange={volumes.onGame}
              />
              <VolumeSlider
                label={t.room.voiceVolume}
                value={volumes.voice}
                onChange={volumes.onVoice}
                disabled={model.voice !== "player" && !model.hearVoice}
              />
            </div>
          )}
          {player && (
            <span className="small faint">
              {t.room.holdToTalk} <kbd>V</kbd> {t.room.holdToTalkSuffix}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface SideActions {
  onChat?: (text: string) => void;
  /** Tells the room you are typing (true, repeated) or stopped. */
  onTyping?: (on: boolean) => void;
  /** Others typing right now. */
  typing?: TypingView[];
  /** The chime for new messages. */
  sound?: boolean;
  onSound?: (on: boolean) => void;
  /** Folds the side panel away. */
  onHide?: () => void;
  /** The host turned the room's chat off: only system notices show. */
  chatOff?: boolean;
  /** The owner turns the room's chat on or off for everyone. */
  onChatSwitch?: (on: boolean) => void;
  onSpectate?: () => void;
  onQueue?: () => void;
  chatEnabled: boolean;
  name: string;
  onName?: (name: string) => void;
}

function SideStatus({
  model,
  actions,
}: {
  model: RoomModel;
  actions: SideActions;
}) {
  const { me } = model;
  if (me.kind === "unknown") return null;
  if (me.kind === "player") {
    const first = me.ports[0] ?? 1;
    return (
      <div className="side-status-row spread">
        <div className="side-status-row">
          <span
            className="port-badge port-badge-small"
            style={portStyle(first)}
          >
            {me.ports.map((p) => `P${p}`).join("+")}
          </span>
          <div className="stack-xxs">
            <span className="strong">{t.room.playing}</span>
            <span className="small-plus muted">
              {t.room.waitingForSeat(model.queue.length)}
            </span>
          </div>
        </div>
        {actions.onSpectate && (
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={actions.onSpectate}
          >
            {t.room.giveUpSeat}
          </button>
        )}
      </div>
    );
  }
  if (me.kind === "queue") {
    return (
      <div className="side-status-row spread">
        <div className="side-status-row">
          <span className="port-badge port-badge-small is-outline">
            {t.ordinal(me.position)}
          </span>
          <div className="stack-xxs">
            <span className="strong">
              {me.position === 1
                ? t.room.nextInQueue
                : t.room.inQueue(t.ordinal(me.position))}
            </span>
            <span className="small-plus muted">{t.room.nextInQueueNote}</span>
          </div>
        </div>
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={actions.onSpectate}
        >
          {t.room.leaveQueue}
        </button>
      </div>
    );
  }
  return (
    <div className="side-status-row spread">
      <div className="side-status-row">
        <span className="port-badge port-badge-small is-outline">
          <GamepadIcon size={16} />
        </span>
        <div className="stack-xxs">
          <span className="strong">{t.room.watching}</span>
          <span className="small-plus muted">{t.room.watchingNote}</span>
        </div>
      </div>
      <button
        type="button"
        className="button button-primary button-small"
        onClick={actions.onQueue}
      >
        {t.room.joinQueue}
      </button>
    </div>
  );
}

function NameForm({
  name,
  onName,
}: {
  name: string;
  onName: (name: string) => void;
}) {
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onName(value.trim().slice(0, 24));
  };
  return (
    <form className="name-form" onSubmit={submit}>
      <label htmlFor="playername" className="small muted">
        {t.room.yourName}
      </label>
      <input
        id="playername"
        className="input input-dark input-small"
        maxLength={24}
        value={value}
        placeholder={t.room.namePlaceholder}
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        type="submit"
        className="button button-secondary button-small"
        disabled={value.trim() === name}
      >
        {t.room.saveName}
      </button>
    </form>
  );
}

function SidePanel({
  model,
  actions,
}: {
  model: RoomModel;
  actions: SideActions;
}) {
  const [tab, setTab] = useState<Tab>("chat");
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const typingSent = useRef(0); // when "typing" last went out (0 = stopped)
  const typing = actions.typing ?? [];
  useEffect(() => {
    const el = listRef.current;
    if (el && tab === "chat") el.scrollTop = el.scrollHeight;
  }, [model.chat.length, typing.length, tab]);
  // Stop "typing" when the panel goes away mid-message.
  const onTypingRef = useRef(actions.onTyping);
  onTypingRef.current = actions.onTyping;
  useEffect(
    () => () => {
      if (typingSent.current) onTypingRef.current?.(false);
    },
    [],
  );
  const noteTyping = (text: string) => {
    const now = Date.now();
    if (text.trim() && now - typingSent.current > 2500) {
      typingSent.current = now;
      actions.onTyping?.(true);
    } else if (!text.trim() && typingSent.current) {
      typingSent.current = 0;
      actions.onTyping?.(false);
    }
  };
  const tabs: { id: Tab; count: number | null }[] = [
    { id: "chat", count: null },
    { id: "queue", count: model.queue.length },
    { id: "spectators", count: model.spectators.length },
  ];
  const send = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !actions.onChat) return;
    actions.onChat(text);
    setDraft("");
    typingSent.current = 0; // the device clears "typing" with the message
  };
  return (
    <aside className="room-side">
      {(model.me.kind !== "unknown" || actions.onName) && (
        <div className="side-status stack-sm">
          <SideStatus model={model} actions={actions} />
          {actions.onName && (
            <NameForm name={actions.name} onName={actions.onName} />
          )}
        </div>
      )}

      <div className="tabs">
        {/* The tools sit beside the tab list, not inside it: a tablist holds only tabs. */}
        <div role="tablist" aria-label={t.room.tabsLabel} className="tab-list">
        {tabs.map(({ id, count }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls="room-tabpanel"
            className={`tab${tab === id ? " is-on" : ""}`}
            onClick={() => setTab(id)}
          >
            {t.room.tabs[id]}
            {count !== null && count > 0 && (
              <span className="tab-count">{count}</span>
            )}
          </button>
        ))}
        </div>
        <span className="side-tools">
          {actions.onChatSwitch && (
            <button
              type="button"
              className={`icon-button icon-button-small${actions.chatOff ? " is-warning" : ""}`}
              aria-pressed={!actions.chatOff}
              aria-label={actions.chatOff ? t.room.chatTurnOn : t.room.chatTurnOff}
              title={actions.chatOff ? t.room.chatTurnOn : t.room.chatTurnOff}
              onClick={() => actions.onChatSwitch?.(!!actions.chatOff)}
            >
              <ChatIcon size={15} />
            </button>
          )}
          {actions.onSound && (
            <button
              type="button"
              className="icon-button icon-button-small"
              aria-pressed={actions.sound}
              aria-label={actions.sound ? t.room.chatSoundOff : t.room.chatSoundOn}
              title={actions.sound ? t.room.chatSoundOff : t.room.chatSoundOn}
              onClick={() => actions.onSound?.(!actions.sound)}
            >
              {actions.sound ? <BellIcon /> : <BellOffIcon />}
            </button>
          )}
          {actions.onHide && (
            <button
              type="button"
              className="icon-button icon-button-small"
              aria-label={t.room.chatHide}
              title={t.room.chatHide}
              onClick={actions.onHide}
            >
              <PanelCloseIcon />
            </button>
          )}
        </span>
      </div>

      <div
        className="tab-panel"
        role="tabpanel"
        id="room-tabpanel"
        aria-labelledby={`tab-${tab}`}
        ref={listRef}
      >
        {tab === "chat" && actions.chatOff && (
          <p className="notice small">{t.room.chatOffNote}</p>
        )}
        {tab === "chat" && model.chat.length === 0 && !actions.chatOff && (
          <p className="small-plus muted">
            {actions.chatEnabled ? t.room.chatEmpty : t.room.chatPending}
          </p>
        )}
        {tab === "chat" &&
          model.chat.map((m, i) =>
            "system" in m ? (
              <div key={i} className="chat-system">
                {m.system}
              </div>
            ) : (
              <div key={i} className={`chat-message${m.you ? " is-you" : ""}`}>
                <div className="chat-meta">
                  <span
                    className="chat-name"
                    style={m.port ? portStyle(m.port) : undefined}
                  >
                    {m.name}
                    {m.you ? t.room.youSuffix : ""}
                  </span>
                  <span className="chat-role">{m.role}</span>
                </div>
                <span className="chat-text">{m.text}</span>
              </div>
            ),
          )}
        {tab === "chat" && typing.length > 0 && (
          <div className="chat-typing" aria-live="polite">
            <span className="typing-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="small muted">
              {t.room.typing(typing.map((x) => localName(x.name)))}
            </span>
          </div>
        )}
        {tab === "queue" && (
          <>
            <p className="small-plus muted">{t.room.queueNote}</p>
            {model.queue.map((q) => (
              <div key={`${q.pos}-${q.name}`} className="queue-row">
                <span className="queue-pos">{q.pos}</span>
                <div className="stack-xxs">
                  <span className="strong">
                    {q.name}
                    {q.you ? t.room.youSuffix : ""}
                  </span>
                  <span className="small muted">{q.note}</span>
                </div>
              </div>
            ))}
          </>
        )}
        {tab === "spectators" && (
          <>
            <p className="small-plus muted">{t.room.spectatorsNote}</p>
            {model.spectators.map((s, i) => (
              <div key={`${s.name}-${i}`} className="viewer-row">
                <span className="viewer-avatar">
                  {s.name.charAt(0).toUpperCase()}
                </span>
                {s.name}
                {s.you ? t.room.youSuffix : ""}
              </div>
            ))}
          </>
        )}
      </div>

      {!actions.chatOff && (
      <form className="chat-form" onSubmit={send}>
        <label htmlFor="chatmsg" className="visually-hidden">
          {t.room.chatLabel}
        </label>
        <input
          id="chatmsg"
          className="input input-dark grow"
          type="text"
          maxLength={300}
          placeholder={t.room.chatPlaceholder}
          disabled={!actions.chatEnabled}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            noteTyping(e.target.value);
          }}
        />
        <button
          type="submit"
          className="icon-button icon-button-primary"
          aria-label={t.room.send}
          disabled={!actions.chatEnabled || draft.trim() === ""}
        >
          <SendIcon />
        </button>
      </form>
      )}
    </aside>
  );
}

/** Plays one remote voice; the volume is independent from the game. */
function VoiceAudio({
  stream,
  volume,
  muted,
}: {
  stream: MediaStream;
  volume: number;
  muted: boolean;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    a.volume = volume;
    a.muted = muted;
    if (!muted) void a.play().catch(() => undefined);
  }, [volume, muted]);
  return <audio ref={ref} autoPlay hidden />;
}

function RoomProblem({
  title,
  text,
  help,
}: {
  title: string;
  text?: string;
  help?: boolean;
}) {
  return (
    <div className="page">
      <div className="page-body centered">
        <div className="problem stack-md">
          <h1 className="page-title">{title}</h1>
          {text && <p className="muted">{text}</p>}
          {help && <ServerHelp />}
          <Link to="/rooms" className="button button-secondary">
            {t.room.backToLobby}
          </Link>
        </div>
      </div>
    </div>
  );
}

export function RoomPage() {
  // /r/<room_id>, or /g/<invite> (an invitation link or a typed code).
  const { roomId: routeRoomId = "", invite: routeInvite = "" } = useParams();
  const [params] = useSearchParams();
  const { demo, hostLink, savedLink, linkedDevice, sendToDevice } =
    useSignal();
  const location = useLocation();
  // Every room admits only its invitation: the owner's browser, linked to
  // the device, knows the invitation of its games and of the test room.
  const testRoom = demo ? undefined : linkedDevice.status?.room;
  const ownInvite = demo
    ? ""
    : (linkedDevice.status?.rooms.find(
        (r) => r.roomId === routeRoomId && r.invite,
      )?.invite ??
      (testRoom?.room_id === routeRoomId ? (testRoom.invite ?? "") : ""));
  const invite = routeInvite
    ? parseInvite(routeInvite)
    : ownInvite
      ? { invite: ownInvite }
      : null;
  // A guest: a browser with no device of its own.
  const guest = !demo && !hostLink && !savedLink;
  const inputCfg = useInputConfig();
  const [remap, setRemap] = useState<RemapTarget | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const navigate = useNavigate();
  // The gamepad's pause button needs the latest pause state.
  const pauseToggleRef = useRef<() => void>(() => undefined);
  const status = useJoinRoom(routeRoomId, invite);
  // Known from the start on /r, and once joined on /g.
  const roomId = status.kind === "joined" ? status.roomId : routeRoomId;
  const meta = usePublicRoomMeta(roomId);
  const [micOn, setMicOn] = useState(false);
  const joined = !demo && status.kind === "joined" ? status : null;
  const [keyboardPlayer, setKeyboardPlayer] = useState(readKeyboardPlayer);
  const [playerName, setPlayerName] = useState(
    () => readStorage(NAME_KEY) ?? "",
  );
  const live = useHostStream(
    joined?.hostPeerId ?? null,
    joined?.takeBacklog,
    keyboardPlayer,
    playerName,
    {
      input: inputCfg.input,
      onPauseButton: () => pauseToggleRef.current(),
      suspended: remap !== null,
    },
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(stageRef);
  const [helpOpen, setHelpOpen] = useState(false);
  // Phones and tablets get the on-screen gamepad instead of the keyboard map.
  const [touch] = useState(() => isTouchDevice());
  const [touchPad, setTouchPad] = useState(
    () => readStorage(TOUCH_KEY) !== "false",
  );
  // Sound is on by default. A browser may refuse to play sound before the
  // person touched the page (autoplay rules): then the video plays muted
  // and the first tap or key anywhere turns the sound on.
  const [soundOn, setSoundOn] = useState(true);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [showControls, setShowControls] = useState(
    () => readStorage(CONTROLS_KEY) !== "false",
  );
  const [gameVolume, setGameVolume] = useState(() =>
    readVolume(GAME_VOLUME_KEY, 80),
  );
  const [voiceVolume, setVoiceVolume] = useState(() =>
    readVolume(VOICE_VOLUME_KEY, 100),
  );
  const [silenced, setSilenced] = useState<ReadonlySet<number>>(new Set());
  const [chatHidden, setChatHidden] = useState(
    () => readStorage(CHAT_HIDDEN_KEY) === "true",
  );
  const [chatSound, setChatSound] = useState(
    () => readStorage(CHAT_SOUND_KEY) !== "false",
  );
  const [unread, setUnread] = useState(0);
  // Whether the chat is out of sight (hidden, or the closed console drawer).
  const sideHidden = useRef(chatHidden);
  // A new message from someone else: a chime, and a count while hidden.
  const seenChat = useRef(0);
  useEffect(() => {
    const fresh = live.chat.slice(seenChat.current);
    seenChat.current = live.chat.length;
    // Only new messages: the history sent on joining is older.
    const recent = Date.now() - 10_000;
    const others = fresh.filter(
      (c) =>
        c.kind === "user" && c.name !== live.room?.you.name && c.ts > recent,
    ).length;
    if (!others) return;
    if (chatSound) playDing();
    if (sideHidden.current) setUnread((n) => n + others);
  }, [live.chat, live.room?.you.name, chatSound]);
  const [ptt, setPtt] = useState(false);

  // Voice: only seated players talk (the device enforces it too).
  const seated = !demo && (live.room?.you.ports.length ?? 0) > 0;
  const talking = seated && (micOn || ptt);
  const mic = useMicrophone(seated && (micOn || ptt), talking);
  const micTrack = mic.stream?.getAudioTracks()[0] ?? null;
  useEffect(() => {
    live.setMicTrack(seated ? micTrack : null);
    // setMicTrack is a stable wrapper around the current stream
  }, [seated, micTrack, live.media]);

  // P pauses or resumes the game for everyone (seated players, games only).
  const pausable = seated && live.room?.pausable === true;
  const paused = live.room?.paused === true;
  const { setPaused } = live;
  // Pausing a game that is being recorded ends the recording: ask first.
  const recordingRef = useRef(false);
  const [pauseAsk, setPauseAsk] = useState(false);
  const togglePause = () => {
    if (!paused && recordingRef.current) setPauseAsk(true);
    else setPaused(!paused);
  };
  pauseToggleRef.current = () => {
    if (pausable) togglePause();
  };
  const pauseKey = bindingOf(inputCfg.input.keyboard, "pause");
  useEffect(() => {
    if (!pausable || !pauseKey || remap) return;
    const down = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        e.code !== pauseKey ||
        e.repeat ||
        (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA"))
      )
        return;
      pauseToggleRef.current();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [pausable, paused, setPaused, pauseKey, remap]);

  // The owner (this browser is linked to the device running this room)
  // can close the game: the room is archived, with its game saved.
  const ownRoom = demo
    ? undefined
    : linkedDevice.status?.rooms.find((r) => r.roomId === roomId);
  const ownsRoom = hostLink !== null && ownRoom !== undefined;
  const recording = live.room?.recording === true || ownRoom?.recording === true;
  recordingRef.current = recording;
  const [shotNote, setShotNote] = useState(false);
  // The device's test pattern room: its owner may invite someone to test.
  const ownTest =
    hostLink !== null && !!testRoom?.room_id && testRoom.room_id === roomId;
  const inviteRoom = ownRoom
    ? { id: ownRoom.id, name: ownRoom.name, invite: ownRoom.invite, inviteCode: ownRoom.inviteCode, ownerKey: ownRoom.ownerKey }
    : ownTest && testRoom
      ? { id: "test", name: testRoom.title ?? "Test pattern", invite: testRoom.invite ?? "", inviteCode: testRoom.invite_code ?? "", ownerKey: testRoom.owner_key ?? "" }
      : null;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  // The device asks every browser for a PIN, the owner's too (its room
  // page is another connection than the device's link). Before showing the
  // form, try what this browser already has, in order: the host's key, the
  // token this browser got the last time it came in, and the PIN typed on
  // the join page. Only a PIN the person types shows its errors.
  const joinPin = ((location.state as { pin?: unknown } | null)?.pin as string | undefined) ?? "";
  const credentials = useMemo(() => {
    const list: { token?: string; pin?: string; stored?: boolean }[] = [];
    if (inviteRoom?.ownerKey) list.push({ token: inviteRoom.ownerKey });
    const saved = roomId ? roomPass(roomId) : "";
    if (saved) list.push({ token: saved, stored: true });
    if (/^\d{6}$/.test(joinPin)) list.push({ pin: joinPin });
    return list;
  }, [inviteRoom?.ownerKey, roomId, joinPin]);
  const autoTry = useRef<{ next: number; sent: (typeof credentials)[number] | null }>({ next: 0, sent: null });
  const [typedPin, setTypedPin] = useState(false);
  useEffect(() => {
    const pin = live.pin;
    if (!pin.needed) {
      if (pin.token && roomId && !inviteRoom) saveRoomPass(roomId, pin.token);
      return;
    }
    if (pin.busy) return;
    const tries = autoTry.current;
    if (!pin.last) tries.next = 0; // a new ask: start again
    else if (tries.sent?.stored && roomId) forgetRoomPass(roomId); // an old token
    if (pin.last && tries.sent?.pin) {
      // The PIN the person typed on the join page failed: show why (used,
      // wrong...) and let them type another.
      tries.sent = null;
      setTypedPin(true);
      return;
    }
    if (pin.last && !tries.sent) return; // the person is typing
    const next = credentials[tries.next];
    tries.sent = next ?? null;
    if (!next) return;
    tries.next++;
    if (next.token) live.sendToken(next.token);
    else if (next.pin) live.sendPin(next.pin);
  }, [live, credentials, roomId, inviteRoom]);
  // Hold V to talk.
  useEffect(() => {
    if (!seated) return;
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
    };
    const down = (e: KeyboardEvent) =>
      e.code === "KeyV" && !typing(e) && setPtt(true);
    const up = (e: KeyboardEvent) => e.code === "KeyV" && setPtt(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [seated]);

  const levels = useAudioLevels(
    {
      mic: talking ? mic.stream : null,
      p1: live.voiceStreams[1],
      p2: live.voiceStreams[2],
      p3: live.voiceStreams[3],
      p4: live.voiceStreams[4],
    },
    soundOn || micOn,
  );
  const speaking = new Set<number>();
  [1, 2, 3, 4].forEach((p) => (levels[`p${p}`] ?? 0) > 0.12 && speaking.add(p));
  if (talking && (levels.mic ?? 0) > 0.12)
    live.room?.you.ports.forEach((p) => speaking.add(p));

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = live.media;
  }, [live.media]);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !soundOn;
    v.volume = gameVolume / 100;
    if (!soundOn) {
      setSoundBlocked(false);
      return;
    }
    tryPlay(v).then(
      () => setSoundBlocked(false),
      () => {
        v.muted = true;
        void v.play().catch(() => undefined);
        setSoundBlocked(true);
      },
    );
  }, [soundOn, gameVolume, live.media]);
  useEffect(() => {
    if (!soundBlocked) return;
    const unmute = () => {
      const v = videoRef.current;
      if (!v) return;
      v.muted = false;
      tryPlay(v).then(
        () => setSoundBlocked(false),
        () => undefined,
      );
    };
    window.addEventListener("pointerdown", unmute);
    window.addEventListener("keydown", unmute);
    return () => {
      window.removeEventListener("pointerdown", unmute);
      window.removeEventListener("keydown", unmute);
    };
  }, [soundBlocked]);
  const hearing = soundOn && !soundBlocked;

  // Console mode: a phone or tablet with the on-screen gamepad turns the
  // room into a handheld console that fills the screen (a Game Boy held
  // upright, a Switch held sideways). Everything but the game folds into a
  // drawer opened from the side.
  const consoleMode = live.media !== null && touch && touchPad;
  const [drawer, setDrawer] = useState(false);
  sideHidden.current = consoleMode ? !drawer : chatHidden;
  useEffect(() => {
    if (!consoleMode) {
      setDrawer(false);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [consoleMode]);

  // The controls over the video fade out after a few seconds without the
  // mouse moving or a tap, as video players do, and come back on the next
  // movement or tap. A tap on the bare video hides them at once.
  const [idle, setIdle] = useState(false);
  const autoFullscreen = useRef(false);
  const idleTimer = useRef(0);
  const wake = useCallback(() => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    const sleep = () => {
      const stage = stageRef.current;
      // Keep them while a menu is open or the mouse rests on them.
      const busy =
        stage?.querySelector('[aria-expanded="true"]') ||
        (window.matchMedia?.("(hover: hover)").matches &&
          stage?.querySelector(".video-toolbar:hover, .players-capsule:hover"));
      if (busy) idleTimer.current = window.setTimeout(sleep, IDLE_MS);
      else setIdle(true);
    };
    idleTimer.current = window.setTimeout(sleep, IDLE_MS);
  }, []);
  useEffect(() => {
    if (live.media !== null) wake();
    else setIdle(false);
    return () => window.clearTimeout(idleTimer.current);
  }, [live.media, wake]);
  const onStagePointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Playing on the gamepad is not a request to see the controls.
    if (target.closest(".touchpad-side")) return;
    if (e.type === "pointermove") {
      if (e.pointerType === "mouse") wake();
      return;
    }
    // The first touch of a console hides the browser's bars (where the
    // browser allows it); leaving full screen afterwards is respected.
    if (consoleMode && !autoFullscreen.current) {
      autoFullscreen.current = true;
      fullscreen.enterQuietly();
    }
    const bare = !target.closest("button, a, input, [role='dialog'], .video-toolbar, .players-capsule, .stream-info");
    if (bare && !idle && e.pointerType !== "mouse") {
      window.clearTimeout(idleTimer.current);
      setIdle(true);
    } else wake();
  };

  if (!demo) {
    switch (status.kind) {
      case "invalid":
        return (
          <RoomProblem title={t.room.notFoundTitle} text={t.room.invalidId} />
        );
      case "notFound":
        return (
          <RoomProblem
            title={t.room.notFoundTitle}
            text={t.room.notFoundText}
            help
          />
        );
      case "ended":
        return <RoomProblem title={t.room.ended} />;
      case "rateLimited":
        return <RoomProblem title={t.room.rateLimited} />;
      case "unreachable":
        return <RoomProblem title={t.room.unreachable} />;
      default:
        break;
    }
  }

  const streaming = live.media !== null;
  const touchOn = streaming && touch && touchPad;
  const controlsOn = touch ? touchPad : showControls;
  // Demo variants mirror the prototype: ?perspective=spectator&spectatorsHearVoice=true
  const model = demo
    ? demoModel(
        params.get("perspective") !== "spectator",
        micOn,
        params.get("spectatorsHearVoice") === "true",
      )
    : liveModel(live.room, live.chat, { speaking, silenced, talking });
  const actions: SideActions = demo
    ? { chatEnabled: false, name: "" }
    : {
        chatEnabled: live.controlOpen,
        onChat: live.sendChat,
        onSpectate: live.spectate,
        onQueue: live.joinQueue,
        onTyping: live.sendTyping,
        typing: live.typing,
        sound: chatSound,
        onSound: (on) => {
          setChatSound(on);
          writeStorage(CHAT_SOUND_KEY, String(on));
        },
        onHide: () => {
          setChatHidden(true);
          writeStorage(CHAT_HIDDEN_KEY, "true");
        },
        chatOff: live.room ? !live.room.chat : false,
        onChatSwitch:
          ownsRoom && ownRoom
            ? (on) =>
                sendToDevice({
                  type: "room_action",
                  id: ownRoom.id,
                  action: on ? "chat_on" : "chat_off",
                })
            : undefined,
        name: playerName,
        onName: (name) => {
          setPlayerName(name);
          writeStorage(NAME_KEY, name);
        },
      };
  const info = live.room?.info;
  const title = demo
    ? "Turtles co-op"
    : meta?.title || info?.title || t.room.private;
  const isPrivate = demo || meta === null;
  const subtitle = demo
    ? `Teenage Mutant Ninja Turtles · ${t.room.hostLabel(DEMO_DEVICE_NAME)}`
    : [
        meta?.game || info?.game,
        (meta?.host || info?.host) &&
          t.room.hostLabel(meta?.host || info?.host || ""),
      ]
        .filter(Boolean)
        .join(" · ");
  // The link of this page: /g/<invite> for invitations, /r/<id> otherwise.
  const inviteUrl = `${window.location.origin}${window.location.pathname}`;
  const joining = !demo && status.kind === "joining";
  const playing = model.me.kind === "player";
  const myPorts = demo ? [] : (live.room?.you.ports ?? []);
  const seatedCount = live.room?.seats.filter(Boolean).length ?? 0;
  const starts = startButtonCount(
    live.room?.controls.players ?? 0,
    seatedCount,
  );
  const swapFrom = myPorts[0] ?? 0;
  const swapFor = (port: number): SeatSwap | undefined =>
    !swapFrom || port === swapFrom
      ? undefined
      : {
          onSwap: () => live.swapSeat(swapFrom, port),
          waiting: !!live.room?.you.swapAsked.some(
            (a) => a.from === swapFrom && a.to === port,
          ),
        };
  const swapOffers = demo ? [] : (live.room?.you.swapOffers ?? []);

  return (
    <div className={`page room-page${consoleMode ? " is-console-mode" : ""}`}>
      <PageHero
        className="room-hero room-bar"
        tile={
          <HeroTile
            art={meta?.art ?? info?.art}
            status={streaming ? "live" : live.state === "failed" ? "failed" : "idle"}
          >
            <GamepadIcon size={32} />
          </HeroTile>
        }
        eyebrow={
          <>
            <Link to="/rooms" className="back-link">
              <ChevronLeftIcon size={14} />
              {t.nav.backShort}
            </Link>
            <span aria-hidden="true">·</span>
            {isPrivate && <LockIcon size={12} />}
            {isPrivate ? t.room.private : t.room.public}
          </>
        }
        title={<span className="room-title">{title}</span>}
        chips={
          <>
            {subtitle && <Chip>{subtitle}</Chip>}
            {!demo && live.room && (
              <Chip className="chip-keep">
                {t.room.playersChip(seatedCount, live.room.maxPlayers)}
              </Chip>
            )}
            {ownsRoom && <Chip mono>{t.room.roomShort(roomId)}</Chip>}
            {guest && (
              <Chip className="chip-guest chip-keep" title={t.guest.badgeHint}>
                {t.guest.badge}
              </Chip>
            )}
          </>
        }
        actions={<>
          {!demo && (
            <button
              type="button"
              className={`icon-button tip-below icon-with-badge${chatHidden ? "" : " is-on"}`}
              aria-label={chatHidden ? t.room.chatShow : t.room.chatHide}
              data-tip={chatHidden ? t.room.chatShow : t.room.chatHide}
              aria-pressed={!chatHidden}
              onClick={() => {
                const hide = !chatHidden;
                setChatHidden(hide);
                if (!hide) setUnread(0);
                writeStorage(CHAT_HIDDEN_KEY, String(hide));
              }}
            >
              <ChatIcon />
              {chatHidden && unread > 0 && (
                <span className="icon-badge">{unread > 99 ? "99+" : unread}</span>
              )}
            </button>
          )}
          <button
            type="button"
            className="icon-button tip-below"
            onClick={() => setHelpOpen(true)}
            aria-label={t.help.button}
            data-tip={t.help.button}
          >
            <HelpIcon />
          </button>
          {inviteRoom && (
            <button
              type="button"
              className="icon-button icon-button-primary tip-below"
              aria-label={t.invite.button}
              data-tip={t.invite.button}
              onClick={() => setInviteOpen(true)}
            >
              <UserPlusIcon />
            </button>
          )}
          {ownsRoom && (
            <button
              type="button"
              className="icon-button icon-button-danger tip-below"
              aria-label={t.room.closeGame}
              data-tip={t.room.closeGame}
              onClick={() => setConfirmClose(true)}
            >
              <PowerIcon />
            </button>
          )}
          <Link
            to="/rooms"
            className="icon-button tip-below"
            aria-label={t.room.leave}
            data-tip={t.room.leaveHint}
          >
            <LogOutIcon />
          </Link>
        </>}
      />

      <div className="page-body room-layout">
        <div className="room-main">
          <div
            ref={stageRef}
            className={`video-stage${touchOn ? " has-touchpad is-console" : ""}${!streaming && live.pin.needed ? " needs-pin" : ""}${fullscreen.pseudo ? " is-pseudo-fullscreen" : ""}${fullscreen.active ? " is-fullscreen" : ""}${idle && streaming && !paused ? " is-idle" : ""}`}
            style={
              { "--ar": String(live.aspect ?? 4 / 3) } as CSSProperties
            }
            onPointerDown={onStagePointer}
            onPointerMove={onStagePointer}
          >
            <video
              ref={videoRef}
              className={`video${live.aspect ? " has-aspect" : ""}`}
              style={
                live.aspect ? { aspectRatio: String(live.aspect) } : undefined
              }
              autoPlay
              playsInline
              muted
              hidden={!streaming}
            />
            {shotNote && (
              <p className="video-chip shot-note" role="status">
                <CameraIcon size={14} />
                {t.rec.screenshotSaved}
              </p>
            )}
            {streaming && soundBlocked && (
              <p className="video-chip sound-hint" role="status">
                <SoundOffIcon size={14} />
                {t.room.tapForSound}
              </p>
            )}
            {!streaming && live.pin.needed && (
              <PinPrompt
                busy={live.pin.busy}
                last={typedPin ? live.pin.last : null}
                onSend={(pin) => {
                  autoTry.current.sent = null;
                  setTypedPin(true);
                  live.sendPin(pin);
                }}
              />
            )}
            {!streaming && !live.pin.needed && (
              <div className="video-placeholder">
                <GamepadIcon size={40} />
                <span className="small-plus">
                  {joining
                    ? t.room.joining
                    : live.state === "failed"
                      ? t.room.videoFailed
                      : demo
                        ? t.room.videoPlaceholder
                        : t.room.waitingVideo}
                </span>
              </div>
            )}
            {(demo || streaming) && (
              <>
                <span className="video-chip video-live">
                  <span className="dot dot-accent dot-small" />
                  {t.room.live}
                </span>
                {recording && (
                  <RecChip
                    since={ownsRoom ? ownRoom?.recordingSince : undefined}
                  />
                )}
                <StreamInfo
                  rttMs={demo ? 38 : live.stats.rttMs}
                  sentFps={demo ? 60 : live.sentFps}
                  receivedFps={demo ? 60 : live.stats.fps}
                  path={demo ? "direct" : live.stats.path}
                />
              </>
            )}
            {touchOn && (
              <TouchPad
                controls={live.room?.controls ?? DEFAULT_CONTROLS}
                onChange={live.setTouchButtons}
                starts={starts}
                myPorts={myPorts}
              />
            )}
            {streaming && paused && (
              <div className="video-paused" role="status">
                <span className="video-paused-label">
                  {t.room.pausedBy(live.room?.pausedBy ?? "")}
                </span>
                {pausable && (
                  <button
                    type="button"
                    className="button button-primary button-small"
                    onClick={() => setPaused(false)}
                  >
                    <PlayIcon size={16} /> {t.room.resumeButton}
                  </button>
                )}
              </div>
            )}
            {!streaming && (
              <span className="video-chip video-controls">
                {playing ? t.room.controlsPlayer : t.room.controlsSpectator}
              </span>
            )}
            {streaming &&
              !touchOn &&
              !playing &&
              model.me.kind !== "unknown" && (
                <span className="video-chip video-controls">
                  {t.room.controlsSpectator}
                </span>
              )}
            {(demo || streaming || live.room) && (
              <PlayersCapsule
                seats={model.seats}
                swapFor={(port) => (demo ? undefined : swapFor(port))}
                onToggleSilence={
                  demo
                    ? undefined
                    : (port) =>
                        setSilenced((cur) => {
                          const next = new Set(cur);
                          if (next.has(port)) next.delete(port);
                          else next.add(port);
                          return next;
                        })
                }
              />
            )}
            {swapOffers.map((o) => (
              <div
                key={`${o.from}-${o.to}`}
                className="swap-offer swap-toast"
                role="alertdialog"
                aria-label={t.room.swapOffer(localName(o.name), o.from, o.to)}
              >
                <SwapIcon />
                <span className="grow">
                  {t.room.swapOffer(localName(o.name), o.from, o.to)}
                </span>
                <button
                  type="button"
                  className="button button-primary button-small"
                  onClick={() => live.answerSwap(o.from, o.to, true)}
                >
                  {t.room.swapYes}
                </button>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={() => live.answerSwap(o.from, o.to, false)}
                >
                  {t.room.swapNo}
                </button>
              </div>
            ))}
            {consoleMode && (
              <>
                <span className="console-title">{title}</span>
                <button
                  type="button"
                  className="console-tab"
                  aria-expanded={drawer}
                  aria-label={t.room.consoleMenu}
                  onClick={() => {
                    setDrawer(true);
                    setUnread(0);
                  }}
                >
                  <ChatIcon size={16} />
                  {unread > 0 && <span className="toggle-badge">{unread}</span>}
                </button>
              </>
            )}
            {/* Phones held sideways: the dock folds behind one button. */}
            <button
              type="button"
              className={`icon-button dock-toggle${dockOpen ? " is-on" : ""}`}
              aria-expanded={dockOpen}
              aria-label={dockOpen ? t.room.dockClose : t.room.dockOpen}
              onClick={() => setDockOpen(!dockOpen)}
            >
              {dockOpen ? <CloseIcon size={16} /> : <SlidersIcon />}
            </button>
            <div className={`video-toolbar${dockOpen ? " is-open" : ""}`}>
              {streaming && playing && !touchOn && (
                <div
                  className="dock-group"
                  role="group"
                  aria-label={t.room.startBar}
                >
                  {Array.from({ length: starts }, (_, i) => (
                    <StartButton
                      key={i}
                      port={i + 1}
                      mine={myPorts.includes(i + 1)}
                      onHold={(held) =>
                        live.setTouchButtons(held ? startOf(i + 1) : 0)
                      }
                    />
                  ))}
                </div>
              )}
              {(demo || streaming) && (
                <VoiceControl
                  model={model}
                  micOn={demo ? micOn : micOn || ptt}
                  micLevel={demo ? 0.6 : (levels.mic ?? 0)}
                  micState={demo ? "on" : mic.state}
                  toggleMic={() => {
                    if (!demo && !micOn) setSoundOn(true); // talking implies listening
                    setMicOn(!micOn);
                  }}
                  volumes={
                    demo
                      ? undefined
                      : {
                          game: gameVolume,
                          voice: voiceVolume,
                          onGame: (v) => {
                            setGameVolume(v);
                            writeStorage(GAME_VOLUME_KEY, String(v));
                          },
                          onVoice: (v) => {
                            setVoiceVolume(v);
                            writeStorage(VOICE_VOLUME_KEY, String(v));
                          },
                        }
                  }
                />
              )}
              {streaming && pausable && (
                <button
                  type="button"
                  className={`icon-button video-pause${paused ? " is-on" : ""}`}
                  aria-pressed={paused}
                  aria-label={paused ? t.room.resume : t.room.pause}
                  data-tip={paused ? t.room.resume : t.room.pause}
                  onClick={togglePause}
                >
                  {paused ? <PlayIcon /> : <PauseIcon />}
                </button>
              )}
              {streaming && (
                <button
                  type="button"
                  className={`icon-button video-controls-toggle${controlsOn ? " is-on" : ""}`}
                  aria-pressed={controlsOn}
                  aria-label={
                    touch
                      ? controlsOn
                        ? t.touch.hide
                        : t.touch.show
                      : controlsOn
                        ? t.controls.hide
                        : t.controls.show
                  }
                  data-tip={
                    touch
                      ? undefined
                      : live.controllers.length
                        ? live.controllers
                            .map((c) => t.room.controller(c.player, c.name))
                            .join(" · ")
                        : t.controls.keyboardTitle
                  }
                  onClick={() =>
                    touch
                      ? setTouchPad((v) => {
                          writeStorage(TOUCH_KEY, String(!v));
                          return !v;
                        })
                      : setShowControls((v) => {
                          writeStorage(CONTROLS_KEY, String(!v));
                          return !v;
                        })
                  }
                >
                  <ControllerIcon />
                  {live.controllers.length > 0 && (
                    <span className="toggle-badge">
                      {live.controllers.length}
                    </span>
                  )}
                </button>
              )}
              {streaming && (
                <button
                  type="button"
                  className={`icon-button video-sound${hearing ? "" : " is-muted"}`}
                  aria-pressed={hearing}
                  aria-label={hearing ? t.room.soundOff : t.room.soundOn}
                  data-tip={hearing ? t.room.soundOff : t.room.soundOn}
                  // While the browser blocks sound, this tap itself unmutes it.
                  onClick={() => (soundBlocked ? undefined : setSoundOn(!soundOn))}
                >
                  {hearing ? <SoundOnIcon /> : <SoundOffIcon />}
                </button>
              )}
              {streaming && (
                <button
                  type="button"
                  className="icon-button video-shot"
                  aria-label={t.rec.screenshot}
                  data-tip={t.rec.screenshot}
                  onClick={() => {
                    const v = videoRef.current;
                    if (v && saveScreenshot(v, title, live.aspect ?? null)) {
                      setShotNote(true);
                      window.setTimeout(() => setShotNote(false), 2500);
                    }
                  }}
                >
                  <CameraIcon />
                </button>
              )}
              {streaming && ownsRoom && ownRoom && live.room?.pausable && (
                <button
                  type="button"
                  className={`icon-button video-record${recording ? " is-recording" : ""}`}
                  aria-pressed={recording}
                  aria-label={recording ? t.rec.stop : t.rec.start}
                  data-tip={
                    recording
                      ? t.rec.stop
                      : paused
                        ? t.rec.pauseText
                        : `${t.rec.start} · ${t.rec.limits}`
                  }
                  disabled={!recording && paused}
                  onClick={() =>
                    sendToDevice(
                      recording ? recordStop(ownRoom.id) : recordStart(ownRoom.id),
                    )
                  }
                >
                  {recording ? <StopIcon size={16} /> : <RecordIcon size={16} />}
                </button>
              )}
              <button
                type="button"
                className={`icon-button video-fullscreen${fullscreen.active ? " is-on" : ""}`}
                aria-label={
                  fullscreen.active ? t.touch.exitFullscreen : t.room.fullscreen
                }
                aria-pressed={fullscreen.active}
                data-tip={
                  fullscreen.active ? t.touch.exitFullscreen : t.room.fullscreen
                }
                onClick={() => {
                  // Where the page cannot go full screen (iPhone), the
                  // stage fills the window instead.
                  if (!(consoleMode && !fullscreen.active && fullscreen.enterQuietly()))
                    fullscreen.toggle();
                }}
              >
                {fullscreen.active ? (
                  <ExitFullscreenIcon />
                ) : (
                  <FullscreenIcon />
                )}
              </button>
            </div>
          </div>

          {streaming && !touch && showControls && (
            <ControlsPanel
              controllers={live.controllers}
              heldKeys={live.heldKeys}
              keyboardPlayer={keyboardPlayer}
              onKeyboardPlayer={(player) => {
                setKeyboardPlayer(player);
                writeStorage(KEYBOARD_PLAYER_KEY, String(player));
              }}
              input={inputCfg.input}
              onRemap={setRemap}
              onPlayer={inputCfg.setPlayer}
            />
          )}
          {remap && (
            <RemapDialog
              target={remap}
              keyboard={inputCfg.input.keyboard}
              pad={
                remap.kind === "pad" ? padMapFor(inputCfg.input, remap.id) : {}
              }
              onKeyboard={inputCfg.setKeyboard}
              onPad={(map) =>
                remap.kind === "pad" && inputCfg.setPad(remap.id, map)
              }
              onReset={() =>
                remap.kind === "pad"
                  ? inputCfg.resetPad(remap.id)
                  : inputCfg.resetKeyboard()
              }
              onClose={() => setRemap(null)}
            />
          )}
          {inviteOpen && inviteRoom && (
            <InviteDialog
              room={inviteRoom}
              fallbackUrl={inviteUrl}
              onAction={(action) =>
                sendToDevice({ type: "room_action", id: inviteRoom.id, action })
              }
              onClose={() => setInviteOpen(false)}
            />
          )}
          {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
          {pauseAsk && (
            <ConfirmDialog
              title={t.rec.pauseTitle}
              text={t.rec.pauseText}
              confirm={t.rec.pauseConfirm}
              onCancel={() => setPauseAsk(false)}
              onConfirm={() => {
                setPauseAsk(false);
                setPaused(true);
              }}
            />
          )}
          {confirmClose && (
            <ConfirmDialog
              title={t.room.closeTitle}
              text={ownRoom?.noSaves ? t.room.closeTextNoSaves : t.room.closeText}
              confirm={t.room.closeConfirm}
              alternative={
                ownRoom?.noSaves && ownRoom.state === "live"
                  ? {
                      label: t.gameRooms.pauseInstead,
                      onClick: () => {
                        setConfirmClose(false);
                        sendToDevice({ type: "room_action", id: ownRoom.id, action: "pause" });
                      },
                    }
                  : undefined
              }
              onCancel={() => setConfirmClose(false)}
              onConfirm={() => {
                setConfirmClose(false);
                if (ownRoom) {
                  sendToDevice({
                    type: "room_action",
                    id: ownRoom.id,
                    action: "archive",
                  });
                  // The room is gone for good: back to the rooms, not to a
                  // "room not found" page.
                  navigate("/rooms", { replace: true });
                }
              }}
            />
          )}


          {/* Voice of the other players, each with its own volume. */}
          {Object.entries(live.voiceStreams).map(([port, stream]) => (
            <VoiceAudio
              key={port}
              stream={stream}
              volume={voiceVolume / 100}
              muted={!soundOn || silenced.has(Number(port))}
            />
          ))}

        </div>

        {consoleMode ? (
          <>
            {drawer && (
              <button
                type="button"
                className="console-scrim"
                aria-label={t.room.consoleClose}
                onClick={() => setDrawer(false)}
              />
            )}
            <div
              className={`console-drawer${drawer ? " is-open" : ""}`}
              role="dialog"
              aria-label={t.room.consoleMenu}
              aria-hidden={!drawer}
              inert={!drawer}
            >
              <div className="console-drawer-head">
                <span className="console-drawer-title">{title}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t.help.button}
                  onClick={() => setHelpOpen(true)}
                >
                  <HelpIcon />
                </button>
                <Link
                  to="/rooms"
                  className="icon-button"
                  aria-label={t.room.leave}
                >
                  <LogOutIcon />
                </Link>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t.room.consoleClose}
                  onClick={() => setDrawer(false)}
                >
                  <CloseIcon size={16} />
                </button>
              </div>
              <SidePanel model={model} actions={actions} />
            </div>
          </>
        ) : (
          !(chatHidden && !demo) && <SidePanel model={model} actions={actions} />
        )}
      </div>
    </div>
  );
}

/** REC over the video; the owner also sees for how long. */
function RecChip({ since }: { since?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [since]);
  const start = since ? new Date(since).getTime() : NaN;
  const s = Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 1000)) : -1;
  const p = (n: number) => String(n).padStart(2, "0");
  const clock = s < 0 ? "" : s >= 3600 ? `${Math.floor(s / 3600)}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}` : `${p(Math.floor(s / 60))}:${p(s % 60)}`;
  return (
    <span className="video-chip video-rec" role="status" title={t.rec.everyoneHint} aria-label={t.rec.everyone}>
      <i aria-hidden="true" />
      {t.rec.badge}
      {clock && <span className="mono">{clock}</span>}
    </span>
  );
}
