// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import Foundation

// Room state and chat sent by the device's Room Manager on the "control"
// DataChannel. It comes from the host, but names and chat are typed by
// other guests, so everything is validated and shown as plain text.
// Port of frontend/packages/shared/src/room-state.ts and the Android app's
// RoomState.kt.

public struct SeatView: Equatable, Sendable {
    public let port: Int
    public let name: String
    public let localPlayer: Int
    public let you: Bool

    public init(port: Int, name: String, localPlayer: Int, you: Bool) {
        self.port = port
        self.name = name
        self.localPlayer = localPlayer
        self.you = you
    }
}

public struct QueueEntry: Equatable, Sendable {
    public let position: Int
    public let name: String
    public let you: Bool
}

public struct Spectator: Equatable, Sendable {
    public let name: String
    public let you: Bool
}

/** A request to swap controllers: from port asks to move to port to. */
public struct SwapView: Equatable, Sendable {
    public let from: Int
    public let to: Int
    public let name: String

    public init(from: Int, to: Int, name: String) {
        self.from = from
        self.to = to
        self.name = name
    }
}

/** What the device tells guests about the room. art is base64 JPEG, or nil. */
public struct RoomInfoView: Equatable, Sendable {
    public let title: String
    public let game: String
    public let host: String
    public let artBase64: String?

    public init(title: String, game: String, host: String, artBase64: String?) {
        self.title = title
        self.game = game
        self.host = host
        self.artBase64 = artBase64
    }
}

public struct GameControls: Equatable, Sendable {
    /** Players the game takes at once, 1 to 4 (0 = unknown). */
    public let players: Int
    /** Action buttons per player, 0 to 6. */
    public let buttons: Int
    /** MAME control type: joy4way, joy8way, stick, dial... ("" = unknown). */
    public let control: String

    public init(players: Int, buttons: Int, control: String) {
        self.players = players
        self.buttons = buttons
        self.control = control
    }

    /** What an unknown game (or an older device) offers. */
    public static let `default` = GameControls(players: 0, buttons: 6, control: "joy8way")
}

public struct YouView: Equatable, Sendable {
    public let name: String
    public let ports: [Int]
    public let queuePositions: [Int]
    public let spectator: Bool
    public let swapOffers: [SwapView]
    public let swapAsked: [SwapView]
    /** Your pending request for a pause (only the host pauses), or nil. */
    public var pauseAsked: PauseAsk?
}

/** A pause this guest asked the host for; expiresAt is the device's RFC 3339 time ("" if not sent). */
public struct PauseAsk: Equatable, Sendable {
    public let expiresAt: String

    public init(expiresAt: String) { self.expiresAt = expiresAt }
}

/** Where you stand: seated, waiting in the queue, or watching. */
public enum Me: Equatable, Sendable {
    case player([Int])
    case queue(Int)
    case spectator
}

public struct RoomStateView: Equatable, Sendable {
    public let maxPlayers: Int
    public let voice: Bool
    public let chat: Bool
    public let info: RoomInfoView
    /** Index 0 is P1; nil means a free seat. */
    public let seats: [SeatView?]
    public let queue: [QueueEntry]
    public let spectators: [Spectator]
    public let you: YouView
    public let pausable: Bool
    public let paused: Bool
    public let pausedBy: String
    public let controls: GameControls
    public let recording: Bool
    /**
     * Whether the host (the device's owner) has a browser in the room to
     * answer a pause request. Older devices do not send it: true.
     */
    public var hostOnline: Bool = true

    public var me: Me {
        if !you.ports.isEmpty { return .player(you.ports) }
        if let first = you.queuePositions.min() { return .queue(first) }
        return .spectator
    }

    public var seated: Int { seats.filter { $0 != nil }.count }

    /** The ports this player holds (empty when not seated). */
    public var myPorts: [Int] {
        if case let .player(p) = me { return p }
        return []
    }
}

/** System chat lines the app shows in the reader's language. */
public enum ChatEvent: String, CaseIterable, Sendable {
    case recordingStarted = "recording_started"
    case recordingStopped = "recording_stopped"
    case gamePaused = "game_paused"
    case gameResumed = "game_resumed"
    case nowWatching = "now_watching"
    case moved
    case swapAsked = "swap_asked"
    case keptSeat = "kept_seat"
    case swapped
    case leftSeat = "left_seat"
    case seatFree = "seat_free"
    case tookSeat = "took_seat"
    /** Sent only to the guest whose pause request the host declined. */
    case pauseDeclined = "pause_declined"
}

/** The values of a chat event (who and which seat). */
public struct ChatArgs: Equatable, Sendable {
    public let name: String
    public let port: Int
    public let name2: String
    public let port2: Int

    public init(name: String, port: Int, name2: String, port2: Int) {
        self.name = name
        self.port = port
        self.name2 = name2
        self.port2 = port2
    }
}

public enum ChatLine: Equatable, Sendable {
    case system(text: String, ts: Double, event: ChatEvent? = nil, args: ChatArgs? = nil)
    case user(name: String, port: Int?, role: String, text: String, ts: Double)

    public var ts: Double {
        switch self {
        case let .system(_, ts, _, _): return ts
        case let .user(_, _, _, _, ts): return ts
        }
    }
}

/** Someone else typing a chat message. */
public struct TypingView: Equatable, Sendable {
    public let name: String
    public let port: Int?

    public init(name: String, port: Int?) {
        self.name = name
        self.port = port
    }
}

/** Frames per second the device sends and the picture's display aspect. */
public struct StreamStatsView: Equatable, Sendable {
    public let fps: Double?
    public let aspect: Double?

    public init(fps: Double?, aspect: Double?) {
        self.fps = fps
        self.aspect = aspect
    }
}

public enum RoomMessages {
    private static let base64 = try! NSRegularExpression(pattern: "^[A-Za-z0-9+/]+={0,2}$")
    private static let guest = try! NSRegularExpression(pattern: "^Guest ([0-9A-F]{1,8})$")

    private static func parseControls(_ v: JSON?) -> GameControls {
        guard case let .object(o)? = v else { return .default }
        let buttons = o["buttons"].isNumber ? jsRound(o["buttons"].num).clamped(0, 6) : 6
        let players = o["players"].isNumber ? jsRound(o["players"].num).clamped(0, 4) : 0
        return GameControls(players: players, buttons: buttons, control: o["control"].str(20))
    }

    private static func parseInfo(_ v: JSON?) -> RoomInfoView {
        let o = v.obj
        var art = o["art"].strOrNil
        if let a = art, a.count > 6000 || !Invites.matches(base64, a) { art = nil }
        return RoomInfoView(title: o["title"].str(80), game: o["game"].str(160), host: o["host"].str(60), artBase64: art)
    }

    private static func port(_ v: JSON?, max: Int) -> Int {
        let n = v.num
        return n == n.rounded(.down) && n >= 1 && n <= Double(max) ? Int(n) : 0
    }

    private static func parseSwaps(_ v: JSON?, maxPlayers: Int) -> [SwapView] {
        v.arr.prefix(8).compactMap { x in
            let o = Optional(x).obj
            let from = port(o["from"], max: maxPlayers)
            let to = port(o["to"], max: maxPlayers)
            return from != 0 && to != 0 && from != to ? SwapView(from: from, to: to, name: o["name"].str(40)) : nil
        }
    }

    private static func parsePauseAsk(_ v: JSON?) -> PauseAsk? {
        guard case let .object(o)? = v else { return nil }
        let at = o["expires_at"]
        return PauseAsk(expiresAt: at.isNumber ? String(jsRound(at.num)) : at.str(40))
    }

    public static func parseRoomState(_ m: JSONObject) -> RoomStateView? {
        guard m["type"].str(40) == "room_state" else { return nil }
        let maxPlayers = Int(m["max_players"].num.clamped(1, 4))
        var seats = [SeatView?](repeating: nil, count: maxPlayers)
        for (i, s) in m["seats"].arr.enumerated() {
            guard i < maxPlayers, case let .object(o) = s else { continue }
            seats[i] = SeatView(port: i + 1, name: o["name"].str(40), localPlayer: Int(o["local_player"].num), you: o["you"].isTrue)
        }
        let you = m["you"].obj
        return RoomStateView(
            maxPlayers: maxPlayers,
            voice: !m["voice"].isFalse,
            chat: !m["chat"].isFalse,
            info: parseInfo(m["info"]),
            seats: seats,
            queue: m["queue"].arr.prefix(64).map { q in
                let o = Optional(q).obj
                return QueueEntry(position: Int(o["position"].num), name: o["name"].str(40), you: o["you"].isTrue)
            },
            spectators: m["spectators"].arr.prefix(64).map { p in
                let o = Optional(p).obj
                return Spectator(name: o["name"].str(40), you: o["you"].isTrue)
            },
            you: YouView(
                name: you["name"].str(40),
                ports: you["ports"].arr.prefix(4).map { Int(Optional($0).num) },
                queuePositions: you["queue_positions"].arr.prefix(4).map { Int(Optional($0).num) },
                spectator: you["spectator"].isTrue,
                swapOffers: parseSwaps(you["swap_offers"], maxPlayers: maxPlayers),
                swapAsked: parseSwaps(you["swap_asked"], maxPlayers: maxPlayers),
                pauseAsked: parsePauseAsk(you["pause_asked"])
            ),
            pausable: m["pausable"].isTrue,
            paused: m["paused"].isTrue,
            pausedBy: m["paused_by"].str(40),
            controls: parseControls(m["controls"]),
            recording: m["recording"].isTrue,
            hostOnline: !m["host_online"].isFalse
        )
    }

    public static func parseChat(_ m: JSONObject) -> ChatLine? {
        guard m["type"].str(40) == "chat" else { return nil }
        let ts = m["ts"].num
        if let system = m["system"].strOrNil {
            let text = String(system.prefix(300))
            guard let wire = m["event"].strOrNil, let event = ChatEvent(rawValue: wire) else {
                return .system(text: text, ts: ts)
            }
            guard let rawArgs = m["args"] else { return .system(text: text, ts: ts, event: event) }
            let a = Optional(rawArgs).obj
            return .system(
                text: text, ts: ts, event: event,
                args: ChatArgs(name: a["name"].str(60), port: port(a["port"], max: 4), name2: a["name2"].str(60), port2: port(a["port2"], max: 4))
            )
        }
        guard let text = m["text"].strOrNil, let name = m["name"].strOrNil else { return nil }
        let p = m["port"].num
        return .user(name: String(name.prefix(40)), port: (1...4).contains(p) ? Int(p) : nil, role: m["role"].str(20), text: String(text.prefix(300)), ts: ts)
    }

    /** Who is typing when m is a "typing" message. */
    public static func parseTyping(_ m: JSONObject) -> [TypingView]? {
        guard m["type"].str(40) == "typing" else { return nil }
        return m["names"].arr.prefix(20).map { x in
            let o = Optional(x).obj
            let p = o["port"].num
            return TypingView(name: o["name"].str(40), port: (1...4).contains(p) ? Int(p) : nil)
        }.filter { !$0.name.isEmpty }
    }

    public static func parseStreamStats(_ m: JSONObject) -> StreamStatsView? {
        guard m["type"].str(40) == "stream_stats" else { return nil }
        let fps = m["fps"].isNumber ? m["fps"].num : nil
        var aspect: Double?
        if m["aspect"].isNumber {
            let a = m["aspect"].num
            if a > 0.2 && a < 5 { aspect = a }
        }
        return StreamStatsView(fps: fps, aspect: aspect)
    }

    /**
     * The id of a name the device generated ("Guest 9F3A" -> "9F3A"), so
     * the app can show it in the reader's language; nil for real names.
     */
    public static func guestId(_ name: String) -> String? { Invites.firstGroup(guest, name) }
}
