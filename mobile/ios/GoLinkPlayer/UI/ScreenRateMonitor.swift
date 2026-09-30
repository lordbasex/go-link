// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import GoLinkCore
import QuartzCore
import SwiftUI

/**
 * Keeps the screen at its highest refresh rate (120 Hz on ProMotion
 * iPhones and iPads) while a screen that needs it is open (the room and
 * the controller test), and measures the rate the screen really draws at.
 * A running CADisplayLink that asks for 120 Hz is what tells iOS to leave
 * ProMotion at 120: without it the screen may drop to a lower rate. Menus
 * do not use it and stay at the system's choice, which saves battery.
 * Low Power Mode and thermal limits still cap it at 60, and the reading
 * then says so.
 */
@MainActor
final class ScreenRateMonitor: ObservableObject {
    /** The fastest rate we ask for; iOS picks the closest one the screen has. */
    static let maxFps = 120
    static let range = CAFrameRateRange(minimum: 60, maximum: Float(maxFps), preferred: Float(maxFps))

    /** The measured refresh rate, nil until the first second is measured. */
    @Published private(set) var hz: Int?
    /** Called on every screen frame (the test screen measures latency with it). */
    var onFrame: ((CADisplayLink) -> Void)?
    private var link: CADisplayLink?
    private let meter = RefreshRateMeter()

    func start() {
        guard link == nil else { return }
        let l = CADisplayLink(target: LinkTarget(monitor: self), selector: #selector(LinkTarget.tick(_:)))
        l.preferredFrameRateRange = Self.range
        l.add(to: .main, forMode: .common)
        link = l
    }

    func stop() {
        link?.invalidate()
        link = nil
        meter.reset()
    }

    fileprivate func frame(_ link: CADisplayLink) {
        if let r = meter.frame(at: link.timestamp), r != hz { hz = r }
        onFrame?(link)
    }

    /** CADisplayLink keeps its target strongly: a small object in between. */
    private final class LinkTarget: NSObject {
        weak var monitor: ScreenRateMonitor?

        init(monitor: ScreenRateMonitor) { self.monitor = monitor }

        @objc func tick(_ link: CADisplayLink) {
            MainActor.assumeIsolated { monitor?.frame(link) }
        }
    }
}
