// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

/**
 * Arcade pixel lettering drawn in code (no font file): the startup intro's
 * "INSERT COIN". Each letter is a 5x7 bitmap, letters are one blank column
 * apart and a space is three blank columns. The website and the Android
 * app draw the same bitmaps.
 */
public enum PixelText {
    public static let glyphWidth = 5
    public static let glyphHeight = 7
    public static let spaceWidth = 3

    static let glyphs: [Character: [String]] = [
        "I": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
        "N": ["#...#", "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"],
        "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
        "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
        "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
        "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
        "C": [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
        "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    ]

    /** The lit pixels of a text, row by row (7 rows); unknown letters are blank. */
    public static func rows(for text: String) -> [[Bool]] {
        var rows = Array(repeating: [Bool](), count: glyphHeight)
        for (i, ch) in text.uppercased().enumerated() {
            if i > 0 { for r in 0..<glyphHeight { rows[r].append(false) } }
            if ch == " " {
                for r in 0..<glyphHeight { rows[r].append(contentsOf: Array(repeating: false, count: spaceWidth)) }
                continue
            }
            let glyph = glyphs[ch] ?? Array(repeating: ".....", count: glyphHeight)
            for r in 0..<glyphHeight { rows[r].append(contentsOf: glyph[r].map { $0 == "#" }) }
        }
        return rows
    }
}
