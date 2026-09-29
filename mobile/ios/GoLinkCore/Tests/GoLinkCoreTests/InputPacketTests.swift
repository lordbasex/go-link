// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import XCTest
@testable import GoLinkCore

final class InputPacketTests: XCTestCase {
    private func hex(_ b: [UInt8]) -> String { b.map { String(format: "%02x", $0) }.joined() }

    // Produced by the web's encodeInput (frontend/packages/shared/src/stream.ts)
    // with the same inputs, like the Android test: identical byte for byte.
    func testMatchesTheWebEncoder() {
        XCTAssertEqual("000100000000001100000000", hex(InputPacket.encode(seq: 1, player: 0, pad: Pad(buttons: Button.up | Button.b1))))
        XCTAssertEqual(
            "ffff0300002008087f8140ff",
            hex(InputPacket.encode(seq: 65535, player: 3, pad: Pad(
                buttons: Button.start4 | Button.coin | Button.right,
                axes: [127, -127, InputPacket.axis(64.4), InputPacket.axis(-0.6)]
            )))
        )
        XCTAssertEqual(
            "11700200003fffff7f8101ff",
            hex(InputPacket.encode(seq: 70000, player: 6, pad: Pad(buttons: -1, axes: [InputPacket.axis(300), InputPacket.axis(-300), 1, -1])))
        )
        XCTAssertEqual(
            "0102020000040202ce320000",
            hex(InputPacket.encode(seq: 258, player: 2, pad: Pad(buttons: Button.start1 | Button.b6 | Button.down, axes: [-50, 50, 0, 0])))
        )
    }

    func testStartButtons() {
        XCTAssertEqual(Button.start1, startOf(1))
        XCTAssertEqual(Button.start4, startOf(4))
        XCTAssertEqual(0, startOf(5))
        XCTAssertEqual(1, startButtonCount(gamePlayers: 0, seated: 0))
        XCTAssertEqual(2, startButtonCount(gamePlayers: 2, seated: 3))
        XCTAssertEqual(3, startButtonCount(gamePlayers: 0, seated: 3))
    }

    func testDpadSectors() {
        XCTAssertEqual(0, TouchPadLogic.dpadBits(dx: 0.1, dy: 0.1))
        XCTAssertEqual(Button.right, TouchPadLogic.dpadBits(dx: 1, dy: 0))
        XCTAssertEqual(Button.up | Button.right, TouchPadLogic.dpadBits(dx: 0.7, dy: -0.7))
        XCTAssertEqual(Button.right, TouchPadLogic.dpadBits(dx: 0.7, dy: -0.6, fourWay: true))
        XCTAssertEqual([Button.b1, Button.b2, Button.b3], TouchPadLogic.actionButtons(3))
        XCTAssertEqual(6, TouchPadLogic.actionButtons(9).count)
    }

    func testStandardGamepadLikeTheWeb() {
        let pad = StandardGamepad.pad(held: [StandardGamepad.faceBottom, StandardGamepad.select], lx: -0.9, ly: 0.1, rx: 0, ry: 0)
        XCTAssertEqual(Button.b1 | Button.coin | Button.left, pad.buttons)
        XCTAssertEqual([-114, 0, 0, 0], pad.axes)
        XCTAssertEqual(Button.start, StandardGamepad.bitOf(StandardGamepad.start))
        XCTAssertEqual(0, StandardGamepad.bitOf(40))
    }
}
