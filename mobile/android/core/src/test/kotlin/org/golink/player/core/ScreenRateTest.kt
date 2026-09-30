// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ScreenRateTest {
    @Test
    fun fastestKeepsTheResolution() {
        val current = ScreenRate.Mode(1, 1080, 2400, 60f)
        val modes = listOf(
            current,
            ScreenRate.Mode(2, 1080, 2400, 90f),
            ScreenRate.Mode(3, 1440, 3200, 144f),
            ScreenRate.Mode(4, 2400, 1080, 120f),
        )
        assertEquals(4, ScreenRate.fastest(modes, current).id)
    }

    @Test
    fun fastestKeepsTheCurrentModeOnATie() {
        val current = ScreenRate.Mode(7, 1080, 2400, 120f)
        val other = ScreenRate.Mode(8, 1080, 2400, 120.2f)
        assertEquals(7, ScreenRate.fastest(listOf(other, current), current).id)
        assertEquals(7, ScreenRate.fastest(emptyList(), current).id)
    }

    @Test
    fun snapAndLabels() {
        assertEquals(120, ScreenRate.snap(118.9))
        assertEquals(60, ScreenRate.snap(59.94))
        assertEquals(144, ScreenRate.snap(143.2))
        assertEquals(110, ScreenRate.snap(110.4))
        assertNull(ScreenRate.snap(Double.NaN))
        assertNull(ScreenRate.snap(0.0))
        assertEquals("120 Hz", ScreenRate.label(120))
        assertEquals("–", ScreenRate.label(null))
        assertEquals("8.3", ScreenRate.frameMs(120))
        assertEquals("16.7", ScreenRate.frameMs(60))
        assertEquals("–", ScreenRate.frameMs(0))
    }

    @Test
    fun meterReadsTheMedianRate() {
        val m = RefreshRateMeter()
        var t = 10.0
        var reading: Int? = null
        for (i in 0 until 130) {
            // A missed frame now and then must not lower the reading.
            t += if (i % 20 == 19) 2.0 / 120 else 1.0 / 120
            m.frame(t)?.let { reading = it }
        }
        assertEquals(120, reading)
    }

    @Test
    fun meterStartsOverAfterAPause() {
        val m = RefreshRateMeter()
        var t = 0.0
        repeat(50) { t += 1.0 / 60; assertNull(m.frame(t)) }
        t += 5 // the app was in the background
        var reading: Int? = null
        repeat(70) { t += 1.0 / 60; m.frame(t)?.let { reading = it } }
        assertEquals(60, reading)
    }
}
