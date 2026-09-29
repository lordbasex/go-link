// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import XCTest
@testable import GoLinkCore

final class TermsTests: XCTestCase {
    // The app asks for the same terms version as the website.
    func testVersionMatchesTheWebsite() throws {
        let here = URL(fileURLWithPath: #filePath)
        let legal = here.deletingLastPathComponent()
            .appendingPathComponent("../../../../../frontend/apps/web/src/legal.ts").standardized
        guard let text = try? String(contentsOf: legal, encoding: .utf8) else {
            throw XCTSkip("built outside the go-link repository")
        }
        let re = try NSRegularExpression(pattern: "TERMS_VERSION = \"([^\"]+)\"")
        XCTAssertEqual(Invites.firstGroup(re, text), Terms.version)
    }

    func testAcceptance() {
        let store = MemoryStore()
        XCTAssertFalse(Terms.accepted(store))
        Terms.accept(store, isoNow: "2026-09-28T00:00:00Z")
        XCTAssertTrue(Terms.accepted(store))
        store.set(Terms.storeKey, #"{"version":"2020-01-01"}"#)
        XCTAssertFalse(Terms.accepted(store))
    }

    func testRoomPassesKeepTheNewest() {
        let store = MemoryStore()
        let passes = RoomPasses(store)
        for i in 1...25 { passes.save("room\(i)", "token\(i)") }
        XCTAssertEqual("", passes.get("room1"))
        XCTAssertEqual("token25", passes.get("room25"))
        passes.save("room6", "again")
        passes.forget("room25")
        XCTAssertEqual("", passes.get("room25"))
        XCTAssertEqual("again", RoomPasses(store).get("room6"))
        // room6 is now the newest: 20 more rooms push out the others first.
        for i in 100..<119 { passes.save("room\(i)", "t") }
        XCTAssertEqual("again", passes.get("room6"))
    }

    func testJsonTextIsCompactAndOrdered() {
        XCTAssertEqual(#"{"a":1,"b":"x\"y\n","c":[true,null,1.5]}"#, JSON.obj(("a", 1), ("b", "x\"y\n"), ("c", .array([true, .null, .number(1.5)])), ("d", nil)).text)
        XCTAssertNil(JSONText.parseObject("[1]"))
        XCTAssertNil(JSONText.parseObject("not json"))
        XCTAssertEqual(.bool(true), JSONText.parseObject(#"{"t":true}"#)?["t"])
        XCTAssertEqual(.number(1), JSONText.parseObject(#"{"t":1}"#)?["t"])
    }
}
