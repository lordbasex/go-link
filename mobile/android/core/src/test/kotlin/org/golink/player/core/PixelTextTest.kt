// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PixelTextTest {
    @Test
    fun insertCoinHasSevenRowsAndTheExpectedWidth() {
        val rows = PixelText.rows("INSERT COIN")
        assertEquals(7, rows.size)
        // 10 letters x 5 columns, 10 gaps, a 3-column space.
        assertEquals(10 * 5 + 10 + 3, rows[0].size)
        rows.forEach { assertEquals(rows[0].size, it.size) }
    }

    @Test
    fun pixelsMatchTheGlyphs() {
        val rows = PixelText.rows("IN")
        // I: full top and bottom bar, middle column.
        assertTrue((0 until 5).all { rows[0][it] })
        assertTrue(rows[3][2])
        assertFalse(rows[3][0])
        // The gap column after I.
        assertTrue(rows.none { it[5] })
        // N: diagonal pixel at row 3, column 2 of the glyph.
        assertTrue(rows[3][6 + 2])
        assertTrue(rows[2][6 + 1])
        assertFalse(rows[0][6 + 1])
    }
}
