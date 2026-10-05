// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/**
 * Installing a skin from pasted JSON (Settings and Game settings ›
 * Install skin): the text is read with the same parser the app uses for
 * its skin files, then laid out on reference phones and tablets in both
 * orientations with the same checks the core tests make (on screen, off
 * the picture, no overlaps, finger-sized). A file that does not parse is
 * refused with what is wrong (and the line for broken JSON); layout
 * problems are warnings, since the skin still draws.
 */
object SkinInstall {
    /** A skin file is a few kilobytes; the catalog skips anything over this. */
    const val MAX_BYTES = 64 * 1024

    enum class Problem { EMPTY, TOO_BIG, NOT_JSON, INVALID, BUILT_IN_ID }

    enum class Warning { OFF_SCREEN, ON_PICTURE, OVERLAP, TOO_SMALL, MENU_OVER, PICTURES_MISSING }

    /**
     * A warning and the first case that shows it: the screen and the
     * button counts for a layout problem, the picture files for missing
     * pictures; [where] says it in English (logs, tests).
     */
    data class Found(
        val warning: Warning,
        val where: String,
        val landscape: Boolean = false,
        val width: Int = 0,
        val height: Int = 0,
        val buttons: Int = 0,
        val starts: Int = 0,
    )

    sealed interface Check {
        /** Refused: [detail] is the parser's reason (a JSON key like "missing name.en"), [line] where the JSON broke. */
        data class Refused(val problem: Problem, val detail: String = "", val line: Int? = null, val column: Int? = null) : Check

        /** Can be installed; [replaces] when a custom skin with this id is already installed. */
        data class Ready(val skin: PadSkin, val warnings: List<Found>, val replaces: Boolean) : Check
    }

    /** The file name an installed skin gets in the Skins folder. */
    fun fileName(id: String) = "skin-$id.json"

    fun check(text: String, builtInIds: Set<String>, installedIds: Set<String>): Check {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return Check.Refused(Problem.EMPTY)
        if (trimmed.encodeToByteArray().size > MAX_BYTES) return Check.Refused(Problem.TOO_BIG)
        try {
            if (Json.parseToJsonElement(trimmed) !is JsonObject) return Check.Refused(Problem.NOT_JSON, "not an object")
        } catch (e: Exception) {
            val (line, column) = position(trimmed, e.message ?: "")
            return Check.Refused(Problem.NOT_JSON, reason(e.message ?: ""), line, column)
        }
        val skin = try {
            PadSkin.parse(trimmed)
        } catch (e: SkinException) {
            return Check.Refused(Problem.INVALID, e.message ?: "")
        }
        if (skin.id in builtInIds) return Check.Refused(Problem.BUILT_IN_ID, skin.id)
        val warnings = layoutWarnings(skin).toMutableList()
        // A pasted file comes alone: its background pictures are not there.
        if (skin.backgroundPortrait != null || skin.backgroundLandscape != null) {
            warnings += Found(Warning.PICTURES_MISSING, listOfNotNull(skin.backgroundPortrait, skin.backgroundLandscape).distinct().joinToString(", "))
        }
        return Check.Ready(skin, warnings, replaces = skin.id in installedIds)
    }

    /**
     * The screens a skin is checked on, phones and tablets (dp) with their
     * system bars: docs/skins/screens.json, portrait and landscape
     * (SkinInstallTest checks the two match).
     */
    internal val SCREENS = listOf(
        Triple(375.0, 667.0, SkinInsets(top = 20.0)), // iPhone SE (2nd, 3rd gen.)
        Triple(667.0, 375.0, SkinInsets()), // iPhone SE (2nd, 3rd gen.)
        Triple(375.0, 812.0, SkinInsets(top = 50.0, bottom = 34.0)), // iPhone 12 mini · 13 mini
        Triple(812.0, 375.0, SkinInsets(left = 50.0, bottom = 21.0, right = 50.0)), // iPhone 12 mini · 13 mini
        Triple(375.0, 812.0, SkinInsets(top = 44.0, bottom = 34.0)), // iPhone 11 Pro
        Triple(812.0, 375.0, SkinInsets(left = 44.0, bottom = 21.0, right = 44.0)), // iPhone 11 Pro
        Triple(414.0, 896.0, SkinInsets(top = 48.0, bottom = 34.0)), // iPhone 11
        Triple(896.0, 414.0, SkinInsets(left = 48.0, bottom = 21.0, right = 48.0)), // iPhone 11
        Triple(414.0, 896.0, SkinInsets(top = 44.0, bottom = 34.0)), // iPhone 11 Pro Max
        Triple(896.0, 414.0, SkinInsets(left = 44.0, bottom = 21.0, right = 44.0)), // iPhone 11 Pro Max
        Triple(390.0, 844.0, SkinInsets(top = 47.0, bottom = 34.0)), // iPhone 12 · 12 Pro · 13 · 13 Pro · 14 · 16e
        Triple(844.0, 390.0, SkinInsets(left = 47.0, bottom = 21.0, right = 47.0)), // iPhone 12 · 12 Pro · 13 · 13 Pro · 14 · 16e
        Triple(428.0, 926.0, SkinInsets(top = 47.0, bottom = 34.0)), // iPhone 12 Pro Max · 13 Pro Max · 14 Plus
        Triple(926.0, 428.0, SkinInsets(left = 47.0, bottom = 21.0, right = 47.0)), // iPhone 12 Pro Max · 13 Pro Max · 14 Plus
        Triple(393.0, 852.0, SkinInsets(top = 59.0, bottom = 34.0)), // iPhone 14 Pro · 15 · 15 Pro · 16
        Triple(852.0, 393.0, SkinInsets(left = 59.0, bottom = 21.0, right = 59.0)), // iPhone 14 Pro · 15 · 15 Pro · 16
        Triple(430.0, 932.0, SkinInsets(top = 59.0, bottom = 34.0)), // iPhone 14 Pro Max · 15 Plus · 15 Pro Max · 16 Plus
        Triple(932.0, 430.0, SkinInsets(left = 59.0, bottom = 21.0, right = 59.0)), // iPhone 14 Pro Max · 15 Plus · 15 Pro Max · 16 Plus
        Triple(402.0, 874.0, SkinInsets(top = 62.0, bottom = 34.0)), // iPhone 16 Pro · 17 · 17 Pro
        Triple(874.0, 402.0, SkinInsets(left = 62.0, bottom = 21.0, right = 62.0)), // iPhone 16 Pro · 17 · 17 Pro
        Triple(440.0, 956.0, SkinInsets(top = 62.0, bottom = 34.0)), // iPhone 16 Pro Max · 17 Pro Max
        Triple(956.0, 440.0, SkinInsets(left = 62.0, bottom = 21.0, right = 62.0)), // iPhone 16 Pro Max · 17 Pro Max
        Triple(420.0, 912.0, SkinInsets(top = 68.0, bottom = 34.0)), // iPhone Air
        Triple(912.0, 420.0, SkinInsets(left = 68.0, bottom = 21.0, right = 68.0)), // iPhone Air
        Triple(820.0, 1180.0, SkinInsets(top = 24.0, bottom = 20.0)), // iPad
        Triple(1180.0, 820.0, SkinInsets(top = 24.0, bottom = 20.0)), // iPad
        Triple(360.0, 640.0, SkinInsets(top = 24.0)), // Android 360 × 640 (16:9)
        Triple(640.0, 360.0, SkinInsets()), // Android 360 × 640 (16:9)
        Triple(360.0, 760.0, SkinInsets(top = 24.0, bottom = 48.0)), // Android 360 × 760
        Triple(760.0, 360.0, SkinInsets(top = 24.0, right = 48.0)), // Android 360 × 760
        Triple(393.0, 851.0, SkinInsets(top = 24.0, bottom = 48.0)), // Android 393 × 851
        Triple(851.0, 393.0, SkinInsets(top = 24.0, right = 48.0)), // Android 393 × 851
        Triple(412.0, 915.0, SkinInsets(top = 24.0, bottom = 48.0)), // Android 412 × 915
        Triple(915.0, 412.0, SkinInsets(top = 24.0, right = 48.0)), // Android 412 × 915
        Triple(411.0, 731.0, SkinInsets(top = 24.0, bottom = 48.0)), // Android 411 × 731 (16:9)
        Triple(731.0, 411.0, SkinInsets(top = 24.0, right = 48.0)), // Android 411 × 731 (16:9)
        Triple(448.0, 997.0, SkinInsets(top = 24.0, bottom = 48.0)), // Android 448 × 997
        Triple(997.0, 448.0, SkinInsets(top = 24.0, right = 48.0)), // Android 448 × 997
        Triple(461.0, 998.0, SkinInsets(top = 24.0, bottom = 48.0)), // Android 461 × 998
        Triple(998.0, 461.0, SkinInsets(top = 24.0, right = 48.0)), // Android 461 × 998
        Triple(690.0, 829.0, SkinInsets(top = 24.0, bottom = 48.0)), // Android foldable 690 × 829
        Triple(829.0, 690.0, SkinInsets(top = 24.0, right = 48.0)), // Android foldable 690 × 829
        Triple(800.0, 1280.0, SkinInsets(top = 24.0, bottom = 48.0)), // Android tablet 800 × 1280
        Triple(1280.0, 800.0, SkinInsets(top = 24.0, bottom = 48.0)), // Android tablet 800 × 1280
    )

    /**
     * The skin's own layouts on every reference screen, game shape and
     * button count; each kind of problem once, with the first case that
     * shows it. A skin without a layout for an orientation uses the app's
     * automatic one there, which is always right.
     */
    fun layoutWarnings(skin: PadSkin): List<Found> {
        val found = LinkedHashMap<Warning, Found>()
        for ((w, h, ins) in SCREENS) {
            val landscape = w > h
            val placement = (if (landscape) skin.landscapePlacement else skin.portraitPlacement) ?: continue
            for (aspect in listOf(4.0 / 3, 3.0 / 4, 384.0 / 224)) for (buttons in 1..6) for (starts in 1..4) {
                val l = SkinLayout.compute(w, h, ins, landscape, aspect, buttons, starts, placement)
                val where = "${if (landscape) "landscape" else "portrait"} ${w.toInt()}x${h.toInt()}, $buttons buttons, $starts starts"
                fun note(warning: Warning) {
                    if (warning !in found) found[warning] = Found(warning, where, landscape, w.toInt(), h.toInt(), buttons, starts)
                }
                val controls = listOf(l.dpad, l.coin) + l.faces + l.starts
                val bounds = SkinRect(0.0, 0.0, w, h)
                if ((controls + l.screen).any { !bounds.contains(it) }) note(Warning.OFF_SCREEN)
                if (controls.any { it.intersects(l.screen.inset(-4.0, -4.0)) }) note(Warning.ON_PICTURE)
                if (controls.any { minOf(it.w, it.h) < 34 }) note(Warning.TOO_SMALL)
                for (i in controls.indices) for (j in controls.indices) {
                    if (j > i && controls[i].intersects(controls[j])) note(Warning.OVERLAP)
                }
                if (!l.menuHides && (l.menu.intersects(l.screen) || controls.any { l.menu.intersects(it) })) note(Warning.MENU_OVER)
            }
        }
        return found.values.toList()
    }

    /** The line and column of a JSON error, from the parser's "at offset N". */
    private fun position(text: String, message: String): Pair<Int?, Int?> {
        val offset = Regex("""offset (\d+)""").find(message)?.groupValues?.get(1)?.toIntOrNull() ?: return null to null
        val upTo = text.take(offset.coerceIn(0, text.length))
        val line = upTo.count { it == '\n' } + 1
        val column = offset - (upTo.lastIndexOf('\n') + 1) + 1
        return line to column
    }

    /** The parser's first sentence, without its long "JSON input: ..." echo. */
    private fun reason(message: String): String =
        message.substringBefore("\n").substringBefore(" JSON input:").substringAfter(": ", message.substringBefore("\n")).take(160)
}
