// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import CoreGraphics
import XCTest
@testable import GoLinkCore

final class TouchPadTrackerTests: XCTestCase {
    // A portrait layout (Game Boy) and the same buttons after a rotation
    // (Switch): the buttons move, and a different one sits where the
    // first one used to be.
    private let portraitDpad = CGRect(x: 20, y: 500, width: 160, height: 160)
    private let portrait = [
        PadTarget(bit: Button.b1, frame: CGRect(x: 250, y: 520, width: 70, height: 70)),
        PadTarget(bit: Button.b2, frame: CGRect(x: 330, y: 520, width: 70, height: 70)),
        PadTarget(bit: Button.coin, frame: CGRect(x: 120, y: 700, width: 60, height: 36)),
    ]
    private let landscapeDpad = CGRect(x: 30, y: 150, width: 140, height: 140)
    private let landscape = [
        PadTarget(bit: Button.b1, frame: CGRect(x: 700, y: 200, width: 64, height: 64)),
        PadTarget(bit: Button.b2, frame: CGRect(x: 780, y: 200, width: 64, height: 64)),
        PadTarget(bit: Button.coin, frame: CGRect(x: 60, y: 330, width: 60, height: 36)),
        PadTarget(bit: Button.start1, frame: CGRect(x: 250, y: 520, width: 70, height: 70)),
    ]

    func testDpadAndButtonAtTheSameTime() {
        var t = TouchPadTracker<Int>()
        t.down(1, at: CGPoint(x: portraitDpad.maxX - 10, y: portraitDpad.midY), dpad: portraitDpad, buttons: portrait)
        t.down(2, at: CGPoint(x: 285, y: 555), dpad: portraitDpad, buttons: portrait)
        XCTAssertEqual(t.bits, Button.right | Button.b1)
        // Slide the button finger to the next button, keep the D-pad.
        t.move(2, at: CGPoint(x: 365, y: 555), dpad: portraitDpad, buttons: portrait)
        XCTAssertEqual(t.bits, Button.right | Button.b2)
        t.up(1)
        XCTAssertEqual(t.bits, Button.b2)
        t.up(2)
        XCTAssertEqual(t.bits, 0)
    }

    func testRotationReleasesEverythingAndUsesTheNewGeometry() {
        var t = TouchPadTracker<Int>()
        t.down(1, at: CGPoint(x: 285, y: 555), dpad: portraitDpad, buttons: portrait)
        t.down(2, at: CGPoint(x: portraitDpad.midX, y: portraitDpad.minY + 5), dpad: portraitDpad, buttons: portrait)
        XCTAssertEqual(t.bits, Button.b1 | Button.up)

        // The phone turns: nothing stays held.
        t.releaseAll()
        XCTAssertEqual(t.bits, 0)
        XCTAssertEqual(t.fingerCount, 0)

        // The old fingers keep moving (still on the glass): they must not
        // press the Start button that now sits where button 1 was.
        XCTAssertFalse(t.move(1, at: CGPoint(x: 285, y: 555), dpad: landscapeDpad, buttons: landscape))
        XCTAssertFalse(t.move(2, at: CGPoint(x: 100, y: 220), dpad: landscapeDpad, buttons: landscape))
        XCTAssertEqual(t.bits, 0)
        t.up(1)
        t.up(2)

        // New touches hit the buttons where they are now.
        t.down(3, at: CGPoint(x: 732, y: 232), dpad: landscapeDpad, buttons: landscape)
        XCTAssertEqual(t.bits, Button.b1)
        t.down(4, at: CGPoint(x: landscapeDpad.minX + 5, y: landscapeDpad.midY), dpad: landscapeDpad, buttons: landscape)
        XCTAssertEqual(t.bits, Button.b1 | Button.left)
        t.down(5, at: CGPoint(x: 90, y: 348), dpad: landscapeDpad, buttons: landscape)
        XCTAssertEqual(t.bits, Button.b1 | Button.left | Button.coin)
        t.releaseAll()

        // And back to portrait.
        t.down(6, at: CGPoint(x: 150, y: 718), dpad: portraitDpad, buttons: portrait)
        XCTAssertEqual(t.bits, Button.coin)
    }

    func testDpadThatDisappearsPressesNothing() {
        var t = TouchPadTracker<Int>()
        t.down(1, at: CGPoint(x: portraitDpad.midX, y: portraitDpad.maxY - 5), dpad: portraitDpad, buttons: portrait)
        XCTAssertEqual(t.bits, Button.down)
        t.move(1, at: CGPoint(x: portraitDpad.midX, y: portraitDpad.maxY - 5), dpad: nil, buttons: portrait)
        XCTAssertEqual(t.bits, 0)
    }

    func testOverlappingSlopPicksTheNearestButton() {
        let a = PadTarget(bit: Button.b1, frame: CGRect(x: 0, y: 0, width: 40, height: 40))
        let b = PadTarget(bit: Button.b2, frame: CGRect(x: 42, y: 0, width: 40, height: 40))
        // In both slop areas, nearer to b; the order of the list does not matter.
        XCTAssertEqual(TouchPadTracker<Int>.hit(CGPoint(x: 42, y: 20), [a, b]), Button.b2)
        XCTAssertEqual(TouchPadTracker<Int>.hit(CGPoint(x: 42, y: 20), [b, a]), Button.b2)
        XCTAssertEqual(TouchPadTracker<Int>.hit(CGPoint(x: 39, y: 20), [b, a]), Button.b1)
        XCTAssertEqual(TouchPadTracker<Int>.hit(CGPoint(x: 200, y: 20), [a, b]), 0)
        // A button that is not laid out (empty frame) is never hit.
        XCTAssertEqual(TouchPadTracker<Int>.hit(.zero, [PadTarget(bit: Button.b3, frame: .zero)]), 0)
    }

    func testFourWayDpad() {
        var t = TouchPadTracker<Int>()
        t.fourWay = true
        t.down(1, at: CGPoint(x: portraitDpad.maxX - 10, y: portraitDpad.minY + 20), dpad: portraitDpad, buttons: [])
        XCTAssertEqual(t.bits.nonzeroBitCount, 1)
    }
}
