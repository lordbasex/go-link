// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import kotlin.math.roundToInt

/**
 * One reading of the WebRTC statistics the room's stats overlay needs,
 * taken by the platform (Android RTCStatsReport, iOS RTCStatisticsReport)
 * once a second. Counters are cumulative, as libwebrtc reports them;
 * null means the report did not have that value.
 */
data class RtcSample(
    /** When it was read, in milliseconds (any monotonic clock). */
    val atMs: Double,
    /** Inbound video: frames decoded so far and the last frame's size. */
    val framesDecoded: Long? = null,
    val frameWidth: Int? = null,
    val frameHeight: Int? = null,
    /** The codec's MIME type, like "video/VP8". */
    val videoMime: String? = null,
    /** Inbound RTP packets (video and game audio together). */
    val packetsReceived: Long? = null,
    val packetsLost: Long? = null,
    /** The game audio codec: MIME type and clock rate in Hz. */
    val audioMime: String? = null,
    val audioClockRate: Int? = null,
    /** The selected candidate pair's round trip, in seconds. */
    val rttSeconds: Double? = null,
    /** The selected pair's candidate types: host, srflx, prflx or relay. */
    val localCandidateType: String? = null,
    val remoteCandidateType: String? = null,
)

/** How the media reaches this phone: straight from the device, or through the TURN relay. */
enum class NetPath { DIRECT, RELAY, UNKNOWN }

/** What the overlay shows. null values are drawn as a dash. */
data class LiveStatsView(
    val fps: Int? = null,
    val width: Int? = null,
    val height: Int? = null,
    /** "VP8", "H264"... */
    val codec: String? = null,
    val rttMs: Int? = null,
    val path: NetPath = NetPath.UNKNOWN,
    /** Packets lost in the last interval, 0 to 100. */
    val lossPercent: Double? = null,
    /** "Opus", with the rate in kHz below. */
    val audioCodec: String? = null,
    val audioKhz: Int? = null,
)

/**
 * Turns successive [RtcSample]s into [LiveStatsView]s: the frame rate and
 * the packet loss come from the change since the previous sample, not
 * from the totals, so they describe the last second.
 */
class LiveStatsMeter {
    private var last: RtcSample? = null

    fun reset() {
        last = null
    }

    fun update(s: RtcSample): LiveStatsView {
        val prev = last
        last = s
        val dt = if (prev != null) (s.atMs - prev.atMs) / 1000.0 else 0.0
        var fps: Int? = null
        if (prev != null && dt > 0.05 && s.framesDecoded != null && prev.framesDecoded != null && s.framesDecoded >= prev.framesDecoded) {
            fps = ((s.framesDecoded - prev.framesDecoded) / dt).roundToInt()
        }
        var loss: Double? = null
        if (prev != null && s.packetsReceived != null && prev.packetsReceived != null) {
            val got = s.packetsReceived - prev.packetsReceived
            val lost = ((s.packetsLost ?: 0) - (prev.packetsLost ?: 0)).coerceAtLeast(0)
            if (got >= 0 && got + lost > 0) loss = lost * 100.0 / (got + lost)
        }
        val path = when {
            s.localCandidateType == "relay" || s.remoteCandidateType == "relay" -> NetPath.RELAY
            s.localCandidateType != null || s.remoteCandidateType != null -> NetPath.DIRECT
            else -> NetPath.UNKNOWN
        }
        return LiveStatsView(
            fps = fps,
            width = s.frameWidth?.takeIf { it > 0 },
            height = s.frameHeight?.takeIf { it > 0 },
            codec = codecName(s.videoMime),
            rttMs = s.rttSeconds?.takeIf { it >= 0 && it.isFinite() }?.let { (it * 1000).roundToInt() },
            path = path,
            lossPercent = loss,
            audioCodec = codecName(s.audioMime),
            audioKhz = s.audioClockRate?.takeIf { it > 0 }?.let { (it / 1000.0).roundToInt() },
        )
    }

    companion object {
        /** "video/VP8" -> "VP8", "audio/opus" -> "Opus". */
        fun codecName(mime: String?): String? {
            val name = mime?.substringAfter('/')?.trim()?.take(16)?.takeIf { it.isNotEmpty() } ?: return null
            return if (name.equals("opus", ignoreCase = true)) "Opus" else name.uppercase()
        }

        /** Loss as the overlay prints it: "0", "0.4", "12". */
        fun formatLoss(p: Double): String = when {
            p <= 0.0 -> "0"
            p < 10 -> ((p * 10).roundToInt() / 10.0).toString().removeSuffix(".0")
            else -> p.roundToInt().toString()
        }
    }
}

/**
 * Input latency on the controller test screen: the time from an input
 * event to the next frame drawn after it. Keeps the last [window]
 * readings for the minimum and the average.
 */
class LatencyMeter(private val window: Int = 60) {
    private val values = ArrayDeque<Double>()

    val last: Double? get() = values.lastOrNull()
    val min: Double? get() = values.minOrNull()
    val average: Double? get() = if (values.isEmpty()) null else values.sum() / values.size
    val count: Int get() = values.size

    /** Adds one reading in milliseconds; negative or absurd values (over 1 s) are ignored. */
    fun add(ms: Double) {
        if (!ms.isFinite() || ms < 0 || ms > 1000) return
        values.addLast(ms)
        while (values.size > window) values.removeFirst()
    }

    fun reset() = values.clear()
}
