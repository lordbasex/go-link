// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.ui

import android.content.res.Resources
import org.golink.player.R
import org.golink.player.core.ChatEvent
import org.golink.player.core.ChatLine
import org.golink.player.core.DeviceSignal
import org.golink.player.core.RoomMessages

// Text of the room in the reader's language, like the website's
// roomModel.ts: the device sends chat notices as events with values, and
// names it generated ("Guest 9F3A"), which are shown translated.

/** A name as shown: generated guest names in the reader's language. */
fun localName(res: Resources, name: String): String =
    RoomMessages.guestId(name)?.let { res.getString(R.string.guest_name, it) } ?: name

/** A system chat line (the website's systemText). */
fun systemText(res: Resources, line: ChatLine.System): String {
    val a = line.args
    val n = localName(res, a?.name ?: "")
    val n2 = localName(res, a?.name2 ?: "")
    val p = a?.port ?: 0
    val p2 = a?.port2 ?: 0
    return when (line.event) {
        ChatEvent.RECORDING_STARTED -> res.getString(R.string.ev_recording_started)
        ChatEvent.RECORDING_STOPPED -> res.getString(R.string.ev_recording_stopped)
        ChatEvent.GAME_PAUSED -> res.getString(R.string.ev_paused, n)
        ChatEvent.GAME_RESUMED -> res.getString(R.string.ev_resumed, n)
        ChatEvent.NOW_WATCHING -> res.getString(R.string.ev_watching, n)
        ChatEvent.MOVED -> res.getString(R.string.ev_moved, n, p)
        ChatEvent.SWAP_ASKED -> res.getString(R.string.ev_swap_asked, n, p, n2, p2)
        ChatEvent.KEPT_SEAT -> res.getString(R.string.ev_kept, n, p)
        ChatEvent.SWAPPED -> res.getString(R.string.ev_swapped, n, p, n2, p2)
        ChatEvent.LEFT_SEAT -> res.getString(R.string.ev_left, n, p)
        ChatEvent.SEAT_FREE -> res.getString(R.string.ev_free, p)
        ChatEvent.TOOK_SEAT -> res.getString(R.string.ev_took, n, p)
        null -> line.text
    }
}

/** Why a PIN was refused (the website's pinWrong/pinUsed/pinBlocked/pinLocked). */
fun pinRefusal(res: Resources, r: DeviceSignal.PinResult): String = when (r.reason) {
    "used" -> res.getString(R.string.pin_used)
    "blocked" -> res.getString(R.string.pin_blocked)
    "locked" -> res.getQuantityString(R.plurals.pin_locked, maxOf(1, (r.retryAfter + 59) / 60), maxOf(1, (r.retryAfter + 59) / 60))
    else -> res.getQuantityString(R.plurals.pin_wrong, r.left, r.left)
}

/** 1 -> "1st"... in the reader's language, for the queue. */
fun ordinal(res: Resources, n: Int): String = res.getString(R.string.ordinal, n)
