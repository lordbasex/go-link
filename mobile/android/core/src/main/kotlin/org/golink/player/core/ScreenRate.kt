// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * The screen's refresh rate: which display mode to ask for (the fastest
 * one at the current resolution) and how fast the screen really draws,
 * measured from the frame callbacks (Choreographer on Android,
 * CADisplayLink on iOS). The iOS app's ScreenRate.swift is a port of it.
 */
object ScreenRate {
    /** A display mode as the platform lists it (Display.Mode). */
    data class Mode(val id: Int, val width: Int, val height: Int, val refreshHz: Float)

    /**
     * The mode with the current mode's resolution (in either orientation)
     * and the highest refresh rate. A tie, or no faster mode, keeps the
     * current one, so asking for it never changes the resolution.
     */
    fun fastest(modes: List<Mode>, current: Mode): Mode {
        var best = current
        for (m in modes) {
            val same = (m.width == current.width && m.height == current.height) || (m.width == current.height && m.height == current.width)
            if (same && m.refreshHz > best.refreshHz + 0.5f) best = m
        }
        return best
    }

    /** Common panel rates: a measurement within 3 % of one of them is that rate. */
    val commonRates = listOf(24, 25, 30, 48, 50, 60, 72, 75, 90, 96, 100, 120, 144, 165, 240)

    /** A measured rate as a whole number, snapped to a common panel rate when it is close. */
    fun snap(hz: Double): Int? {
        if (!hz.isFinite() || hz < 1) return null
        val near = commonRates.minBy { abs(it - hz) }
        return if (abs(near - hz) <= near * 0.03) near else hz.roundToInt()
    }

    /** "120 Hz", or a dash while there is no reading. */
    fun label(hz: Int?): String = if (hz != null && hz > 0) "$hz Hz" else "–"

    /** One screen frame in milliseconds, as the test screen prints it: "8.3", "16.7". */
    fun frameMs(hz: Int?): String = if (hz != null && hz > 0) String.format(Locale.ROOT, "%.1f", 1000.0 / hz) else "–"
}

/**
 * Measures the screen's refresh rate from frame timestamps (in seconds):
 * the median time between frames over about a second, so a missed frame
 * (the app was busy) does not read as a slower screen.
 */
class RefreshRateMeter(private val window: Double = 1.0) {
    private var start: Double? = null
    private var last: Double? = null
    private val intervals = ArrayList<Double>()

    fun reset() {
        start = null
        last = null
        intervals.clear()
    }

    /** Adds one frame; returns a reading each time a window is complete. */
    fun frame(t: Double): Int? {
        val prev = last
        last = t
        if (prev == null) {
            start = t
            return null
        }
        val dt = t - prev
        // A pause (the app in the background, a long hitch) starts over.
        if (dt <= 0 || dt > 0.25) {
            start = t
            intervals.clear()
            return null
        }
        intervals.add(dt)
        val s = start ?: return null
        if (t - s < window || intervals.size < 5) return null
        val median = intervals.sorted()[intervals.size / 2]
        start = t
        intervals.clear()
        return ScreenRate.snap(1 / median)
    }
}
