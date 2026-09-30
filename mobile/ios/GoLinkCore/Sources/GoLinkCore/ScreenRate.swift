// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import Foundation

/**
 * The screen's refresh rate: which display mode to ask for (the fastest
 * one at the current resolution) and how fast the screen really draws,
 * measured from the frame callbacks (CADisplayLink on iOS, Choreographer
 * on Android). A port of the Android app's ScreenRate.kt.
 */
public enum ScreenRate {
    /** A display mode as the platform lists it. */
    public struct Mode: Equatable, Sendable {
        public var id: Int
        public var width: Int
        public var height: Int
        public var refreshHz: Double

        public init(id: Int, width: Int, height: Int, refreshHz: Double) {
            self.id = id
            self.width = width
            self.height = height
            self.refreshHz = refreshHz
        }
    }

    /**
     * The mode with the current mode's resolution (in either orientation)
     * and the highest refresh rate. A tie, or no faster mode, keeps the
     * current one, so asking for it never changes the resolution.
     */
    public static func fastest(_ modes: [Mode], current: Mode) -> Mode {
        let same = modes.filter {
            ($0.width == current.width && $0.height == current.height) || ($0.width == current.height && $0.height == current.width)
        }
        var best = current
        for m in same where m.refreshHz > best.refreshHz + 0.5 { best = m }
        return best
    }

    /** Common panel rates: a measurement within 3 % of one of them is that rate. */
    public static let commonRates: [Int] = [24, 25, 30, 48, 50, 60, 72, 75, 90, 96, 100, 120, 144, 165, 240]

    /** A measured rate as a whole number, snapped to a common panel rate when it is close. */
    public static func snap(_ hz: Double) -> Int? {
        guard hz.isFinite, hz >= 1 else { return nil }
        if let near = commonRates.min(by: { abs(Double($0) - hz) < abs(Double($1) - hz) }), abs(Double(near) - hz) <= Double(near) * 0.03 {
            return near
        }
        return Int(hz.rounded())
    }

    /** "120 Hz", or a dash while there is no reading. */
    public static func label(_ hz: Int?) -> String {
        guard let hz, hz > 0 else { return "–" }
        return "\(hz) Hz"
    }

    /** One screen frame in milliseconds, as the test screen prints it: "8.3", "16.7". */
    public static func frameMs(_ hz: Int?) -> String {
        guard let hz, hz > 0 else { return "–" }
        return String(format: "%.1f", 1000 / Double(hz))
    }
}

/**
 * Measures the screen's refresh rate from frame timestamps (in seconds):
 * the median time between frames over about a second, so a missed frame
 * (the app was busy) does not read as a slower screen.
 */
public final class RefreshRateMeter {
    private let window: Double
    private var start: Double?
    private var last: Double?
    private var intervals: [Double] = []

    public init(window: Double = 1.0) { self.window = window }

    public func reset() {
        start = nil
        last = nil
        intervals.removeAll()
    }

    /** Adds one frame; returns a reading each time a window is complete. */
    public func frame(at t: Double) -> Int? {
        defer { last = t }
        guard let last else {
            start = t
            return nil
        }
        let dt = t - last
        // A pause (the app in the background, a long hitch) starts over.
        if dt <= 0 || dt > 0.25 {
            start = t
            intervals.removeAll()
            return nil
        }
        intervals.append(dt)
        guard let start, t - start >= window, intervals.count >= 5 else { return nil }
        let sorted = intervals.sorted()
        let median = sorted[sorted.count / 2]
        self.start = t
        intervals.removeAll()
        return ScreenRate.snap(1 / median)
    }
}
