// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import kotlinx.serialization.json.JsonObject

/**
 * How the device sends a game's picture (docs/protocol.md, Video scale; the
 * website's packages/shared/src/video.ts). Game rooms may send it enlarged
 * 2x with nearest neighbour (every game pixel as a 2x2 block, so each keeps
 * its own color in VP8); the device says so in stream_stats "video", and
 * the picture renderer averages each block back to one game pixel before
 * any style. The iOS app keeps the same in GoLinkCore StreamVideo.swift.
 */
enum class VideoQuality(val key: String) {
    HIGH("high"),
    NORMAL("normal"),
    SAVER("saver"),
    ;

    companion object {
        fun of(v: String?): VideoQuality? = entries.firstOrNull { it.key == v }
    }
}

/** A size in pixels. */
data class PixelSize(val w: Int, val h: Int)

/** stream_stats "video": the picture being sent. */
data class StreamVideo(
    /** 2 when the frames are the game's picture enlarged 2x, else 1. */
    val scale: Int,
    /** The game's own size in pixels (the frames are scale times larger). */
    val width: Int,
    val height: Int,
    /** Game rooms: the quality in use. */
    val quality: VideoQuality? = null,
    /** "cpu" when the quality in use is lower than the host's choice (this computer could not keep up with 2x). */
    val fallback: String? = null,
) {
    /** The game's size when the frames are 2x (what the renderer averages back to); null at scale 1. */
    val native: PixelSize? get() = if (scale == 2) PixelSize(width, height) else null

    companion object {
        /** Reads the "video" of a stream_stats message; null when absent or broken (older devices: scale 1). */
        fun parse(m: JsonObject): StreamVideo? {
            if (m["type"].str(40) != "stream_stats") return null
            val v = m["video"] as? JsonObject ?: return null
            fun size(key: String): Int {
                if (!v[key].isNumber()) return 0
                val d = v[key].num()
                return if (d == Math.rint(d) && d > 0 && d <= 4096) d.toInt() else 0
            }
            val scale = if (v["scale"].isNumber()) v["scale"].num() else 0.0
            val w = size("width")
            val h = size("height")
            if ((scale != 1.0 && scale != 2.0) || w <= 0 || h <= 0) return null
            return StreamVideo(
                scale = scale.toInt(),
                width = w,
                height = h,
                quality = VideoQuality.of(v["quality"].strOrNull()),
                fallback = if (v["fallback"].strOrNull() == "cpu") "cpu" else null,
            )
        }
    }
}

/** The texture every style reads, and whether the frame must be averaged down to it first. */
data class WorkingSize(val w: Int, val h: Int, val down: Boolean)

/**
 * The website's workingSize (renderer.ts): a frame exactly twice the
 * game's size is averaged back to the game's size; any other frame (scale
 * 1, or an old size during a quality change) is drawn as it is.
 */
fun workingSize(frameW: Int, frameH: Int, native: PixelSize?): WorkingSize =
    if (native != null && native.w > 0 && native.h > 0 && frameW == native.w * 2 && frameH == native.h * 2) {
        WorkingSize(native.w, native.h, true)
    } else {
        WorkingSize(frameW, frameH, false)
    }
