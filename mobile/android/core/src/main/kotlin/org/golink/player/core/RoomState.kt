// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

// Room state and chat sent by the device's Room Manager on the "control"
// DataChannel. It comes from the host, but names and chat are typed by
// other guests, so everything is validated and shown as plain text.
// Port of frontend/packages/shared/src/room-state.ts.

data class SeatView(val port: Int, val name: String, val localPlayer: Int, val you: Boolean)

data class QueueEntry(val position: Int, val name: String, val you: Boolean)

data class Spectator(val name: String, val you: Boolean)

/** A request to swap controllers: from port asks to move to port to. */
data class SwapView(val from: Int, val to: Int, val name: String)

/** What the device tells guests about the room. art is base64 JPEG, or null. */
data class RoomInfoView(val title: String, val game: String, val host: String, val artBase64: String?)

data class GameControls(
    /** Players the game takes at once, 1 to 4 (0 = unknown). */
    val players: Int,
    /** Action buttons per player, 0 to 6. */
    val buttons: Int,
    /** MAME control type: joy4way, joy8way, stick, dial... ("" = unknown). */
    val control: String,
) {
    companion object {
        /** What an unknown game (or an older device) offers. */
        val DEFAULT = GameControls(players = 0, buttons = 6, control = "joy8way")
    }
}

data class YouView(
    val name: String,
    val ports: List<Int>,
    val queuePositions: List<Int>,
    val spectator: Boolean,
    val swapOffers: List<SwapView>,
    val swapAsked: List<SwapView>,
    /** Your pending request for a pause (only the host pauses), or null. */
    val pauseAsked: PauseAsk? = null,
)

/** A pause this guest asked the host for; expiresAt is the device's RFC 3339 time ("" if not sent). */
data class PauseAsk(val expiresAt: String)

data class RoomStateView(
    val maxPlayers: Int,
    val voice: Boolean,
    val chat: Boolean,
    val info: RoomInfoView,
    /** Index 0 is P1; null means a free seat. */
    val seats: List<SeatView?>,
    val queue: List<QueueEntry>,
    val spectators: List<Spectator>,
    val you: YouView,
    val pausable: Boolean,
    val paused: Boolean,
    val pausedBy: String,
    val controls: GameControls,
    val recording: Boolean,
    /**
     * Whether the host (the device's owner) has a browser in the room to
     * answer a pause request. Older devices do not send it: true.
     */
    val hostOnline: Boolean = true,
) {
    /** Where you stand: seated, waiting in the queue, or watching. */
    val me: Me
        get() = when {
            you.ports.isNotEmpty() -> Me.Player(you.ports)
            you.queuePositions.isNotEmpty() -> Me.Queue(you.queuePositions.min())
            else -> Me.Spectator
        }

    val seated: Int get() = seats.count { it != null }
}

sealed interface Me {
    data class Player(val ports: List<Int>) : Me

    data class Queue(val position: Int) : Me

    data object Spectator : Me
}

/** System chat lines the app shows in the reader's language. */
enum class ChatEvent(val wire: String) {
    RECORDING_STARTED("recording_started"),
    RECORDING_STOPPED("recording_stopped"),
    GAME_PAUSED("game_paused"),
    GAME_RESUMED("game_resumed"),
    NOW_WATCHING("now_watching"),
    MOVED("moved"),
    SWAP_ASKED("swap_asked"),
    KEPT_SEAT("kept_seat"),
    SWAPPED("swapped"),
    LEFT_SEAT("left_seat"),
    SEAT_FREE("seat_free"),
    TOOK_SEAT("took_seat"),

    /** Sent only to the guest whose pause request the host declined. */
    PAUSE_DECLINED("pause_declined"),
    ;

    companion object {
        fun of(wire: String): ChatEvent? = entries.firstOrNull { it.wire == wire }
    }
}

/** The values of a chat event (who and which seat). */
data class ChatArgs(val name: String, val port: Int, val name2: String, val port2: Int)

sealed interface ChatLine {
    val ts: Double

    data class System(val text: String, override val ts: Double, val event: ChatEvent? = null, val args: ChatArgs? = null) : ChatLine

    data class User(val name: String, val port: Int?, val role: String, val text: String, override val ts: Double) : ChatLine
}

/** Someone else typing a chat message. */
data class TypingView(val name: String, val port: Int?)

/** Frames per second the device sends and the picture's display aspect. */
data class StreamStatsView(val fps: Double?, val aspect: Double?)

object RoomMessages {
    private val BASE64 = Regex("^[A-Za-z0-9+/]+={0,2}$")
    private val GUEST = Regex("^Guest ([0-9A-F]{1,8})$")

    private fun parseControls(v: JsonElement?): GameControls {
        val o = v as? JsonObject ?: return GameControls.DEFAULT
        val buttons = if (o["buttons"].isNumber()) jsRound(o["buttons"].num()).toInt().coerceIn(0, 6) else 6
        val players = if (o["players"].isNumber()) jsRound(o["players"].num()).toInt().coerceIn(0, 4) else 0
        return GameControls(players, buttons, o["control"].str(20))
    }

    private fun parseInfo(v: JsonElement?): RoomInfoView {
        val o = v.obj()
        val art = o["art"].strOrNull()?.takeIf { it.length <= 6000 && BASE64.matches(it) }
        return RoomInfoView(o["title"].str(80), o["game"].str(160), o["host"].str(60), art)
    }

    private fun parseSwaps(v: JsonElement?, maxPlayers: Int): List<SwapView> = v.arr().take(8).mapNotNull { x ->
        val o = x.obj()
        fun port(e: JsonElement?): Int {
            val n = e.num()
            return if (n == kotlin.math.floor(n) && n >= 1 && n <= maxPlayers) n.toInt() else 0
        }
        val from = port(o["from"])
        val to = port(o["to"])
        if (from != 0 && to != 0 && from != to) SwapView(from, to, o["name"].str(40)) else null
    }

    private fun parsePauseAsk(v: JsonElement?): PauseAsk? {
        val o = v as? JsonObject ?: return null
        val at = o["expires_at"]
        val text = if (at.isNumber()) jsRound(at.num()).toString() else at.str(40)
        return PauseAsk(text)
    }

    fun parseRoomState(m: JsonObject): RoomStateView? {
        if (m["type"].str(40) != "room_state") return null
        val maxPlayers = m["max_players"].num().coerceIn(1.0, 4.0).toInt()
        val seats = MutableList<SeatView?>(maxPlayers) { null }
        m["seats"].arr().forEachIndexed { i, s ->
            if (i >= maxPlayers || s !is JsonObject) return@forEachIndexed
            seats[i] = SeatView(i + 1, s["name"].str(40), s["local_player"].num().toInt(), s["you"].isTrue())
        }
        val you = m["you"].obj()
        return RoomStateView(
            maxPlayers = maxPlayers,
            voice = !m["voice"].isFalse(),
            chat = !m["chat"].isFalse(),
            info = parseInfo(m["info"]),
            seats = seats,
            queue = m["queue"].arr().take(64).map { q ->
                val o = q.obj()
                QueueEntry(o["position"].num().toInt(), o["name"].str(40), o["you"].isTrue())
            },
            spectators = m["spectators"].arr().take(64).map { p ->
                val o = p.obj()
                Spectator(o["name"].str(40), o["you"].isTrue())
            },
            you = YouView(
                name = you["name"].str(40),
                ports = you["ports"].arr().take(4).map { it.num().toInt() },
                queuePositions = you["queue_positions"].arr().take(4).map { it.num().toInt() },
                spectator = you["spectator"].isTrue(),
                swapOffers = parseSwaps(you["swap_offers"], maxPlayers),
                swapAsked = parseSwaps(you["swap_asked"], maxPlayers),
                pauseAsked = parsePauseAsk(you["pause_asked"]),
            ),
            pausable = m["pausable"].isTrue(),
            paused = m["paused"].isTrue(),
            pausedBy = m["paused_by"].str(40),
            controls = parseControls(m["controls"]),
            recording = m["recording"].isTrue(),
            hostOnline = !m["host_online"].isFalse(),
        )
    }

    fun parseChat(m: JsonObject): ChatLine? {
        if (m["type"].str(40) != "chat") return null
        val ts = m["ts"].num()
        val system = m["system"].strOrNull()
        if (system != null) {
            val text = system.take(300)
            val event = m["event"].strOrNull()?.let { ChatEvent.of(it) } ?: return ChatLine.System(text, ts)
            val rawArgs = m["args"] ?: return ChatLine.System(text, ts, event)
            val a = rawArgs.obj()
            fun seat(v: JsonElement?): Int {
                val n = v.num()
                return if (n == kotlin.math.floor(n) && n in 1.0..4.0) n.toInt() else 0
            }
            return ChatLine.System(text, ts, event, ChatArgs(a["name"].str(60), seat(a["port"]), a["name2"].str(60), seat(a["port2"])))
        }
        val text = m["text"].strOrNull() ?: return null
        val name = m["name"].strOrNull() ?: return null
        val port = m["port"].num()
        return ChatLine.User(name.take(40), if (port in 1.0..4.0) port.toInt() else null, m["role"].str(20), text.take(300), ts)
    }

    /** Who is typing when m is a "typing" message. */
    fun parseTyping(m: JsonObject): List<TypingView>? {
        if (m["type"].str(40) != "typing") return null
        return m["names"].arr().take(20).map { x ->
            val o = x.obj()
            val port = o["port"].num()
            TypingView(o["name"].str(40), if (port in 1.0..4.0) port.toInt() else null)
        }.filter { it.name.isNotEmpty() }
    }

    fun parseStreamStats(m: JsonObject): StreamStatsView? {
        if (m["type"].str(40) != "stream_stats") return null
        val fps = if (m["fps"].isNumber()) m["fps"].num() else null
        val aspect = if (m["aspect"].isNumber()) m["aspect"].num().takeIf { it > 0.2 && it < 5 } else null
        return StreamStatsView(fps, aspect)
    }

    /**
     * The id of a name the device generated ("Guest 9F3A" -> "9F3A"), so
     * the app can show it in the reader's language; null for real names.
     */
    fun guestId(name: String): String? = GUEST.matchEntire(name)?.groupValues?.get(1)
}
