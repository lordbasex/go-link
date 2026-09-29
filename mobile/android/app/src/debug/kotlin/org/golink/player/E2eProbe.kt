// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import org.golink.player.core.ChatLine
import org.golink.player.core.Me
import org.golink.player.core.RoomUi
import org.webrtc.RTCStatsReport

/**
 * Debug builds only (this file is in src/debug; src/release has an empty
 * one): the room's events and the WebRTC counters as one JSON object per
 * logcat line, tag GoLinkE2E, so the Android end-to-end test
 * (e2e/tests/android.spec.ts) can check what the app receives and sends
 * with `adb logcat -s GoLinkE2E`. It never logs a PIN or a token.
 */
object E2eProbe {
    const val TAG = "GoLinkE2E"

    fun attach(session: RoomSession, scope: CoroutineScope): () -> Unit {
        var seenChat = 0
        val events = scope.launch {
            combine(session.client.ui, session.sound) { ui, sound -> summary(ui) to sound }
                .distinctUntilChanged()
                .collect { (s, sound) ->
                    log(
                        buildJsonObject {
                            put("ev", "ui")
                            s.forEach { (k, v) -> put(k, v) }
                            put("mic", sound.micOn)
                            put("voices", buildJsonArray { sound.voices.sorted().forEach { add(it) } })
                        },
                    )
                }
        }
        val chat = scope.launch {
            session.client.ui.collect { ui ->
                // The client keeps the last lines only: log the new tail.
                val lines = ui.chat
                if (lines.size < seenChat) seenChat = 0
                for (line in lines.drop(seenChat)) {
                    if (line is ChatLine.User) {
                        log(buildJsonObject { put("ev", "chat"); put("name", line.name); put("text", line.text); line.port?.let { put("port", it) } })
                    }
                }
                seenChat = lines.size
            }
        }
        val stats = scope.launch {
            while (true) {
                delay(1_000)
                val peer = session.rtcPeer ?: continue
                peer.stats { report -> log(statsLine(report) { peer.trackLabel(it) }) }
            }
        }
        return {
            events.cancel()
            chat.cancel()
            stats.cancel()
        }
    }

    private fun summary(ui: RoomUi): Map<String, String> = buildMap {
        put("phase", ui.phase.name)
        put("room", ui.roomId)
        put("reconnecting", ui.reconnecting.toString())
        put("pin_needed", ui.pin.needed.toString())
        put("pin_busy", ui.pin.busy.toString())
        ui.pin.last?.let { put("pin_reason", it.reason) }
        put("control", ui.controlOpen.toString())
        put(
            "me",
            when (val me = ui.room?.me) {
                is Me.Player -> me.ports.joinToString(",") { "P$it" }
                is Me.Queue -> "queue:${me.position}"
                Me.Spectator -> "spectator"
                null -> ""
            },
        )
        ui.room?.let { r -> put("seats", r.seats.mapIndexed { i, s -> "P${i + 1}=${s?.name ?: "-"}" }.joinToString(" ")) }
    }

    /** One line: inbound RTP per track label, the microphone's outbound RTP and the path in use. */
    private fun statsLine(report: RTCStatsReport, label: (String) -> String?): JsonObject = buildJsonObject {
        put("ev", "stats")
        val all = report.statsMap
        putJsonObject("in") {
            for (s in all.values) {
                if (s.type != "inbound-rtp") continue
                val m = s.members
                val track = m["trackIdentifier"] as? String ?: continue
                val name = label(track) ?: (m["kind"] as? String ?: "?")
                putJsonObject(name) {
                    num("packets", m["packetsReceived"])
                    num("bytes", m["bytesReceived"])
                    num("lost", m["packetsLost"])
                    dbl("level", m["audioLevel"])
                    dbl("energy", m["totalAudioEnergy"])
                    num("samples", m["totalSamplesReceived"])
                    num("frames", m["framesDecoded"])
                    num("width", m["frameWidth"])
                }
            }
        }
        putJsonObject("out") {
            for (s in all.values) {
                if (s.type != "outbound-rtp") continue
                val m = s.members
                if (m["kind"] != "audio") continue
                putJsonObject("mic") {
                    num("packets", m["packetsSent"])
                    num("bytes", m["bytesSent"])
                }
            }
            for (s in all.values) {
                if (s.type != "media-source" || s.members["kind"] != "audio") continue
                dbl("mic_level", s.members["audioLevel"])
            }
        }
        // The candidate pair in use: host/srflx/prflx/relay on each side.
        val pair = all.values.firstOrNull { it.type == "candidate-pair" && it.members["nominated"] == true && it.members["state"] == "succeeded" }
        if (pair != null) {
            val local = all[pair.members["localCandidateId"] as? String]?.members
            val remote = all[pair.members["remoteCandidateId"] as? String]?.members
            put("path", "${local?.get("candidateType")}->${remote?.get("candidateType")}")
        }
    }

    private fun JsonObjectBuilder.num(key: String, v: Any?) {
        (v as? Number)?.let { put(key, it.toLong()) }
    }

    private fun JsonObjectBuilder.dbl(key: String, v: Any?) {
        (v as? Number)?.let { put(key, it.toDouble()) }
    }

    private fun log(o: JsonObject) {
        Log.i(TAG, o.toString())
    }
}
