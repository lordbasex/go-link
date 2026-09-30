// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import kotlin.math.abs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PictureTest {
    private val eps = 1e-6

    @Test
    fun fitsThePictureWithoutCroppingAtItsAspect() {
        val sizes = listOf(1920 to 1080, 3840 to 2160, 390 to 844, 844 to 390, 1200 to 900, 333 to 777, 2560 to 1080, 1 to 1)
        val aspects = listOf(4.0 / 3, 3.0 / 4, 16.0 / 9, 384.0 / 224, 1.0, 2.5)
        for ((w, h) in sizes) for (a in aspects) for (inset in listOf(0.0, 12.0)) {
            val r = PictureLayout.fitRect(w.toDouble(), h.toDouble(), a, inset)
            assertTrue(r.x >= -eps && r.y >= -eps)
            assertTrue(r.x + r.w <= w + eps && r.y + r.h <= h + eps)
            if (r.w > 0) {
                assertEquals(a, r.w / r.h, 1e-6)
                // As large as possible: it touches the sides or the top and bottom.
                val aw = w - 2 * inset
                val ah = h - 2 * inset
                assertTrue(abs(r.w - aw) < eps || abs(r.h - ah) < eps)
                // Centered.
                assertEquals(w / 2.0, r.x + r.w / 2, 1e-6)
                assertEquals(h / 2.0, r.y + r.h / 2, 1e-6)
            }
        }
    }

    @Test
    fun letterboxesAndPillarboxes() {
        assertEquals(PictureLayout.Rect(240.0, 0.0, 1440.0, 1080.0), PictureLayout.fitRect(1920.0, 1080.0, 4.0 / 3))
        val tall = PictureLayout.fitRect(390.0, 844.0, 4.0 / 3)
        assertEquals(0.0, tall.x, 0.0)
        assertEquals(390.0, tall.w, 0.0)
        assertEquals(292.5, tall.h, 1e-9)
    }

    @Test
    fun emptyRectangleForAnEmptyAreaOrABrokenAspect() {
        assertEquals(0.0, PictureLayout.fitRect(0.0, 100.0, 4.0 / 3).w, 0.0)
        assertEquals(0.0, PictureLayout.fitRect(100.0, 100.0, 0.0).w, 0.0)
        assertEquals(0.0, PictureLayout.fitRect(100.0, 100.0, Double.NaN).w, 0.0)
        assertEquals(0.0, PictureLayout.fitRect(100.0, 100.0, Double.POSITIVE_INFINITY).w, 0.0)
        assertEquals(PictureLayout.Rect(50.0, 50.0, 0.0, 0.0), PictureLayout.fitRect(100.0, 100.0, -1.0))
    }

    @Test
    fun keepsTheFrameBezelThinScaledByThePixelRatio() {
        assertEquals(36, PictureLayout.frameInset(1920.0, 1080.0, 1.0))
        assertEquals(24, PictureLayout.frameInset(390.0, 292.0, 3.0))
        assertEquals(8, PictureLayout.frameInset(300.0, 200.0, 1.0))
    }

    @Test
    fun scalesAndPrescales() {
        val r = PictureLayout.fitRect(1920.0, 1080.0, 4.0 / 3)
        val (sx, sy) = PictureLayout.scaleOf(r, 384, 224)
        assertEquals(1440.0 / 384, sx, 1e-9)
        assertEquals(1080.0 / 224, sy, 1e-9)
        assertEquals(1.0 to 1.0, PictureLayout.scaleOf(r, 0, 0))
        assertEquals(4, PictureLayout.prescale(1440.0, 384))
        assertEquals(1, PictureLayout.prescale(100.0, 384))
        assertEquals(8, PictureLayout.prescale(3840.0 * 2, 384))
        assertEquals(1, PictureLayout.prescale(100.0, 0))
    }

    @Test
    fun keepsTheCompareLineInside() {
        assertEquals(0.02, PictureLayout.clampSplit(-1.0), 0.0)
        assertEquals(0.98, PictureLayout.clampSplit(2.0), 0.0)
        assertEquals(0.4, PictureLayout.clampSplit(0.4), 0.0)
        assertEquals(0.5, PictureLayout.clampSplit(Double.NaN), 0.0)
    }

    @Test
    fun defaultsToSmoothWithAmbientSides() {
        assertEquals(Picture(PictureStyle.SMOOTH, PictureBands.AMBIENT), PictureSettings.parse(null, null))
        assertEquals(PictureSettings.DEFAULT, PictureSettings.parse(null, null))
    }

    @Test
    fun remembersTheChoiceAndIgnoresUnknownValues() {
        val store = MemoryStore()
        PictureSettings.write(store, Picture(PictureStyle.CRT, PictureBands.FRAME))
        assertEquals("crt", store.get(PictureSettings.STYLE_KEY))
        assertEquals("frame", store.get(PictureSettings.BANDS_KEY))
        assertEquals(Picture(PictureStyle.CRT, PictureBands.FRAME), PictureSettings.read(store))
        store.set(PictureSettings.STYLE_KEY, "vaporwave")
        store.set(PictureSettings.BANDS_KEY, "<script>")
        assertEquals(PictureSettings.DEFAULT, PictureSettings.read(store))
    }

    @Test
    fun theViewersChoiceWinsThenTheRoomsThenTheApps() {
        val room = Picture(PictureStyle.CRT, PictureBands.FRAME)
        assertEquals(room, PictureSettings.resolve(SavedPicture(), room))
        assertEquals(PictureSettings.DEFAULT, PictureSettings.resolve(SavedPicture(), null))
        assertEquals(Picture(PictureStyle.SHARP, PictureBands.FRAME), PictureSettings.resolve(SavedPicture(style = PictureStyle.SHARP), room))
        assertEquals(Picture(PictureStyle.CRT, PictureBands.BLACK), PictureSettings.resolve(SavedPicture(bands = PictureBands.BLACK), room))
        val store = MemoryStore()
        assertFalse(PictureSettings.readSaved(store).chosen)
        assertEquals(room, PictureSettings.read(store, room))
        PictureSettings.write(store, Picture(PictureStyle.EDGES, PictureBands.BLACK))
        assertTrue(PictureSettings.readSaved(store).chosen)
        assertEquals(Picture(PictureStyle.EDGES, PictureBands.BLACK), PictureSettings.read(store, room))
        PictureSettings.clear(store)
        assertNull(store.get(PictureSettings.STYLE_KEY))
        assertEquals(room, PictureSettings.read(store, room))
    }

    @Test
    fun parsesARoomsDefaultOnlyWhenBothValuesAreKnown() {
        assertEquals(Picture(PictureStyle.SHARP, PictureBands.BLACK), PictureSettings.parseRoom("sharp", "black"))
        assertNull(PictureSettings.parseRoom("sharp", null))
        assertNull(PictureSettings.parseRoom("vaporwave", "black"))
        assertNull(PictureSettings.parseRoom(null, null))
    }

    @Test
    fun keysAndCodesMatchTheWebsite() {
        assertEquals(listOf("smooth", "sharp", "crt", "edges"), PictureStyle.entries.map { it.key })
        assertEquals(listOf(0, 1, 2, 3), PictureStyle.entries.map { it.code })
        assertEquals(listOf("black", "ambient", "frame"), PictureBands.entries.map { it.key })
        assertEquals(listOf(0, 1, 2), PictureBands.entries.map { it.code })
        assertEquals("go-link.picture-style", PictureSettings.STYLE_KEY)
        assertEquals("go-link.picture-bands", PictureSettings.BANDS_KEY)
    }

    private class MemoryStore : KeyValueStore {
        private val map = HashMap<String, String>()
        override fun get(key: String): String? = map[key]
        override fun set(key: String, value: String?) {
            if (value == null) map.remove(key) else map[key] = value
        }
    }
}
