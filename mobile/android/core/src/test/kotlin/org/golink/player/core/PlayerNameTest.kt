// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// The same cases as GoLinkCore's PlayerNameTests (iOS) and the device's hello.name rules.
class PlayerNameTest {
    @Test
    fun acceptsLettersDigitsAndSpaces() {
        for (ok in listOf("Ana", "Alex 17", "José", "Ñoño", "ñandú", "Zoë", "李小龍", "Иван", "Łukasz", "AB", "Player 2", "12")) {
            assertEquals(ok, NameCheck.OK, PlayerName.check(ok))
        }
        // An accent typed as a combining mark is a letter after NFC.
        assertEquals(NameCheck.OK, PlayerName.check("José"))
        assertEquals("José", PlayerName.normalize("José"))
    }

    @Test
    fun refusesSymbolsAndEmoji() {
        for (bad in listOf("Ana!", "a_b", "x-y", "Ana 😀", "👍👍", "1️⃣2", "a.b", "<b>", "ana@mail", "Ana​")) {
            assertEquals(bad, NameCheck.INVALID, PlayerName.check(bad))
        }
    }

    @Test
    fun lengthRulesCountCodePointsAfterCollapsing() {
        assertEquals(NameCheck.EMPTY, PlayerName.check("   "))
        assertEquals(NameCheck.TOO_SHORT, PlayerName.check(" a "))
        assertEquals(NameCheck.OK, PlayerName.check("a  b")) // "a b" is 3
        assertEquals(NameCheck.OK, PlayerName.check("x".repeat(20)))
        assertEquals(NameCheck.TOO_LONG, PlayerName.check("x".repeat(21)))
        assertEquals(NameCheck.OK, PlayerName.check("  " + "x".repeat(20) + "  "))
        assertEquals(20, PlayerName.length("𠀀".repeat(20))) // outside the BMP: one each
        assertEquals(NameCheck.OK, PlayerName.check("𠀀".repeat(20)))
        assertEquals("Ana Bo", PlayerName.normalize(" Ana \t\n  Bo "))
    }

    @Test
    fun sanitizeKeepsWhatTheDeviceKeeps() {
        assertEquals("Ana 1", PlayerName.sanitize("  Ana ✨ #1 "))
        assertEquals("Zoë", PlayerName.sanitize("Zoë"))
        assertEquals("", PlayerName.sanitize("😀😀"))
        assertEquals("", PlayerName.sanitize("a!"))
        assertEquals("x".repeat(20), PlayerName.sanitize("x".repeat(30)))
        assertEquals("abc", PlayerName.sanitize("abc" + " ".repeat(5) + "!".repeat(30)))
        // A cut never leaves a trailing space.
        val cut = PlayerName.sanitize("x".repeat(19) + " yz")
        assertEquals("x".repeat(19), cut)
        assertTrue(PlayerName.isValid(cut))
    }
}
