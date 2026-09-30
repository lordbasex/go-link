// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

#if DEBUG
import GoLinkCore
import SwiftUI

/**
 * Debug builds only (launch argument -padLab): the room's console layouts
 * with the on-screen pad and no room, so a UI test can rotate the
 * simulator and press the pad. "pad-log" lists every held-buttons value
 * sent, in order (for example "16 0" for button 1 pressed and let go);
 * the same values go to the e2e log as {"ev":"touch"} lines.
 */
struct PadLabView: View {
    @StateObject private var lab = PadLab()
    @StateObject private var screenRate = ScreenRateMonitor()

    var body: some View {
        GeometryReader { g in
            let landscape = g.size.width > g.size.height
            ZStack {
                Tokens.bg.ignoresSafeArea()
                ConsoleLayout(
                    landscape: landscape,
                    size: g.size,
                    pad: lab.pad,
                    controls: GameControls(players: 2, buttons: 6, control: "joy8way"),
                    starts: 2,
                    myPorts: [1],
                    showPad: true,
                    aspect: 4.0 / 3.0,
                    header: { _ in AnyView(Text("lab").foregroundStyle(Tokens.muted).frame(height: Tokens.control)) },
                    screen: AnyView(screen(landscape)),
                    dock: { _ in AnyView(Color.clear.frame(width: 1, height: 1)) },
                    noPad: AnyView(EmptyView())
                )
            }
            .onChange(of: landscape) { _, _ in lab.pad.releaseAll() }
        }
        .onAppear {
            screenRate.start()
            // -labGhost: the see-through, display-only pad of a real controller (for screenshots).
            if Self.args.contains("-labGhost") {
                lab.pad.displayOnly = true
                lab.pad.shown = PadButton.b1 | PadButton.b5 | PadButton.right
            }
        }
        .onDisappear { screenRate.stop() }
    }

    private static let args = ProcessInfo.processInfo.arguments

    /** -labStats: the stats overlay with fixed numbers and the measured screen rate (for screenshots). */
    private static var sampleStats: LiveStatsView {
        var s = LiveStatsView()
        s.fps = 60
        s.width = 768
        s.height = 448
        s.codec = "VP8"
        s.rttMs = 28
        s.path = .direct
        s.lossPercent = 0
        s.audioCodec = "Opus"
        s.audioKhz = 48
        return s
    }

    private func screen(_ landscape: Bool) -> some View {
        VStack(spacing: 8) {
            Text(landscape ? "landscape" : "portrait").foregroundStyle(Tokens.text)
                .accessibilityIdentifier("pad-layout")
            Text(lab.log.map(String.init).joined(separator: " "))
                .font(.caption.monospaced()).foregroundStyle(Tokens.text2).lineLimit(3)
                .accessibilityIdentifier("pad-log")
            Button("clear") { lab.log = [] }.accessibilityIdentifier("pad-clear")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Tokens.video)
        .overlay(alignment: .topLeading) {
            if Self.args.contains("-labStats") { StatsCorner(on: true, stats: Self.sampleStats, video: StreamVideo(scale: 2, width: 384, height: 224, quality: .high), screenHz: screenRate.hz) {}.padding(4) }
        }
        .overlay(alignment: Self.args.contains("-labStats") ? .bottomTrailing : .topTrailing) {
            if Self.args.contains("-labGhost") { ControllerChip(name: "DualSense Wireless Controller").frame(maxWidth: 300).padding(8) }
        }
    }
}

@MainActor
private final class PadLab: ObservableObject {
    @Published var log: [Int] = []
    private(set) var pad: TouchPadState!

    init() {
        pad = TouchPadState { [weak self] bits in
            E2eProbe.touch(bits)
            self?.log.append(bits)
        }
    }
}
#endif
