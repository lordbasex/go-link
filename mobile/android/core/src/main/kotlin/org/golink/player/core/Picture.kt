// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * How this phone draws the game (the website's picture styles, same
 * names and shader codes): a choice of each viewer, never sent to the
 * device or to the other players.
 */
enum class PictureStyle(val key: String, val code: Int) {
    SMOOTH("smooth", 0),
    SHARP("sharp", 1),
    CRT("crt", 2),
    EDGES("edges", 3),
    ;

    companion object {
        fun of(key: String?): PictureStyle? = entries.firstOrNull { it.key == key }
    }
}

/** What fills the sides of the picture: black, the game's colors blurred, or an arcade cabinet. */
enum class PictureBands(val key: String, val code: Int) {
    BLACK("black", 0),
    AMBIENT("ambient", 1),
    FRAME("frame", 2),
    ;

    companion object {
        fun of(key: String?): PictureBands? = entries.firstOrNull { it.key == key }
    }
}

/** One viewer's picture settings. */
data class Picture(val style: PictureStyle, val bands: PictureBands)

/** The viewer's own choice, as far as it goes (null = not chosen). */
data class SavedPicture(val style: PictureStyle? = null, val bands: PictureBands? = null) {
    val chosen: Boolean get() = style != null || bands != null
}

/**
 * How the phone draws the game (the website's picture/settings.ts): the
 * viewer's own choice wins, field by field; a viewer who never chose gets
 * the room's default, set by its host (room_state.picture), else the
 * app's default.
 */
object PictureSettings {
    /** The same keys as the website's localStorage and the iOS app's UserDefaults. */
    const val STYLE_KEY = "go-link.picture-style"
    const val BANDS_KEY = "go-link.picture-bands"

    /** The apps' default, like the website's: smooth, with the game's colors glowing beside it. */
    val DEFAULT_STYLE = PictureStyle.SMOOTH
    val DEFAULT_BANDS = PictureBands.AMBIENT

    val DEFAULT = Picture(DEFAULT_STYLE, DEFAULT_BANDS)

    /** The stored values, with the defaults for anything missing or unknown. */
    fun parse(style: String?, bands: String?): Picture = resolve(SavedPicture(PictureStyle.of(style), PictureBands.of(bands)), null)

    /** A room's default ({style, bands}): null when absent or when either value is unknown. */
    fun parseRoom(style: String?, bands: String?): Picture? {
        val s = PictureStyle.of(style) ?: return null
        val b = PictureBands.of(bands) ?: return null
        return Picture(s, b)
    }

    /** Who wins: the viewer's own choice, then the room's default, then the app's. */
    fun resolve(saved: SavedPicture, room: Picture?): Picture {
        val base = room ?: DEFAULT
        return Picture(saved.style ?: base.style, saved.bands ?: base.bands)
    }

    fun readSaved(store: KeyValueStore): SavedPicture =
        SavedPicture(PictureStyle.of(store.get(STYLE_KEY)), PictureBands.of(store.get(BANDS_KEY)))

    /** The picture this viewer sees in a room with that default (none: the app's). */
    fun read(store: KeyValueStore, room: Picture? = null): Picture = resolve(readSaved(store), room)

    /** The viewer picked a picture: both values are kept, so it wins over any room's default. */
    fun write(store: KeyValueStore, picture: Picture) {
        store.set(STYLE_KEY, picture.style.key)
        store.set(BANDS_KEY, picture.bands.key)
    }

    /** Forgets the viewer's own choice: the room's default, or the app's, applies again. */
    fun clear(store: KeyValueStore) {
        store.set(STYLE_KEY, null)
        store.set(BANDS_KEY, null)
    }
}

/**
 * Where the picture goes inside the area the renderer draws (the
 * website's layout.ts): the largest rectangle with the game's display
 * aspect that fits, centered. It never crops.
 */
object PictureLayout {
    data class Rect(val x: Double, val y: Double, val w: Double, val h: Double)

    /** The largest rectangle of the given aspect (width / height) inside w x h, centered. */
    fun fitRect(w: Double, h: Double, aspect: Double, inset: Double = 0.0): Rect {
        val aw = max(0.0, w - 2 * inset)
        val ah = max(0.0, h - 2 * inset)
        if (aw <= 0 || ah <= 0 || !(aspect > 0) || aspect.isInfinite()) return Rect(w / 2, h / 2, 0.0, 0.0)
        var pw = aw
        var ph = aw / aspect
        if (ph > ah) {
            ph = ah
            pw = ah * aspect
        }
        return Rect((w - pw) / 2, (h - ph) / 2, pw, ph)
    }

    /** The Frame sides' bezel, in screen pixels: thin, and always shown. */
    fun frameInset(w: Double, h: Double, dpr: Double): Int =
        min(max(min(w, h) * 0.035, 8 * dpr), 36 * dpr).roundToInt()

    /** Output pixels per source pixel, per axis (how much the game is enlarged). */
    fun scaleOf(rect: Rect, srcW: Int, srcH: Int): Pair<Double, Double> =
        Pair(if (srcW > 0) rect.w / srcW else 1.0, if (srcH > 0) rect.h / srcH else 1.0)

    /** Smooth edges' enlargement of one axis: an integer, at least the final scale, at most 8. */
    fun prescale(rectLen: Double, srcLen: Int): Int {
        if (srcLen <= 0 || rectLen.isNaN()) return 1
        return min(MAX_PRESCALE, max(1, ceil(rectLen / srcLen).toInt()))
    }

    /** The Compare line stays a little inside the picture, like the website's divider. */
    fun clampSplit(v: Double): Double = if (v.isNaN()) 0.5 else min(0.98, max(0.02, v))

    const val MAX_PRESCALE = 8
}
