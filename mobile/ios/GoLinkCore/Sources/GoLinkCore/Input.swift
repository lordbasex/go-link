// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import Foundation

/**
 * Button bits of the "input" DataChannel. Keep in sync with
 * backend-device/pkg/input, frontend/packages/shared/src/stream.ts and the
 * Android app's Input.kt.
 */
public enum Button {
    public static let up = 1 << 0
    public static let down = 1 << 1
    public static let left = 1 << 2
    public static let right = 1 << 3
    public static let b1 = 1 << 4 // bottom face button
    public static let b2 = 1 << 5 // right
    public static let b3 = 1 << 6 // left
    public static let b4 = 1 << 7 // top
    public static let b5 = 1 << 8 // L1
    public static let b6 = 1 << 9 // R1
    public static let start = 1 << 10
    public static let coin = 1 << 11
    public static let l2 = 1 << 12
    public static let r2 = 1 << 13
    public static let l3 = 1 << 14
    public static let r3 = 1 << 15
    public static let home = 1 << 16
    public static let capture = 1 << 17

    // The start buttons of players 1 to 4, like the row of start buttons
    // on an arcade panel: any seated player can press any of them.
    public static let start1 = 1 << 18
    public static let start2 = 1 << 19
    public static let start3 = 1 << 20
    public static let start4 = 1 << 21

    /** All defined button bits. */
    public static let mask = (1 << 22) - 1

    /** The action buttons of a game, in the order MAME numbers them. */
    public static let actions = [b1, b2, b3, b4, b5, b6]
    public static let directions = up | down | left | right
}

/** Up to 4 people can play from one phone (touch + controllers). */
public let maxLocalPlayers = 4

/** One controller: button bits and sticks (LX, LY, RX, RY in -127...127). */
public struct Pad: Equatable, Sendable {
    public var buttons: Int
    public var axes: [Int]

    public init(buttons: Int = 0, axes: [Int] = [0, 0, 0, 0]) {
        self.buttons = buttons
        self.axes = axes
    }

    public var isIdle: Bool { buttons == 0 && axes.allSatisfy { $0 == 0 } }

    public static let empty = Pad()
}

public enum InputPacket {
    public static let size = 12

    /**
     * 12 bytes, big endian: uint16 sequence, uint8 local player, uint8
     * reserved, uint32 buttons, 4 x int8 stick axes. Byte for byte the
     * web's encodeInput and the Android app's InputPacket.encode.
     */
    public static func encode(seq: Int, player: Int, pad: Pad) -> [UInt8] {
        var b = [UInt8](repeating: 0, count: size)
        let s = seq & 0xFFFF
        b[0] = UInt8((s >> 8) & 0xFF)
        b[1] = UInt8(s & 0xFF)
        b[2] = UInt8(player & 0x03)
        b[3] = 0
        let bits = UInt32(truncatingIfNeeded: pad.buttons & Button.mask)
        b[4] = UInt8((bits >> 24) & 0xFF)
        b[5] = UInt8((bits >> 16) & 0xFF)
        b[6] = UInt8((bits >> 8) & 0xFF)
        b[7] = UInt8(bits & 0xFF)
        for i in 0..<4 {
            let a = i < pad.axes.count ? pad.axes[i] : 0
            b[8 + i] = UInt8(bitPattern: Int8(a.clamped(-127, 127)))
        }
        return b
    }

    /** A stick value to -127...127 (clamped and rounded like the web). */
    public static func axis(_ v: Double) -> Int { jsRound(v.clamped(-127, 127)) }
}

/** The panel start button of a port (1-4), or 0. */
public func startOf(_ port: Int) -> Int { (1...4).contains(port) ? Button.start1 << (port - 1) : 0 }

/**
 * How many panel start buttons to show: as many as people seated, but no
 * more than the game takes (players 0 = unknown, up to 4), and at least 1.
 */
public func startButtonCount(gamePlayers: Int, seated: Int) -> Int {
    let game = gamePlayers >= 1 ? min(gamePlayers, 4) : 4
    return max(1, min(game, seated))
}

public enum TouchPadLogic {
    /** Thumb offsets inside this fraction of the pad radius press nothing. */
    public static let dpadDeadzone = 0.25

    /**
     * Turns a thumb position on the D-pad into direction bits. dx and dy
     * go from -1 to 1 (right and down are positive). Eight sectors of 45
     * degrees give the diagonals; a 4-way joystick only gets the dominant
     * axis, as its real stick would.
     */
    public static func dpadBits(dx: Double, dy: Double, fourWay: Bool = false) -> Int {
        if hypot(dx, dy) < dpadDeadzone { return 0 }
        if fourWay {
            if abs(dx) >= abs(dy) { return dx < 0 ? Button.left : Button.right }
            return dy < 0 ? Button.up : Button.down
        }
        let angle = atan2(dy, dx) * 180 / Double.pi // 0 = right, 90 = down
        var bits = 0
        if angle > -67.5 && angle < 67.5 { bits |= Button.right }
        if angle > 112.5 || angle < -112.5 { bits |= Button.left }
        if angle > 22.5 && angle < 157.5 { bits |= Button.down }
        if angle < -22.5 && angle > -157.5 { bits |= Button.up }
        return bits
    }

    /** Action button bits a game with this many buttons uses (0 to 6). */
    public static func actionButtons(_ count: Int) -> [Int] {
        Array(Button.actions.prefix(count.clamped(0, Button.actions.count)))
    }

    /** Whether the D-pad should only allow four directions. */
    public static func isFourWay(_ control: String) -> Bool { control == "joy4way" }
}

/**
 * Physical controllers, mapped like the browser's Gamepad API "standard"
 * layout (frontend/packages/shared/src/gamepad.ts): the platform turns its
 * buttons into these indexes, and this table turns them into bits.
 */
public enum StandardGamepad {
    public static let faceBottom = 0
    public static let faceRight = 1
    public static let faceLeft = 2
    public static let faceTop = 3
    public static let l1 = 4
    public static let r1 = 5
    public static let l2 = 6
    public static let r2 = 7
    public static let select = 8
    public static let start = 9
    public static let l3 = 10
    public static let r3 = 11
    public static let dpadUp = 12
    public static let dpadDown = 13
    public static let dpadLeft = 14
    public static let dpadRight = 15
    public static let home = 16
    public static let capture = 17

    private static let bits = [
        Button.b1, Button.b2, Button.b3, Button.b4, Button.b5, Button.b6,
        Button.l2, Button.r2, Button.coin, Button.start, Button.l3, Button.r3,
        Button.up, Button.down, Button.left, Button.right, Button.home, Button.capture,
    ]

    /** The bit of a standard button index, or 0. */
    public static func bitOf(_ index: Int) -> Int { bits.indices.contains(index) ? bits[index] : 0 }

    /** Stick values inside this radius count as centered. */
    public static let deadzone = 0.15

    /** Stick push that also presses the matching direction. */
    public static let stickAsDpad = 0.5

    /**
     * Combines held standard buttons and the sticks (-1...1, y down) into a
     * pad: the left stick also drives the directions, since arcade games
     * are digital.
     */
    public static func pad(held: Set<Int>, lx: Double, ly: Double, rx: Double, ry: Double) -> Pad {
        var buttons = 0
        for i in held { buttons |= bitOf(i) }
        func dz(_ v: Double) -> Double { abs(v) < deadzone ? 0 : v.clamped(-1, 1) }
        let axes = [dz(lx), dz(ly), dz(rx), dz(ry)].map { jsRound($0 * 127) }
        if lx <= -stickAsDpad { buttons |= Button.left }
        if lx >= stickAsDpad { buttons |= Button.right }
        if ly <= -stickAsDpad { buttons |= Button.up }
        if ly >= stickAsDpad { buttons |= Button.down }
        return Pad(buttons: buttons, axes: axes)
    }
}
