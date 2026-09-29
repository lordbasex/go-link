// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import java.text.Normalizer

/** Why a typed name can or cannot be used. */
enum class NameCheck {
    OK,

    /** Nothing typed (only spaces). */
    EMPTY,

    /** Fewer than [PlayerName.MIN] characters. */
    TOO_SHORT,

    /** More than [PlayerName.MAX] characters. */
    TOO_LONG,

    /** A symbol, an emoji or any other character that is not a letter, a digit or a space. */
    INVALID,
}

/**
 * The player's name rules, the same as the device's hello.name: after
 * trimming and collapsing runs of spaces, 2 to 20 characters, and only
 * Unicode letters (\p{L}), digits (\p{N}) and spaces. Accents, ñ and
 * every script's letters are fine; symbols and emoji are not.
 * Characters are counted as code points, after NFC normalization (so an
 * "é" typed as e + combining accent counts once and is a letter).
 */
object PlayerName {
    const val MIN = 2
    const val MAX = 20

    /** NFC, whitespace runs to one space, trimmed. */
    fun normalize(raw: String): String {
        val nfc = Normalizer.normalize(raw, Normalizer.Form.NFC)
        val out = StringBuilder(nfc.length)
        var pendingSpace = false
        var i = 0
        while (i < nfc.length) {
            val cp = nfc.codePointAt(i)
            i += Character.charCount(cp)
            if (Character.isWhitespace(cp) || Character.isSpaceChar(cp)) {
                pendingSpace = out.isNotEmpty()
                continue
            }
            if (pendingSpace) out.append(' ')
            pendingSpace = false
            out.appendCodePoint(cp)
        }
        return out.toString()
    }

    /** Characters as the rules count them (code points of the normalized name). */
    fun length(raw: String): Int {
        val n = normalize(raw)
        return n.codePointCount(0, n.length)
    }

    fun isAllowed(cp: Int): Boolean = cp == ' '.code || isLetterOrDigit(cp)

    private val LETTERS_AND_DIGITS: Set<Int> = setOf(
        Character.UPPERCASE_LETTER, Character.LOWERCASE_LETTER, Character.TITLECASE_LETTER,
        Character.MODIFIER_LETTER, Character.OTHER_LETTER,
        Character.DECIMAL_DIGIT_NUMBER, Character.LETTER_NUMBER, Character.OTHER_NUMBER,
    ).map { it.toInt() }.toSet()

    private fun isLetterOrDigit(cp: Int): Boolean = Character.getType(cp) in LETTERS_AND_DIGITS

    /** Checks a typed name; INVALID wins over the length problems, like the screen's hint. */
    fun check(raw: String): NameCheck {
        val n = normalize(raw)
        if (n.codePoints().anyMatch { !isAllowed(it) }) return NameCheck.INVALID
        val len = n.codePointCount(0, n.length)
        return when {
            len == 0 -> NameCheck.EMPTY
            len < MIN -> NameCheck.TOO_SHORT
            len > MAX -> NameCheck.TOO_LONG
            else -> NameCheck.OK
        }
    }

    fun isValid(raw: String): Boolean = check(raw) == NameCheck.OK

    /**
     * What the device would keep: the letters, digits and spaces of the
     * name, collapsed, trimmed and cut to [MAX] characters; "" when fewer
     * than [MIN] are left (the device then names the guest itself).
     */
    fun sanitize(raw: String): String {
        val kept = StringBuilder()
        normalize(raw).codePoints().forEach { if (isAllowed(it)) kept.appendCodePoint(it) }
        var n = normalize(kept.toString())
        if (n.codePointCount(0, n.length) > MAX) n = n.substring(0, n.offsetByCodePoints(0, MAX)).trimEnd()
        return if (n.codePointCount(0, n.length) >= MIN) n else ""
    }
}
