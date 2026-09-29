// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class TouchPadTrackerTest {
    // A portrait layout (Game Boy) and the same buttons after a rotation
    // (Switch): the buttons move, and a different one sits where the
    // first one used to be.
    private val portraitDpad = PadRect(20f, 500f, 180f, 660f)
    private val portrait = listOf(
        PadTarget(Button.B1, PadRect(250f, 520f, 320f, 590f)),
        PadTarget(Button.B2, PadRect(330f, 520f, 400f, 590f)),
        PadTarget(Button.COIN, PadRect(120f, 700f, 180f, 736f)),
    )
    private val landscapeDpad = PadRect(30f, 150f, 170f, 290f)
    private val landscape = listOf(
        PadTarget(Button.B1, PadRect(700f, 200f, 764f, 264f)),
        PadTarget(Button.B2, PadRect(780f, 200f, 844f, 264f)),
        PadTarget(Button.COIN, PadRect(60f, 330f, 120f, 366f)),
        PadTarget(startOf(1), PadRect(250f, 520f, 320f, 590f)),
    )

    @Test
    fun dpadAndButtonAtTheSameTime() {
        val t = TouchPadTracker<Int>()
        t.down(1, portraitDpad.right - 10, portraitDpad.centerY, portraitDpad, portrait)
        t.down(2, 285f, 555f, portraitDpad, portrait)
        assertEquals(Button.RIGHT or Button.B1, t.bits)
        t.move(2, 365f, 555f, portraitDpad, portrait)
        assertEquals(Button.RIGHT or Button.B2, t.bits)
        t.up(1)
        assertEquals(Button.B2, t.bits)
        t.up(2)
        assertEquals(0, t.bits)
    }

    @Test
    fun rotationReleasesEverythingAndUsesTheNewGeometry() {
        val t = TouchPadTracker<Int>()
        t.down(1, 285f, 555f, portraitDpad, portrait)
        t.down(2, portraitDpad.centerX, portraitDpad.top + 5, portraitDpad, portrait)
        assertEquals(Button.B1 or Button.UP, t.bits)

        t.releaseAll()
        assertEquals(0, t.bits)
        assertEquals(0, t.fingerCount)

        // Old fingers still on the glass must not press the Start button
        // that now sits where button 1 was.
        assertFalse(t.move(1, 285f, 555f, landscapeDpad, landscape))
        assertFalse(t.move(2, 100f, 220f, landscapeDpad, landscape))
        assertEquals(0, t.bits)
        t.up(1)
        t.up(2)

        t.down(3, 732f, 232f, landscapeDpad, landscape)
        assertEquals(Button.B1, t.bits)
        t.down(4, landscapeDpad.left + 5, landscapeDpad.centerY, landscapeDpad, landscape)
        assertEquals(Button.B1 or Button.LEFT, t.bits)
        t.down(5, 90f, 348f, landscapeDpad, landscape)
        assertEquals(Button.B1 or Button.LEFT or Button.COIN, t.bits)
        t.releaseAll()

        t.down(6, 150f, 718f, portraitDpad, portrait)
        assertEquals(Button.COIN, t.bits)
    }

    @Test
    fun dpadThatDisappearsPressesNothing() {
        val t = TouchPadTracker<Int>()
        t.down(1, portraitDpad.centerX, portraitDpad.bottom - 5, portraitDpad, portrait)
        assertEquals(Button.DOWN, t.bits)
        t.move(1, portraitDpad.centerX, portraitDpad.bottom - 5, null, portrait)
        assertEquals(0, t.bits)
    }

    @Test
    fun overlappingSlopPicksTheNearestButton() {
        val a = PadTarget(Button.B1, PadRect(0f, 0f, 40f, 40f))
        val b = PadTarget(Button.B2, PadRect(42f, 0f, 82f, 40f))
        assertEquals(Button.B2, TouchPadTracker.hit(42f, 20f, listOf(a, b)))
        assertEquals(Button.B2, TouchPadTracker.hit(42f, 20f, listOf(b, a)))
        assertEquals(Button.B1, TouchPadTracker.hit(39f, 20f, listOf(b, a)))
        assertEquals(0, TouchPadTracker.hit(200f, 20f, listOf(a, b)))
        assertEquals(0, TouchPadTracker.hit(0f, 0f, listOf(PadTarget(Button.B3, PadRect(0f, 0f, 0f, 0f)))))
    }
}
