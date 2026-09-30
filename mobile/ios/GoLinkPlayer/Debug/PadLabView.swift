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
    @StateObject private var skins = SkinStore()
    @StateObject private var picture = PictureModel()
    @State private var settingsOpen = false
    @State private var statsOn = false

    var body: some View {
        GeometryReader { g in
            let landscape = g.size.width > g.size.height
            ZStack {
                Tokens.bg.ignoresSafeArea()
                if Self.value("-labSkin") != nil, let skin = skins.selected ?? skins.catalog.skins.first {
                    // -labSkin <id> [-labButtons N] [-labStarts N]: a skin around the test card
                    // (for screenshots); the gear opens Game settings, where the skin can change.
                    SkinConsoleLayout(
                        skin: skin,
                        picture: skins.background(skin, landscape: landscape),
                        landscape: landscape,
                        size: g.size,
                        insets: g.safeAreaInsets,
                        pad: lab.pad,
                        controls: GameControls(players: 2, buttons: Self.number("-labButtons", 6), control: "joy8way"),
                        starts: Self.number("-labStarts", 2),
                        myPorts: [1],
                        aspect: 4.0 / 3.0,
                        keepDock: settingsOpen,
                        header: { compact in AnyView(labHeader(compact)) },
                        screen: AnyView(cardScreen(landscape)),
                        dock: { vertical in AnyView(labDock(vertical)) }
                    )
                } else {
                    ConsoleLayout(
                        landscape: landscape,
                        size: g.size,
                        pad: lab.pad,
                        controls: GameControls(players: 2, buttons: 6, control: "joy8way"),
                        starts: 2,
                        myPorts: [1],
                        // -labNoPad: no on-screen pad (cinema mode in landscape).
                        showPad: !Self.args.contains("-labNoPad"),
                        aspect: 4.0 / 3.0,
                        header: { _ in AnyView(Text("lab").foregroundStyle(Tokens.muted).frame(height: Tokens.control)) },
                        screen: Self.args.contains("-labNoPad") ? AnyView(cardScreen(landscape)) : AnyView(screen(landscape)),
                        dock: { _ in AnyView(Color.clear.frame(width: 1, height: 1)) },
                        noPad: AnyView(Text("chat").foregroundStyle(Tokens.muted).frame(maxWidth: .infinity, maxHeight: .infinity)),
                        floatingDock: AnyView(labDock(true))
                    )
                }
                if settingsOpen {
                    GameSettingsPanel(
                        landscape: landscape,
                        picture: picture,
                        skins: skins,
                        sound: GameSound(game: .constant(1), voices: .constant(1), router: nil),
                        initialName: "",
                        onSaveName: { _ in },
                        statsOn: $statsOn,
                        onClose: { settingsOpen = false }
                    )
                    .transition(.move(edge: landscape ? .trailing : .bottom))
                    .zIndex(1)
                }
            }
            .animation(.easeOut(duration: 0.2), value: settingsOpen)
            .onChange(of: landscape) { _, _ in lab.pad.releaseAll() }
        }
        .onAppear {
            screenRate.start()
            if let id = Self.value("-labSkin") { skins.show(id) }
            // -labLit <bits>: buttons shown held, with no finger (screenshots of the pressed look).
            if let lit = Self.value("-labLit").flatMap(Int.init) { lab.pad.shown = lit }
            // -labGhost: the see-through, display-only pad of a real controller (for screenshots).
            if Self.args.contains("-labGhost") {
                lab.pad.displayOnly = true
                lab.pad.shown = PadButton.b1 | PadButton.b5 | PadButton.right
            }
        }
        .onDisappear { screenRate.stop() }
    }

    private static let args = ProcessInfo.processInfo.arguments

    private static func value(_ flag: String) -> String? {
        guard let i = args.firstIndex(of: flag), i + 1 < args.count else { return nil }
        return args[i + 1]
    }

    private static func number(_ flag: String, _ fallback: Int) -> Int { value(flag).flatMap(Int.init) ?? fallback }


    /** The test card as a still picture, with the pad log over it. */
    private func cardScreen(_ landscape: Bool) -> some View {
        ZStack(alignment: .bottom) {
            Tokens.video
            if let card = Self.card { Image(decorative: card, scale: 1).resizable().interpolation(.none).aspectRatio(4.0 / 3.0, contentMode: .fit) }
            HStack(spacing: 8) {
                // For the UI test; almost invisible in the screenshots.
                Text(landscape ? "landscape" : "portrait").font(.system(size: 6)).foregroundStyle(.white.opacity(0.05))
                    .accessibilityIdentifier("pad-layout")
                Text(lab.log.map(String.init).joined(separator: " "))
                    .font(.caption.monospaced()).foregroundStyle(.white).lineLimit(1)
                    .accessibilityIdentifier("pad-log")
                Button { lab.log = [] } label: { Color.clear.frame(width: 24, height: 24).contentShape(Rectangle()) }
                    .accessibilityLabel("clear")
                    .accessibilityIdentifier("pad-clear")
            }
            .padding(4)
        }
    }

    private static let card: CGImage? = {
        var px = PictureTestCard.rgba(t: 2)
        let w = PictureTestCard.width, h = PictureTestCard.height
        return px.withUnsafeMutableBytes { raw in
            CGContext(data: raw.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)?.makeImage()
        }
    }()

    private func labHeader(_ compact: Bool) -> some View {
        HStack(spacing: 4) {
            Image(systemName: "xmark").font(.system(size: 17, weight: .semibold)).foregroundStyle(Tokens.text2)
                .frame(width: Tokens.control, height: Tokens.control)
            if !compact {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Test pattern").font(.system(size: 16, weight: .semibold)).foregroundStyle(Tokens.text)
                    Text("P1").font(.caption).foregroundStyle(Tokens.text2)
                }
                Spacer()
            }
        }
    }

    private func labDock(_ vertical: Bool) -> some View {
        let layout = vertical ? AnyLayout(VStackLayout(spacing: 6)) : AnyLayout(HStackLayout(spacing: 6))
        return layout {
            DockButton(icon: "mic.slash", label: "mic", on: false, tag: "lab-mic") {}
            DockButton(icon: "speaker.wave.2.fill", label: "sound", on: true, tag: "lab-sound") {}
            DockButton(icon: "pause.fill", label: "pause", on: false, tag: "lab-pause") {}
            DockButton(icon: "bubble.left.and.bubble.right", label: "chat", on: false, tag: "lab-chat") {}
            DockButton(icon: "person.2", label: "players", on: false, tag: "lab-players") {}
            DockButton(icon: "gamecontroller", label: "pad", on: true, tag: "lab-pad") {}
            DockButton(icon: "gearshape", label: "settings", on: settingsOpen, tag: "lab-settings") { settingsOpen.toggle() }
        }
    }

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
