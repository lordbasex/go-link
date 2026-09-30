// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import XCTest
@testable import GoLinkCore

final class ScreenRateTests: XCTestCase {
    func testFastestKeepsTheResolution() {
        let current = ScreenRate.Mode(id: 1, width: 1080, height: 2400, refreshHz: 60)
        let modes = [
            current,
            ScreenRate.Mode(id: 2, width: 1080, height: 2400, refreshHz: 90),
            ScreenRate.Mode(id: 3, width: 1440, height: 3200, refreshHz: 144),
            ScreenRate.Mode(id: 4, width: 2400, height: 1080, refreshHz: 120),
        ]
        XCTAssertEqual(4, ScreenRate.fastest(modes, current: current).id)
    }

    func testFastestKeepsTheCurrentModeOnATie() {
        let current = ScreenRate.Mode(id: 7, width: 1080, height: 2400, refreshHz: 120)
        let other = ScreenRate.Mode(id: 8, width: 1080, height: 2400, refreshHz: 120.2)
        XCTAssertEqual(7, ScreenRate.fastest([other, current], current: current).id)
        XCTAssertEqual(7, ScreenRate.fastest([], current: current).id)
    }

    func testSnapAndLabels() {
        XCTAssertEqual(120, ScreenRate.snap(118.9))
        XCTAssertEqual(60, ScreenRate.snap(59.94))
        XCTAssertEqual(144, ScreenRate.snap(143.2))
        XCTAssertEqual(110, ScreenRate.snap(110.4))
        XCTAssertNil(ScreenRate.snap(.nan))
        XCTAssertNil(ScreenRate.snap(0))
        XCTAssertEqual("120 Hz", ScreenRate.label(120))
        XCTAssertEqual("–", ScreenRate.label(nil))
        XCTAssertEqual("8.3", ScreenRate.frameMs(120))
        XCTAssertEqual("16.7", ScreenRate.frameMs(60))
        XCTAssertEqual("–", ScreenRate.frameMs(0))
    }

    func testMeterReadsTheMedianRate() {
        let m = RefreshRateMeter()
        var t = 10.0
        var reading: Int?
        for i in 0..<130 {
            // A missed frame now and then must not lower the reading.
            t += i % 20 == 19 ? 2.0 / 120 : 1.0 / 120
            if let r = m.frame(at: t) { reading = r }
        }
        XCTAssertEqual(120, reading)
    }

    func testMeterStartsOverAfterAPause() {
        let m = RefreshRateMeter()
        var t = 0.0
        for _ in 0..<50 { t += 1.0 / 60; XCTAssertNil(m.frame(at: t)) }
        t += 5 // the app was in the background
        var reading: Int?
        for _ in 0..<70 { t += 1.0 / 60; if let r = m.frame(at: t) { reading = r } }
        XCTAssertEqual(60, reading)
    }
}
