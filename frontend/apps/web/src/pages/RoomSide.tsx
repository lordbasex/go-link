// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { nameProblem, type ChatLine, type TypingView } from "@go-link/shared";
import { t } from "../i18n";
import {
  BellIcon,
  BellOffIcon,
  ChatIcon,
  GamepadIcon,
  PanelCloseIcon,
  SendIcon,
} from "../components/Icons";
import { NameField } from "../components/NameField";
import { portStyle } from "../components/Seats";
import { localName, type RoomModel } from "./roomModel";

// The room's side: chat, queue, spectators, your seat and name. The desktop
// room shows them in one panel (SidePanel); the phone console splits them
// into the drawer's tabs (ConsoleDrawer).

export interface SideActions {
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

/**
 * Counts the messages from others that arrive while the chat is out of
 * sight, and clears the count once it is seen again. onNew runs for every
 * batch of new messages from others (the chime), seen or not. The history
 * sent on joining is older than a few seconds and never counts.
 */
export function useUnreadChat(
  chat: ChatLine[],
  myName: string | undefined,
  outOfSight: boolean,
  onNew?: () => void,
): number {
  const [unread, setUnread] = useState(0);
  const seen = useRef(0);
  const hidden = useRef(outOfSight);
  hidden.current = outOfSight;
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;
  useEffect(() => {
    const fresh = chat.slice(seen.current);
    seen.current = chat.length;
    const recent = Date.now() - 10_000;
    const others = fresh.filter(
      (c) => c.kind === "user" && c.name !== myName && c.ts > recent,
    ).length;
    if (!others) return;
    onNewRef.current?.();
    if (hidden.current) setUnread((n) => n + others);
  }, [chat, myName]);
  useEffect(() => {
    if (!outOfSight) setUnread(0);
  }, [outOfSight]);
  return unread;
}

/** Keeps a scrolling list at its bottom when something new arrives. */
export function useStickToBottom(
  ref: RefObject<HTMLElement | null>,
  deps: unknown[],
): void {
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
    // the caller lists what adds lines
  }, deps);
}

/** Where you are in the room: your seat, your place in the queue, or watching. */
export function MyPlace({
  model,
  action,
}: {
  model: RoomModel;
  /** The button beside it (give up the seat, leave or join the queue). */
  action?: { label: string; primary?: boolean; onClick: () => void };
}) {
  const { me } = model;
  if (me.kind === "unknown") return null;
  const badge =
    me.kind === "player" ? (
      <span
        className="port-badge port-badge-small"
        style={portStyle(me.ports[0] ?? 1)}
      >
        {me.ports.map((p) => `P${p}`).join("+")}
      </span>
    ) : me.kind === "queue" ? (
      <span className="port-badge port-badge-small is-outline">
        {t.ordinal(me.position)}
      </span>
    ) : (
      <span className="port-badge port-badge-small is-outline">
        <GamepadIcon size={16} />
      </span>
    );
  const [title, note] =
    me.kind === "player"
      ? [t.room.playing, t.room.waitingForSeat(model.queue.length)]
      : me.kind === "queue"
        ? [
            me.position === 1
              ? t.room.nextInQueue
              : t.room.inQueue(t.ordinal(me.position)),
            t.room.nextInQueueNote,
          ]
        : [t.room.watching, t.room.watchingNote];
  return (
    <div className="side-status-row spread">
      <div className="side-status-row">
        {badge}
        <div className="stack-xxs">
          <span className="strong">{title}</span>
          <span className="small-plus muted">{note}</span>
        </div>
      </div>
      {action && (
        <button
          type="button"
          className={`button ${action.primary ? "button-primary" : "button-secondary"} button-small`}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/** The button that goes with your place: give up the seat, leave or join the queue. */
export function placeAction(
  model: RoomModel,
  actions: SideActions,
): { label: string; primary?: boolean; onClick: () => void } | undefined {
  const { me } = model;
  if (me.kind === "player")
    return actions.onSpectate
      ? { label: t.room.giveUpSeat, onClick: actions.onSpectate }
      : undefined;
  if (me.kind === "queue")
    return actions.onSpectate
      ? { label: t.room.leaveQueue, onClick: actions.onSpectate }
      : undefined;
  if (me.kind === "spectator")
    return actions.onQueue
      ? { label: t.room.joinQueue, primary: true, onClick: actions.onQueue }
      : undefined;
  return undefined;
}

export function NameForm({
  name,
  onName,
  id = "playername",
}: {
  name: string;
  onName: (name: string) => void;
  id?: string;
}) {
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  const clean = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  const ok = nameProblem(value) === null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ok && clean !== name) onName(clean);
  };
  return (
    <form className="name-form" onSubmit={submit}>
      <label htmlFor={id} className="small muted">
        {t.room.yourName}
      </label>
      <NameField
        id={id}
        value={value}
        onChange={setValue}
        after={
          <button
            type="submit"
            className="button button-secondary button-small"
            disabled={!ok || clean === name}
          >
            {t.room.saveName}
          </button>
        }
      />
    </form>
  );
}

/** The chat's lines, notices and "X is typing…". */
export function ChatLog({
  model,
  actions,
}: {
  model: RoomModel;
  actions: SideActions;
}) {
  const typing = actions.typing ?? [];
  return (
    <>
      {actions.chatOff && <p className="notice small">{t.room.chatOffNote}</p>}
      {model.chat.length === 0 && !actions.chatOff && (
        <p className="small-plus muted">
          {actions.chatEnabled ? t.room.chatEmpty : t.room.chatPending}
        </p>
      )}
      {model.chat.map((m, i) =>
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
      {typing.length > 0 && (
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
    </>
  );
}

/** The message box. It tells the room while you type, and stops on leaving. */
export function ChatForm({
  actions,
  id = "chatmsg",
}: {
  actions: SideActions;
  id?: string;
}) {
  const [draft, setDraft] = useState("");
  const typingSent = useRef(0); // when "typing" last went out (0 = stopped)
  const onTypingRef = useRef(actions.onTyping);
  onTypingRef.current = actions.onTyping;
  // Stop "typing" when the box goes away mid-message.
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
  const send = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !actions.onChat) return;
    actions.onChat(text);
    setDraft("");
    typingSent.current = 0; // the device clears "typing" with the message
  };
  return (
    <form className="chat-form" onSubmit={send}>
      <label htmlFor={id} className="visually-hidden">
        {t.room.chatLabel}
      </label>
      <input
        id={id}
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
  );
}

export function QueueList({ model }: { model: RoomModel }) {
  return (
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
  );
}

export function SpectatorList({ model }: { model: RoomModel }) {
  return (
    <>
      <p className="small-plus muted">{t.room.spectatorsNote}</p>
      {model.spectators.map((s, i) => (
        <div key={`${s.name}-${i}`} className="viewer-row">
          <span className="viewer-avatar">{s.name.charAt(0).toUpperCase()}</span>
          {s.name}
          {s.you ? t.room.youSuffix : ""}
        </div>
      ))}
    </>
  );
}

type Tab = "chat" | "queue" | "spectators";

/** The desktop room's side panel: your place and name, then the tabs. */
export function SidePanel({
  model,
  actions,
}: {
  model: RoomModel;
  actions: SideActions;
}) {
  const [tab, setTab] = useState<Tab>("chat");
  const listRef = useRef<HTMLDivElement>(null);
  useStickToBottom(listRef, [model.chat.length, actions.typing?.length, tab]);
  const tabs: { id: Tab; count: number | null }[] = [
    { id: "chat", count: null },
    { id: "queue", count: model.queue.length },
    { id: "spectators", count: model.spectators.length },
  ];
  return (
    <aside className="room-side">
      {(model.me.kind !== "unknown" || actions.onName) && (
        <div className="side-status stack-sm">
          <MyPlace model={model} action={placeAction(model, actions)} />
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
        // Focusable, so a long chat or list scrolls from the keyboard too.
        tabIndex={0}
        ref={listRef}
      >
        {tab === "chat" && <ChatLog model={model} actions={actions} />}
        {tab === "queue" && <QueueList model={model} />}
        {tab === "spectators" && <SpectatorList model={model} />}
      </div>

      {!actions.chatOff && <ChatForm actions={actions} />}
    </aside>
  );
}
