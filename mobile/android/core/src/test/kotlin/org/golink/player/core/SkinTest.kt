// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File

/** Mirrors the iOS app's SkinTests (GoLinkCore). */
class SkinTest {
    /** The apps' built-in skin files (docs/skins/builtin, shared with iOS). */
    private fun builtIn(): List<SkinCatalog.File> {
        var dir = File(System.getProperty("user.dir")).absoluteFile
        while (!File(dir, "docs/skins/builtin").isDirectory) dir = dir.parentFile ?: error("docs/skins/builtin not found")
        return File(dir, "docs/skins/builtin").listFiles { f -> f.extension == "json" }!!.sortedBy { it.name }
            .map { SkinCatalog.File(it.name, it.readText()) }
    }

    private val minimal = """{"format":1,"id":"mine","name":{"en":"Mine"},"shell":{"center":"#112233","edge":"#000000","rim":"#ffffff"}}"""

    private fun with(extra: String) = minimal.replace("\"format\":1", "\"format\":1,$extra")

    private fun refuses(text: String) {
        try {
            PadSkin.parse(text)
            fail("parsed: $text")
        } catch (_: SkinException) {
        }
    }

    @Test fun everyBuiltInSkinLoads() {
        val files = builtIn()
        assertTrue(files.size >= 6)
        val catalog = SkinCatalog(files)
        assertEquals(emptyList<String>(), catalog.skipped)
        assertEquals(files.size, catalog.skins.size)
        for ((f, skin) in files.zip(catalog.skins)) {
            assertEquals("skin-${skin.id}.json", f.name)
            for (lang in listOf("en", "es", "pt")) assertNotNull("${skin.id} $lang", skin.names[lang])
            assertTrue(skin.landscape.isNotEmpty())
            assertTrue(skin.portrait.isNotEmpty())
            assertNotNull(skin.portraitPlacement)
            assertNotNull(skin.landscapePlacement)
            assertEquals("under the picture, the menu stays", false, skin.portraitPlacement?.menuHides)
            assertEquals("over the picture, it folds away", true, skin.landscapePlacement?.menuHides)
        }
    }

    @Test fun minimalSkinTakesDefaults() {
        val s = PadSkin.parse(minimal)
        assertEquals("mine", s.id)
        assertEquals(0x112233, s.center)
        assertEquals(PadSkin.Controls.DARK, s.controls)
        assertEquals(0x07080C, s.bezel)
        assertTrue(s.rings)
        assertEquals(emptyList<PadSkin.Decor>(), s.landscape)
        assertEquals("Mine", s.name("es"))
    }

    @Test fun refusesBrokenFiles() {
        refuses("nope")
        refuses(minimal.replace("\"format\":1", "\"format\":2"))
        refuses(minimal.replace("mine", "classic"))
        refuses(minimal.replace("mine", "Bad Id"))
        refuses(minimal.replace("#112233", "blue"))
        refuses(with("\"controls\":\"neon\""))
        refuses(with("\"decor\":{\"portrait\":[{\"shape\":\"star\",\"x\":0,\"y\":0,\"w\":1,\"h\":1}]}"))
    }

    @Test fun clampsNumbersAndIgnoresUnknownKeys() {
        val s = PadSkin.parse(with("\"future\":{\"x\":1},\"decor\":{\"landscape\":[{\"shape\":\"rect\",\"x\":-1,\"y\":2,\"w\":0.5,\"h\":0.5,\"radius\":999,\"opacity\":5}]}"))
        val d = s.landscape.first()
        assertEquals(0.0, d.x, 0.0)
        assertEquals(1.0, d.y, 0.0)
        assertEquals(60.0, d.radius, 0.0)
        assertEquals(1.0, d.opacity, 0.0)
    }

    @Test fun styleColorsFallBackToTheTone() {
        val s = PadSkin.parse(with("\"controls\":\"light\",\"style\":{\"menu\":{\"fill\":\"#ff0000\",\"fillOpacity\":0.9},\"controls\":{\"lit\":\"#00ff00\"}}"))
        assertEquals(0xFF0000, s.menuStyle.fill)
        assertEquals(0.9, s.menuStyle.fillOpacity, 0.0)
        assertEquals(PadSkin.MenuStyle().icon, s.menuStyle.icon)
        assertEquals(0x00FF00, s.colors.lit)
        assertNull("a held control only sinks unless the skin asks for a tint", PadSkin.tone(PadSkin.Controls.DARK).lit)
        assertNull(PadSkin.tone(PadSkin.Controls.LIGHT).lit)
        assertEquals(PadSkin.tone(PadSkin.Controls.LIGHT).face, s.colors.face)
        assertNull(PadSkin.parse(minimal).palette)
        refuses(with("\"style\":{\"menu\":{\"fill\":\"red\"}}"))
    }

    @Test fun controlDesignDefaultsAndValues() {
        val plain = PadSkin.parse(minimal)
        assertEquals("an old skin keeps round, flat buttons and the arrow D-pad", PadSkin.ControlDesign(), plain.design)
        val s = PadSkin.parse(with("\"style\":{\"controls\":{\"shape\":\"hexagon\",\"ring\":0.9,\"labels\":\"letters\",\"dome\":0.7,\"well\":{\"size\":0.2,\"depth\":2,\"color\":\"#101010\"},\"dpad\":{\"arm\":0.3,\"radius\":0.25,\"marks\":\"lines\"}}}"))
        assertEquals(PadSkin.ButtonShape.HEXAGON, s.design.shape)
        assertEquals("clamped", 0.25, s.design.ring, 0.0)
        assertEquals("A", s.design.label(1))
        assertEquals("F", s.design.label(6))
        assertEquals(0.7, s.design.dome, 0.0)
        assertEquals(0.2, s.design.well!!.size, 0.0)
        assertEquals("clamped", 1.0, s.design.well!!.depth, 0.0)
        assertEquals(0x101010, s.design.well!!.color)
        assertEquals(0.3, s.design.dpadArm, 0.0)
        assertEquals(PadSkin.DpadMarks.LINES, s.design.dpadMarks)
        for (bad in listOf("\"shape\":\"star\"", "\"labels\":\"roman\"", "\"well\":true", "\"dpad\":{\"marks\":\"stars\"}")) refuses(with("\"style\":{\"controls\":{$bad}}"))
    }

    @Test fun backgroundPicturesStayNextToTheFile() {
        val withPictures = with("\"background\":{\"portrait\":\"p.png\",\"landscape\":\"l.jpg\"}")
        val s = PadSkin.parse(withPictures)
        assertEquals("p.png", s.backgroundPortrait)
        assertEquals("l.jpg", s.backgroundLandscape)
        for (bad in listOf("../x.png", "/etc/x.png", "a/b.png", ".hidden.png", "x.svg", "x.gif", "")) refuses(withPictures.replace("p.png", bad))
        val inFolder = SkinCatalog(listOf(SkinCatalog.File("skin.json", withPictures, "/skins/mine")))
        assertEquals("/skins/mine", inFolder.skins.first().folder)
        assertEquals("p.png", inFolder.skins.first().backgroundPortrait)
        val bare = SkinCatalog(listOf(SkinCatalog.File("mine.json", withPictures)))
        assertNull("a bare file has no folder for its pictures", bare.skins.first().backgroundPortrait)
    }

    @Test fun catalogSkipsBadFilesAndRepeatedIds() {
        val c = SkinCatalog(listOf(SkinCatalog.File("a.json", minimal), SkinCatalog.File("b.json", "{}"), SkinCatalog.File("c.json", minimal)))
        assertEquals(listOf("mine"), c.skins.map { it.id })
        assertEquals(listOf("b.json"), c.skipped)
        val store = MemoryStore()
        assertEquals("without Smoke, the first skin", "mine", c.selected(store)?.id)
        store.set(PadSkin.PREF_KEY, "mine")
        assertEquals("mine", c.selected(store)?.id)
        store.set(PadSkin.PREF_KEY, "gone")
        assertEquals("a removed skin falls back to the default", "mine", c.selected(store)?.id)
        assertNull("no skins at all: the plain pad", SkinCatalog(emptyList()).selected(store))
        val builtIn = SkinCatalog(builtIn())
        store.set(PadSkin.PREF_KEY, null)
        assertEquals("Smoke until the player chooses", PadSkin.DEFAULT_ID, builtIn.selected(store)?.id)
        store.set(PadSkin.PREF_KEY, PadSkin.CLASSIC_ID)
        assertEquals("the old Classic choice becomes Smoke", PadSkin.DEFAULT_ID, builtIn.selected(store)?.id)
    }

    @Test fun placementNeedsEveryPart() {
        val base = """{"format":1,"id":"p","name":{"en":"P"},"shell":{"center":"#112233","edge":"#000000","rim":"#ffffff"},"layout":{"portrait":{"canvas":{"w":400,"h":800},"screen":{"x":0,"y":0,"w":400,"h":300},"dpad":{"x":0,"y":400,"w":150,"h":150},"buttons":{"x":200,"y":400,"w":180,"h":180},"coin":{"x":0,"y":700,"w":58,"h":34},"starts":{"x":100,"y":700,"w":200,"h":34},"header":{"x":0,"y":0,"w":44,"h":44},"menu":{"x":0,"y":320,"w":400,"h":50,"direction":"column"}}}}"""
        val ok = PadSkin.parse(base)
        assertEquals(true, ok.portraitPlacement?.menuVertical)
        assertEquals(false, ok.portraitPlacement?.menuHides)
        assertNull("a missing orientation uses the automatic placement", ok.landscapePlacement)
        refuses(base.replace("\"coin\":{\"x\":0,\"y\":700,\"w\":58,\"h\":34},", ""))
        refuses(base.replace("\"direction\":\"column\"", "\"direction\":\"diagonal\""))
        refuses(base.replace("\"w\":400,\"h\":800", "\"w\":0,\"h\":800"))
    }

    /** Phones and tablets, both orientations: everything on screen, nothing overlapping, the picture whole. */
    @Test fun layoutFitsAndNeverOverlaps() {
        val skin = PadSkin.parse(builtIn().first().text)
        val screens = listOf(
            // Android phones (dp) with their system bars, and tablets.
            Triple(412.0, 915.0, SkinInsets(top = 24.0, bottom = 48.0)),
            Triple(915.0, 412.0, SkinInsets(top = 24.0, left = 0.0, bottom = 0.0, right = 48.0)),
            Triple(360.0, 640.0, SkinInsets(top = 24.0)),
            Triple(640.0, 360.0, SkinInsets()),
            Triple(402.0, 874.0, SkinInsets(top = 62.0, bottom = 34.0)),
            Triple(874.0, 402.0, SkinInsets(left = 62.0, bottom = 21.0, right = 62.0)),
            Triple(800.0, 1280.0, SkinInsets(top = 24.0, bottom = 48.0)),
            Triple(1280.0, 800.0, SkinInsets(top = 24.0, bottom = 48.0)),
        )
        for ((w, h, ins) in screens) {
            val landscape = w > h
            for (aspect in listOf(4.0 / 3, 3.0 / 4, 384.0 / 224)) for (buttons in 1..6) for (starts in 1..4) {
                for (placement in listOf(null, if (landscape) skin.landscapePlacement else skin.portraitPlacement)) {
                    val l = SkinLayout.compute(w, h, ins, landscape, aspect, buttons, starts, placement)
                    val what = "${if (placement == null) "auto" else "skin"} ${w}x$h $aspect ${buttons}b ${starts}s"
                    assertEquals(what, aspect, l.screen.w / l.screen.h, 1e-6)
                    assertEquals(buttons, l.faces.size)
                    assertEquals(starts, l.starts.size)
                    val controls = listOf(l.dpad, l.coin) + l.faces + l.starts
                    val bounds = SkinRect(0.0, 0.0, w, h)
                    for (c in controls + l.screen) assertTrue("$what $c off screen", bounds.contains(c))
                    for (c in controls) {
                        assertFalse("$what $c on the picture", c.intersects(l.screen.inset(-4.0, -4.0)))
                        assertTrue(what, minOf(c.w, c.h) >= 34)
                    }
                    for (i in controls.indices) for (j in controls.indices) if (j > i) {
                        assertFalse("$what ${controls[i]} ${controls[j]}", controls[i].intersects(controls[j]))
                    }
                    if (placement != null && !l.menuHides) {
                        assertFalse(what, l.menu.intersects(l.screen))
                        for (c in controls) assertFalse("$what menu over $c", l.menu.intersects(c))
                    }
                }
            }
        }
    }

    /** The picture fills its box: the whole game, as large as the box allows. */
    @Test fun pictureIsAsLargeAsItsBox() {
        val skin = PadSkin.parse(builtIn().first().text)
        val portrait = SkinLayout.compute(402.0, 874.0, SkinInsets(top = 62.0, bottom = 34.0), false, 4.0 / 3, 6, 2, skin.portraitPlacement)
        assertEquals("edge to edge in portrait", 402.0, portrait.screen.w, 0.5)
        val landscape = SkinLayout.compute(874.0, 402.0, SkinInsets(left = 62.0, bottom = 21.0, right = 62.0), true, 4.0 / 3, 6, 2, skin.landscapePlacement)
        assertEquals("the whole height in landscape", 402.0 - 8 - 21, landscape.screen.h, 0.5)
    }

    /** The same numbers as the iOS app for the same screen. */
    @Test fun matchesTheIosLayout() {
        val l = SkinLayout.compute(402.0, 874.0, SkinInsets(top = 62.0, bottom = 34.0), false, 4.0 / 3, 6, 2, PadSkin.parse(builtIn().last().text).portraitPlacement)
        assertEquals(22.0 + 83, l.dpad.midX, 1e-9)
        assertEquals(62.0 + 470 + 83, l.dpad.midY, 1e-9)
        assertEquals(6, l.faces.size)
    }
}
