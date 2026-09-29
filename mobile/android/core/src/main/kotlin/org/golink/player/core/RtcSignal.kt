// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

// What travels inside signalhub's "signal" payload between the app and the
// device (docs/protocol.md "Negotiation" and "The room PIN gate"). The
// device always offers; the app answers. signalhub never reads it.

/** An ICE candidate as the web's RTCIceCandidateInit. */
data class IceCandidateInit(val candidate: String, val sdpMid: String?, val sdpMLineIndex: Int)

sealed interface DeviceSignal {
    data class Offer(val sdp: String) : DeviceSignal

    data class Candidate(val candidate: IceCandidateInit) : DeviceSignal

    /** The room asks for the PIN of an invitation before streaming anything. */
    data object PinRequired : DeviceSignal

    /**
     * The answer to a PIN or token. reason is "wrong" (left tries remain),
     * "used" (someone already came in with that invitation), "blocked" (no
     * tries left) or "locked" (too many wrong PINs in the room: wait
     * retryAfter seconds). token lets this app come back without a PIN.
     */
    data class PinResult(val ok: Boolean, val token: String, val reason: String, val left: Int, val retryAfter: Int) : DeviceSignal
}

object RtcSignals {
    private val TOKEN = Regex("^[A-Za-z0-9_-]{43}$")

    /** A return token or owner key: 43 base64url characters, else "". */
    fun tokenOf(v: JsonElement?): String = v.strOrNull()?.takeIf { TOKEN.matches(it) } ?: ""

    fun parse(payload: JsonElement?): DeviceSignal? {
        val o = payload as? JsonObject ?: return null
        return when (o["kind"].str(20)) {
            "offer" -> o["sdp"].strOrNull()?.takeIf { it.isNotEmpty() }?.let { DeviceSignal.Offer(it) }
            "candidate" -> {
                val c = o["candidate"] as? JsonObject ?: return null
                val text = c["candidate"].strOrNull() ?: return null
                DeviceSignal.Candidate(
                    IceCandidateInit(
                        candidate = text.take(1000),
                        sdpMid = c["sdpMid"].strOrNull()?.take(32),
                        sdpMLineIndex = if (c["sdpMLineIndex"].isNumber()) c["sdpMLineIndex"].num().toInt() else 0,
                    ),
                )
            }
            "pin_required" -> DeviceSignal.PinRequired
            "pin_result" -> {
                fun n(v: JsonElement?): Int = if (v.isNumber()) jsRound(v.num()).toInt().coerceAtLeast(0) else 0
                DeviceSignal.PinResult(
                    ok = o["ok"].isTrue(),
                    token = tokenOf(o["token"]),
                    reason = o["reason"].str(20),
                    left = n(o["left"]),
                    retryAfter = n(o["retry_after"]),
                )
            }
            else -> null
        }
    }

    fun answer(sdp: String): JsonObject = buildJsonObject {
        put("kind", "answer")
        put("sdp", sdp)
    }

    fun candidate(c: IceCandidateInit): JsonObject = buildJsonObject {
        put("kind", "candidate")
        put(
            "candidate",
            buildJsonObject {
                put("candidate", c.candidate)
                if (c.sdpMid != null) put("sdpMid", c.sdpMid)
                put("sdpMLineIndex", c.sdpMLineIndex)
            },
        )
    }

    /** The PIN of an invitation, as the person typed it. */
    fun pin(pin: String): JsonObject = buildJsonObject {
        put("kind", "pin")
        put("pin", pin)
    }

    /** The return token got on the way in, to come back without a PIN. */
    fun token(token: String): JsonObject = buildJsonObject {
        put("kind", "pin")
        put("token", token)
    }

    /**
     * mid of the audio m-line the device offers as recvonly: the
     * microphone. The app answers it sendonly (see docs/protocol.md).
     */
    fun micMid(sdp: String): String? {
        val sections = sdp.split(Regex("\\r?\\nm=")).drop(1)
        for (section in sections) {
            if (!section.startsWith("audio") || !Regex("\\na=recvonly").containsMatchIn(section)) continue
            val mid = Regex("\\na=mid:([^\\r\\n]+)").find(section)?.groupValues?.get(1)
            if (!mid.isNullOrEmpty()) return mid
        }
        return null
    }

    /** Which player a voice track belongs to, from its stream id ("voice-p2" -> 2). */
    fun voicePort(streamId: String): Int? = Regex("^voice-p([1-4])$").matchEntire(streamId)?.groupValues?.get(1)?.toInt()
}
