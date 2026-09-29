// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import Foundation

/** Why a typed name can or cannot be used. */
public enum NameCheck: Equatable, Sendable {
    case ok
    /** Nothing typed (only spaces). */
    case empty
    /** Fewer than PlayerName.min characters. */
    case tooShort
    /** More than PlayerName.max characters. */
    case tooLong
    /** A symbol, an emoji or any other character that is not a letter, a digit or a space. */
    case invalid
}

/**
 * The player's name rules, the same as the device's hello.name: after
 * trimming and collapsing runs of spaces, 2 to 20 characters, and only
 * Unicode letters (\p{L}), digits (\p{N}) and spaces. Accents, ñ and
 * every script's letters are fine; symbols and emoji are not.
 * Characters are counted as code points (Unicode scalars) after NFC
 * normalization. A port of the Android app's PlayerName.kt.
 */
public enum PlayerName {
    public static let min = 2
    public static let max = 20

    private static func isSpace(_ s: Unicode.Scalar) -> Bool {
        switch s.properties.generalCategory {
        case .spaceSeparator, .lineSeparator, .paragraphSeparator: return true
        default: return s.properties.isWhitespace
        }
    }

    public static func isAllowed(_ s: Unicode.Scalar) -> Bool {
        if s == " " { return true }
        switch s.properties.generalCategory {
        case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter,
             .decimalNumber, .letterNumber, .otherNumber:
            return true
        default:
            return false
        }
    }

    /** NFC, whitespace runs to one space, trimmed. */
    public static func normalize(_ raw: String) -> String {
        var out = String.UnicodeScalarView()
        var pendingSpace = false
        for s in raw.precomposedStringWithCanonicalMapping.unicodeScalars {
            if isSpace(s) {
                pendingSpace = !out.isEmpty
                continue
            }
            if pendingSpace { out.append(" ") }
            pendingSpace = false
            out.append(s)
        }
        return String(out)
    }

    /** Characters as the rules count them (code points of the normalized name). */
    public static func length(_ raw: String) -> Int { normalize(raw).unicodeScalars.count }

    /** Checks a typed name; .invalid wins over the length problems, like the screen's hint. */
    public static func check(_ raw: String) -> NameCheck {
        let n = normalize(raw)
        if n.unicodeScalars.contains(where: { !isAllowed($0) }) { return .invalid }
        let len = n.unicodeScalars.count
        if len == 0 { return .empty }
        if len < min { return .tooShort }
        if len > max { return .tooLong }
        return .ok
    }

    public static func isValid(_ raw: String) -> Bool { check(raw) == .ok }

    /**
     * What the device would keep: the letters, digits and spaces of the
     * name, collapsed, trimmed and cut to max characters; "" when fewer
     * than min are left (the device then names the guest itself).
     */
    public static func sanitize(_ raw: String) -> String {
        var kept = String.UnicodeScalarView()
        for s in normalize(raw).unicodeScalars where isAllowed(s) { kept.append(s) }
        var scalars = Array(normalize(String(kept)).unicodeScalars)
        if scalars.count > max {
            scalars = Array(scalars.prefix(max))
            while scalars.last == " " { scalars.removeLast() }
        }
        guard scalars.count >= min else { return "" }
        var v = String.UnicodeScalarView()
        v.append(contentsOf: scalars)
        return String(v)
    }
}
