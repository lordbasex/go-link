// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import CoreGraphics
import Foundation

/** A drawn pad button and where it is right now (window coordinates). */
public struct PadTarget: Equatable, Sendable {
    public var bit: Int
    public var frame: CGRect

    public init(bit: Int, frame: CGRect) {
        self.bit = bit
        self.frame = frame
    }
}

/**
 * The fingers on the on-screen gamepad: several at once (the D-pad and a
 * button together), and a finger can slide from one button to the next,
 * as on an arcade panel.
 *
 * It keeps no geometry: every event gets the buttons' frames as they are
 * at that moment, so a rotation or a new layout can never leave it
 * hit-testing old positions. When the layout changes, `releaseAll` drops
 * every finger (held buttons go back to 0) and later events of those
 * fingers are ignored until they are lifted, so a finger that was held
 * across a rotation never lands on whatever button now sits under it.
 */
public struct TouchPadTracker<Finger: Hashable> {
    /** Extra room around a button that still counts as a press. */
    public static var buttonSlop: CGFloat { 4 }
    /** Extra room around the D-pad that still starts a direction. */
    public static var dpadSlop: CGFloat { 8 }

    public var fourWay = false
    private var fingers: [Finger: Int] = [:]
    private var dpadFingers: [Finger: Int] = [:]

    public init() {}

    /** The buttons held by all fingers. */
    public var bits: Int {
        var b = 0
        for v in dpadFingers.values { b |= v }
        for v in fingers.values { b |= v }
        return b
    }

    /** Fingers currently tracked. */
    public var fingerCount: Int { fingers.count + dpadFingers.count }

    public mutating func down(_ finger: Finger, at: CGPoint, dpad: CGRect?, buttons: [PadTarget]) {
        fingers[finger] = nil
        dpadFingers[finger] = nil
        if let d = dpad, d.insetBy(dx: -Self.dpadSlop, dy: -Self.dpadSlop).contains(at) {
            dpadFingers[finger] = Self.dpadBits(d, at, fourWay: fourWay)
        } else {
            fingers[finger] = Self.hit(at, buttons)
        }
    }

    /** Returns false when the finger is not tracked (lifted, or dropped by a layout change). */
    @discardableResult
    public mutating func move(_ finger: Finger, at: CGPoint, dpad: CGRect?, buttons: [PadTarget]) -> Bool {
        if dpadFingers[finger] != nil {
            // A thumb that started on the D-pad keeps steering it; if the
            // D-pad is gone, the thumb presses nothing.
            dpadFingers[finger] = dpad.map { Self.dpadBits($0, at, fourWay: fourWay) } ?? 0
            return true
        }
        if fingers[finger] != nil {
            fingers[finger] = Self.hit(at, buttons)
            return true
        }
        return false
    }

    public mutating func up(_ finger: Finger) {
        fingers[finger] = nil
        dpadFingers[finger] = nil
    }

    /** Lets go of everything: the layout changed or the pad went away. */
    public mutating func releaseAll() {
        fingers = [:]
        dpadFingers = [:]
    }

    /**
     * The button under a point. Where slop areas overlap, the button whose
     * center is nearest wins, so the result never depends on ordering.
     */
    public static func hit(_ at: CGPoint, _ buttons: [PadTarget]) -> Int {
        var best = 0
        var bestDistance = CGFloat.infinity
        for b in buttons where !b.frame.isEmpty && b.frame.insetBy(dx: -buttonSlop, dy: -buttonSlop).contains(at) {
            let d = hypot(at.x - b.frame.midX, at.y - b.frame.midY)
            if d < bestDistance {
                bestDistance = d
                best = b.bit
            }
        }
        return best
    }

    static func dpadBits(_ d: CGRect, _ at: CGPoint, fourWay: Bool) -> Int {
        let radius = max(d.width, d.height) / 2
        guard radius > 0 else { return 0 }
        return TouchPadLogic.dpadBits(dx: Double((at.x - d.midX) / radius), dy: Double((at.y - d.midY) / radius), fourWay: fourWay)
    }
}
