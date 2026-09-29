// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

/**
 * The intro's "INSERT COIN" as arcade pixel text, drawn in code (no font
 * file): a 5x7 bitmap per letter, one blank column between letters and a
 * 3-column space. The same table is in the iOS app and the website.
 */
object PixelText {
    const val HEIGHT = 7
    const val GLYPH_WIDTH = 5
    const val SPACE_WIDTH = 3

    private val GLYPHS: Map<Char, List<String>> = mapOf(
        'I' to listOf("#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"),
        'N' to listOf("#...#", "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"),
        'S' to listOf(".####", "#....", "#....", ".###.", "....#", "....#", "####."),
        'E' to listOf("#####", "#....", "#....", "####.", "#....", "#....", "#####"),
        'R' to listOf("####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"),
        'T' to listOf("#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."),
        'C' to listOf(".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."),
        'O' to listOf(".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."),
    )

    /** The pixel rows of [text] (top to bottom); unknown letters are blank. */
    fun rows(text: String): List<BooleanArray> {
        val columns = mutableListOf<BooleanArray>()
        text.uppercase().forEachIndexed { i, ch ->
            if (i > 0) columns += BooleanArray(HEIGHT)
            if (ch == ' ') {
                repeat(SPACE_WIDTH) { columns += BooleanArray(HEIGHT) }
            } else {
                val glyph = GLYPHS[ch]
                for (x in 0 until GLYPH_WIDTH) {
                    columns += BooleanArray(HEIGHT) { y -> glyph?.get(y)?.get(x) == '#' }
                }
            }
        }
        return List(HEIGHT) { y -> BooleanArray(columns.size) { x -> columns[x][y] } }
    }
}
