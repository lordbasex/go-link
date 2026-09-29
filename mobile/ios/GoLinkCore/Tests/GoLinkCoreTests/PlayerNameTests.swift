// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import XCTest
@testable import GoLinkCore

// The same cases as the Android app's PlayerNameTest and the device's hello.name rules.
final class PlayerNameTests: XCTestCase {
    func testAcceptsLettersDigitsAndSpaces() {
        for ok in ["Ana", "Alex 17", "José", "Ñoño", "ñandú", "Zoë", "李小龍", "Иван", "Łukasz", "AB", "Player 2", "12"] {
            XCTAssertEqual(.ok, PlayerName.check(ok), ok)
        }
        // An accent typed as a combining mark is a letter after NFC.
        XCTAssertEqual(.ok, PlayerName.check("Jose\u{0301}"))
        XCTAssertEqual("José", PlayerName.normalize("Jose\u{0301}"))
    }

    func testRefusesSymbolsAndEmoji() {
        for bad in ["Ana!", "a_b", "x-y", "Ana 😀", "👍👍", "1️⃣2", "a.b", "<b>", "ana@mail", "Ana\u{200B}"] {
            XCTAssertEqual(.invalid, PlayerName.check(bad), bad)
        }
    }

    func testLengthRulesCountCodePointsAfterCollapsing() {
        XCTAssertEqual(.empty, PlayerName.check("   "))
        XCTAssertEqual(.tooShort, PlayerName.check(" a "))
        XCTAssertEqual(.ok, PlayerName.check("a  b"))
        XCTAssertEqual(.ok, PlayerName.check(String(repeating: "x", count: 20)))
        XCTAssertEqual(.tooLong, PlayerName.check(String(repeating: "x", count: 21)))
        XCTAssertEqual(.ok, PlayerName.check("  " + String(repeating: "x", count: 20) + "  "))
        XCTAssertEqual(20, PlayerName.length(String(repeating: "𠀀", count: 20)))
        XCTAssertEqual(.ok, PlayerName.check(String(repeating: "𠀀", count: 20)))
        XCTAssertEqual("Ana Bo", PlayerName.normalize(" Ana \t\n  Bo "))
    }

    func testSanitizeKeepsWhatTheDeviceKeeps() {
        XCTAssertEqual("Ana 1", PlayerName.sanitize("  Ana ✨ #1 "))
        XCTAssertEqual("Zoë", PlayerName.sanitize("Zoë"))
        XCTAssertEqual("", PlayerName.sanitize("😀😀"))
        XCTAssertEqual("", PlayerName.sanitize("a!"))
        XCTAssertEqual(String(repeating: "x", count: 20), PlayerName.sanitize(String(repeating: "x", count: 30)))
        XCTAssertEqual("abc", PlayerName.sanitize("abc     " + String(repeating: "!", count: 30)))
        let cut = PlayerName.sanitize(String(repeating: "x", count: 19) + " yz")
        XCTAssertEqual(String(repeating: "x", count: 19), cut)
        XCTAssertTrue(PlayerName.isValid(cut))
    }
}
