// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

@testable import GoLinkCore
import XCTest

final class PixelTextTests: XCTestCase {
    func testInsertCoinSize() {
        let rows = PixelText.rows(for: "INSERT COIN")
        XCTAssertEqual(rows.count, 7)
        // 10 letters of 5 columns, a 3-column space and 10 one-column gaps.
        XCTAssertEqual(rows[0].count, 10 * 5 + 3 + 10)
        XCTAssertTrue(rows.allSatisfy { $0.count == rows[0].count })
    }

    func testPixels() {
        let rows = PixelText.rows(for: "IN")
        XCTAssertEqual(rows[0].map { $0 ? "#" : "." }.joined(), "#####.#...#")
        XCTAssertEqual(rows[2].map { $0 ? "#" : "." }.joined(), "..#...##..#")
        XCTAssertEqual(rows[6].map { $0 ? "#" : "." }.joined(), "#####.#...#")
    }
}
