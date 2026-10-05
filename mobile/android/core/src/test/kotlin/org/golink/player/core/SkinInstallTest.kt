// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class SkinInstallTest {
    private fun builtIn(): List<File> {
        var dir = File(System.getProperty("user.dir")).absoluteFile
        while (!File(dir, "docs/skins/builtin").isDirectory) dir = dir.parentFile ?: error("docs/skins/builtin not found")
        return File(dir, "docs/skins/builtin").listFiles { f -> f.extension == "json" }!!.sortedBy { it.name }
    }

    private val builtInIds = setOf("violet", "red", "green", "blue", "smoke", "orange")

    /** A built-in skin under another id: a complete, well laid out skin. */
    private fun custom(id: String = "neon-night"): String =
        builtIn().first { it.name == "skin-smoke.json" }.readText().replaceFirst(Regex("\"id\"\\s*:\\s*\"smoke\""), "\"id\": \"$id\"")

    @Test fun acceptsAValidSkin() {
        val c = SkinInstall.check(custom(), builtInIds, emptySet())
        c as SkinInstall.Check.Ready
        assertEquals("neon-night", c.skin.id)
        assertEquals(emptyList<SkinInstall.Found>(), c.warnings)
        assertFalse(c.replaces)
        assertEquals("skin-neon-night.json", SkinInstall.fileName(c.skin.id))
    }

    @Test fun builtInSkinsLayOutWithoutWarnings() {
        for (f in builtIn()) {
            val skin = PadSkin.parse(f.readText())
            assertEquals(f.name, emptyList<SkinInstall.Found>(), SkinInstall.layoutWarnings(skin))
        }
    }

    @Test fun refusesBrokenJsonWithItsLine() {
        val c = SkinInstall.check("{\n  \"format\": 1,\n  \"id\": \"x\" \"name\": {}\n}", builtInIds, emptySet())
        c as SkinInstall.Check.Refused
        assertEquals(SkinInstall.Problem.NOT_JSON, c.problem)
        assertEquals(3, c.line)
        assertEquals(SkinInstall.Problem.NOT_JSON, (SkinInstall.check("[1, 2]", builtInIds, emptySet()) as SkinInstall.Check.Refused).problem)
        assertEquals(SkinInstall.Problem.EMPTY, (SkinInstall.check("   ", builtInIds, emptySet()) as SkinInstall.Check.Refused).problem)
    }

    @Test fun refusesAnInvalidSkinWithTheReason() {
        val c = SkinInstall.check(custom().replace("\"en\":", "\"xx\":"), builtInIds, emptySet())
        c as SkinInstall.Check.Refused
        assertEquals(SkinInstall.Problem.INVALID, c.problem)
        assertEquals("missing name.en", c.detail)
    }

    @Test fun refusesABuiltInId() {
        val c = SkinInstall.check(builtIn().first().readText(), builtInIds, emptySet())
        c as SkinInstall.Check.Refused
        assertEquals(SkinInstall.Problem.BUILT_IN_ID, c.problem)
    }

    @Test fun knowsWhenItReplacesACustomSkin() {
        val c = SkinInstall.check(custom("mine"), builtInIds, setOf("mine")) as SkinInstall.Check.Ready
        assertTrue(c.replaces)
    }

    @Test fun warnsAboutMissingPictures() {
        val text = custom().replaceFirst("{", "{\"background\":{\"portrait\":\"back.png\"},")
        val c = SkinInstall.check(text, builtInIds, emptySet()) as SkinInstall.Check.Ready
        assertEquals(listOf(SkinInstall.Warning.PICTURES_MISSING), c.warnings.map { it.warning })
        assertEquals("back.png", c.warnings.single().where)
    }

    @Test fun warnsAboutControlsOnTopOfEachOther() {
        // The D-pad moved onto the action buttons in portrait.
        val skin = PadSkin.parse(custom())
        val p = skin.portraitPlacement!!
        val broken = skin.copy(portraitPlacement = p.copy(dpad = p.buttons))
        val warnings = SkinInstall.layoutWarnings(broken)
        assertTrue(warnings.toString(), warnings.any { it.warning == SkinInstall.Warning.OVERLAP && it.where.startsWith("portrait") })
    }

    @Test fun refusesAHugeFile() {
        val c = SkinInstall.check("{\"a\":\"" + "x".repeat(SkinInstall.MAX_BYTES) + "\"}", builtInIds, emptySet())
        assertEquals(SkinInstall.Problem.TOO_BIG, (c as SkinInstall.Check.Refused).problem)
    }

    /** The paste check's screens are docs/skins/screens.json's, portrait and landscape, in order. */
    @Test fun checksOnTheSharedScreens() {
        val docs = builtIn().first().parentFile.parentFile
        val json = kotlinx.serialization.json.Json.parseToJsonElement(File(docs, "screens.json").readText())
        val want = (json as kotlinx.serialization.json.JsonObject)["screens"]!!.let { it as kotlinx.serialization.json.JsonArray }.flatMap { s ->
            listOf("portrait", "landscape").map { o ->
                val x = (s as kotlinx.serialization.json.JsonObject)[o] as kotlinx.serialization.json.JsonObject
                val i = x["ins"] as kotlinx.serialization.json.JsonObject
                fun n(e: kotlinx.serialization.json.JsonElement?) = (e as kotlinx.serialization.json.JsonPrimitive).content.toDouble()
                Triple(n(x["w"]), n(x["h"]), SkinInsets(top = n(i["t"]), left = n(i["l"]), bottom = n(i["b"]), right = n(i["r"])))
            }
        }
        assertEquals(want, SkinInstall.SCREENS)
    }
}
