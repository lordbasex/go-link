// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import kotlin.math.hypot
import kotlin.math.max

/** A rectangle in screen (root) pixels, independent of the UI toolkit. */
data class PadRect(val left: Float, val top: Float, val right: Float, val bottom: Float) {
    val width get() = right - left
    val height get() = bottom - top
    val centerX get() = (left + right) / 2
    val centerY get() = (top + bottom) / 2
    val isEmpty get() = width <= 0f || height <= 0f

    fun contains(x: Float, y: Float, slop: Float = 0f): Boolean =
        x >= left - slop && x < right + slop && y >= top - slop && y < bottom + slop
}

/** A drawn pad button and where it is right now. */
data class PadTarget(val bit: Int, val rect: PadRect)

/**
 * The fingers on the on-screen gamepad (the iOS app's TouchPadTracker):
 * several at once (the D-pad and a button together), and a finger can
 * slide from one button to the next, as on an arcade panel.
 *
 * It keeps no geometry: every event gets the buttons' bounds as they are
 * at that moment. When the layout changes (a rotation), [releaseAll] drops
 * every finger (held buttons go back to 0) and later events of those
 * fingers are ignored until they are lifted, so a finger held across a
 * rotation never lands on whatever button now sits under it.
 */
class TouchPadTracker<F> {
    var fourWay = false
    private val fingers = HashMap<F, Int>()
    private val dpadFingers = HashMap<F, Int>()

    /** The buttons held by all fingers. */
    val bits: Int
        get() {
            var b = 0
            dpadFingers.values.forEach { b = b or it }
            fingers.values.forEach { b = b or it }
            return b
        }

    val fingerCount get() = fingers.size + dpadFingers.size

    fun down(finger: F, x: Float, y: Float, dpad: PadRect?, buttons: List<PadTarget>) {
        fingers.remove(finger)
        dpadFingers.remove(finger)
        if (dpad != null && dpad.contains(x, y, DPAD_SLOP)) {
            dpadFingers[finger] = dpadBits(dpad, x, y, fourWay)
        } else {
            fingers[finger] = hit(x, y, buttons)
        }
    }

    /** Returns false when the finger is not tracked (lifted, or dropped by a layout change). */
    fun move(finger: F, x: Float, y: Float, dpad: PadRect?, buttons: List<PadTarget>): Boolean {
        if (finger in dpadFingers) {
            // A thumb that started on the D-pad keeps steering it; if the
            // D-pad is gone, the thumb presses nothing.
            dpadFingers[finger] = if (dpad != null) dpadBits(dpad, x, y, fourWay) else 0
            return true
        }
        if (finger in fingers) {
            fingers[finger] = hit(x, y, buttons)
            return true
        }
        return false
    }

    fun up(finger: F) {
        fingers.remove(finger)
        dpadFingers.remove(finger)
    }

    /** Lets go of everything: the layout changed or the pad went away. */
    fun releaseAll() {
        fingers.clear()
        dpadFingers.clear()
    }

    companion object {
        /** Extra room around a button that still counts as a press (px). */
        const val BUTTON_SLOP = 4f

        /** Extra room around the D-pad that still starts a direction (px). */
        const val DPAD_SLOP = 8f

        /**
         * The button under a point. Where slop areas overlap, the button
         * whose center is nearest wins, so the result never depends on
         * ordering.
         */
        fun hit(x: Float, y: Float, buttons: List<PadTarget>): Int {
            var best = 0
            var bestDistance = Float.POSITIVE_INFINITY
            for (b in buttons) {
                if (b.rect.isEmpty || !b.rect.contains(x, y, BUTTON_SLOP)) continue
                val d = hypot(x - b.rect.centerX, y - b.rect.centerY)
                if (d < bestDistance) {
                    bestDistance = d
                    best = b.bit
                }
            }
            return best
        }

        fun dpadBits(d: PadRect, x: Float, y: Float, fourWay: Boolean): Int {
            val radius = max(d.width, d.height) / 2
            if (radius <= 0f) return 0
            return TouchPadLogic.dpadBits(((x - d.centerX) / radius).toDouble(), ((y - d.centerY) / radius).toDouble(), fourWay)
        }
    }
}
