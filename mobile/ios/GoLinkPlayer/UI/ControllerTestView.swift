// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import Combine
import GoLinkCore
import QuartzCore
import SwiftUI

/**
 * "Test controller": an offline screen (no device, no network) to try the
 * on-screen pad and a real controller before a game. A test card in the
 * style of PM5544 (grey grid, color bars, a circle) with a controller
 * diagram whose buttons light up for both, the connected controller's
 * name and link, the input latency (from the moment the app gets an
 * input event to the next frame drawn after it) and the screen's measured
 * refresh rate, kept at 120 Hz on ProMotion screens while it is open.
 */
struct ControllerTestView: View {
    @EnvironmentObject private var app: AppModel
    @StateObject private var model = ControllerTestModel()
    @StateObject private var skins = SkinStore()

    var body: some View {
        GeometryReader { g in
            let landscape = g.size.width > g.size.height
            ZStack {
                Tokens.video.ignoresSafeArea()
                if let skin = skins.selected {
                    // The player's own skin, as in a room: the test card is the game.
                    SkinConsoleLayout(
                        skin: skin,
                        picture: skins.background(skin, landscape: landscape),
                        landscape: landscape,
                        size: g.size,
                        insets: g.safeAreaInsets,
                        pad: model.pad,
                        controls: GameControls(players: 1, buttons: 6, control: "joy8way"),
                        starts: 1,
                        myPorts: [1],
                        aspect: 4.0 / 3.0,
                        keepDock: true,
                        startBit: { _ in PadButton.start },
                        startLabel: { _ in L("test_start") },
                        header: { _ in AnyView(titleBar) },
                        screen: AnyView(skinScreen),
                        dock: { vertical in
                            AnyView(Group {
                                if vertical {
                                    VStack(spacing: 6) { extraLamps }
                                } else {
                                    HStack(spacing: 6) { extraLamps }
                                }
                            }
                            .padding(6))
                        }
                    )
                } else if landscape {
                    HStack(spacing: 0) {
                        cardArea.frame(width: g.size.width * 0.5)
                        diagram(width: g.size.width * 0.5 - 16, height: g.size.height - 16).padding(8)
                    }
                } else {
                    VStack(spacing: 0) {
                        cardArea.frame(height: g.size.height * 0.5)
                        diagram(width: g.size.width - 16, height: g.size.height * 0.5 - 16).padding(8)
                    }
                }
            }
            .onChange(of: landscape) { _, _ in model.pad.releaseAll() }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("test-controller-screen")
        .onAppear { model.start() }
        .onDisappear { model.stop() }
    }

    /** In a skin: the test card with the readouts over its lower part. */
    private var skinScreen: some View {
        ZStack(alignment: .bottom) {
            TestCardDrawing()
            readouts(compact: true).padding(6)
        }
    }

    /** The extra buttons a controller has and the pad does not, in the skin's menu capsule. */
    @ViewBuilder private var extraLamps: some View {
        ForEach(extras, id: \.1) { bit, label in ExtraLamp(state: model.pad, bit: bit, label: label) }
    }

    /** The title and the close button. */
    private var titleBar: some View {
        HStack {
            Text(L("test_title")).font(.headline).foregroundStyle(Tokens.text)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(Capsule().fill(Tokens.video.opacity(0.7)))
                .accessibilityAddTraits(.isHeader)
            Spacer()
            closeButton
        }
    }

    private var closeButton: some View {
        SwiftUI.Button { app.screen = .home } label: {
            Image(systemName: "xmark").font(.system(size: 16, weight: .semibold)).foregroundStyle(Tokens.text)
                .frame(width: 36, height: 36)
                .background(Circle().fill(Tokens.video.opacity(0.7)))
                .overlay(Circle().stroke(Tokens.borderStrong, lineWidth: 1))
                .frame(width: Tokens.control, height: Tokens.control)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L("test_close"))
        .accessibilityIdentifier("test-close")
    }

    /**
     * The test card with the title and the close button over its top
     * corners, and the readouts under it, so nothing covers the circle.
     */
    private var cardArea: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .top) {
                TestCardDrawing().ignoresSafeArea(edges: .top)
                HStack {
                    Text(L("test_title")).font(.headline).foregroundStyle(Tokens.text)
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(Capsule().fill(Tokens.video.opacity(0.7)))
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                    SwiftUI.Button { app.screen = .home } label: {
                        Image(systemName: "xmark").font(.system(size: 16, weight: .semibold)).foregroundStyle(Tokens.text)
                            .frame(width: 36, height: 36)
                            .background(Circle().fill(Tokens.video.opacity(0.7)))
                            .overlay(Circle().stroke(Tokens.borderStrong, lineWidth: 1))
                            .frame(width: Tokens.control, height: Tokens.control)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L("test_close"))
                    .accessibilityIdentifier("test-close")
                }
                .padding(12)
            }
            .clipped()
            readouts(compact: false).padding(.horizontal, 8).padding(.vertical, 6)
        }
    }

    /** The controller, the latency and the screen's rate; compact over the picture of a skin. */
    private func readouts(compact: Bool) -> some View {
        let lat = model.latency
        func ms(_ v: Double?) -> String { v.map { String(format: "%.0f", $0) } ?? "–" }
        return VStack(alignment: .leading, spacing: 4) {
            if let c = model.gamepads.connected.first {
                Label(L("test_controller_line", c.name, L(c.link == .wired ? "test_link_wired" : "test_link_bluetooth")), systemImage: "gamecontroller.fill")
                    .foregroundStyle(Tokens.text)
                    .accessibilityIdentifier("test-controller-name")
                if model.gamepads.connected.count > 1 {
                    Text(L("test_more_controllers", model.gamepads.connected.count - 1)).foregroundStyle(Tokens.muted)
                }
            } else {
                Text(L("test_no_controller")).foregroundStyle(Tokens.text2).fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("test-controller-name")
            }
            Text(L("test_latency", ms(lat.last), ms(lat.min), ms(lat.average)))
                .font(.system(size: 13, weight: .medium, design: .monospaced)).foregroundStyle(Tokens.voice)
                .accessibilityIdentifier("test-latency")
            Text(L("test_screen", ScreenRate.label(model.screen.hz), ScreenRate.frameMs(model.screen.hz)))
                .font(.system(size: 13, weight: .medium, design: .monospaced)).foregroundStyle(Tokens.voice)
                .accessibilityIdentifier("test-screen-rate")
            if !compact {
                Text(L("test_latency_note")).font(.caption2).foregroundStyle(Tokens.muted).fixedSize(horizontal: false, vertical: true)
            }
        }
        .font(compact ? .caption : .footnote)
        .lineLimit(compact ? 2 : nil)
        .minimumScaleFactor(compact ? 0.7 : 1)
        .padding(compact ? 6 : 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(Tokens.video.opacity(0.72)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Tokens.voice.opacity(0.35), lineWidth: 1))
    }

    /** The controller: D-pad, buttons 1 to 6, Coin and Start, plus the extra buttons a controller has. */
    private func diagram(width: CGFloat, height: CGFloat) -> some View {
        let pad: TouchPadState = model.pad
        let dpad = min(170, width * 0.4, height * 0.62)
        return PadSurface(state: pad) {
            VStack(spacing: 10) {
                HStack(spacing: 8) {
                    ForEach(extras, id: \.1) { bit, label in ExtraLamp(state: pad, bit: bit, label: label) }
                }
                HStack(alignment: .center) {
                    DPad(state: pad, size: dpad)
                    Spacer(minLength: 8)
                    ActionButtons(state: pad, controls: GameControls(players: 1, buttons: 6, control: "joy8way"), maxSize: 64)
                        .frame(maxWidth: width * 0.5, maxHeight: dpad)
                }
                HStack(spacing: 10) {
                    PillButtonView(state: pad, bit: PadButton.coin, label: L("room_coin"), tag: "pad-coin")
                    PillButtonView(state: pad, bit: PadButton.start, label: L("test_start"), tag: "pad-start")
                }
            }
            .padding(12)
            .frame(width: width, height: height)
            .background(RoundedRectangle(cornerRadius: 28).fill(Tokens.surface))
            .overlay(RoundedRectangle(cornerRadius: 28).stroke(Tokens.borderStrong, lineWidth: 1))
            .contentShape(Rectangle())
        }
    }

    private var extras: [(Int, String)] {
        [(PadButton.l2, "L2"), (PadButton.r2, "R2"), (PadButton.l3, "L3"), (PadButton.r3, "R3"), (PadButton.home, "Home")]
    }
}

/** A small lamp for a controller button the on-screen pad does not have. */
private struct ExtraLamp: View {
    @ObservedObject var state: TouchPadState
    let bit: Int
    let label: String

    var body: some View {
        let on = state.lit & bit != 0
        Text(label).font(.system(size: 11, weight: .bold))
            .foregroundStyle(on ? Tokens.onAccent : Tokens.muted)
            .padding(.horizontal, 8).frame(height: 22)
            .background(Capsule().fill(on ? Tokens.accent : Tokens.sunken))
            .overlay(Capsule().stroke(Tokens.border, lineWidth: 1))
            .accessibilityLabel(label)
            .accessibilityValue(on ? L("test_pressed") : "")
    }
}

@MainActor
final class ControllerTestModel: ObservableObject {
    private(set) var pad: TouchPadState!
    private(set) var gamepads: GamepadInput!
    @Published private(set) var latency = LatencyMeter(window: 60)
    /** Keeps the screen at 120 Hz where it can, measures it and times each input. */
    let screen = ScreenRateMonitor()
    private var pendingEvent: CFTimeInterval?
    private var bag = Set<AnyCancellable>()

    init() {
        pad = TouchPadState { [weak self] _ in self?.mark() }
        var changed: () -> Void = {}
        gamepads = GamepadInput { changed() }
        changed = { [weak self] in self?.controllerChanged() }
        // Republish the controllers' list and the screen rate for the readouts.
        gamepads.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }.store(in: &bag)
        screen.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }.store(in: &bag)
        screen.onFrame = { [weak self] link in self?.frame(link) }
    }

    func start() {
        gamepads.start()
        screen.start()
    }

    func stop() {
        screen.stop()
        gamepads.stop()
        pad.releaseAll()
    }

    private func controllerChanged() {
        let bits = gamepads.heldBits()
        if bits != pad.shown {
            pad.shown = bits
            mark()
        }
    }

    /** An input changed now: the next frame measures how long it took to show. */
    private func mark() {
        if pendingEvent == nil { pendingEvent = CACurrentMediaTime() }
    }

    private func frame(_ link: CADisplayLink) {
        guard let t = pendingEvent else { return }
        pendingEvent = nil
        // targetTimestamp: when the frame being prepared reaches the screen.
        latency.add((link.targetTimestamp - t) * 1000)
    }
}

/**
 * A test card in the style of PM5544, drawn in code like the device's
 * test pattern room: a grey grid, a big circle, color bars and a grey
 * scale across the middle, and black and white blocks.
 */
struct TestCardDrawing: View {
    var body: some View {
        Canvas { ctx, size in
            let w = size.width, h = size.height
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(white: 0.42)))
            let cell = max(24, min(w, h) / 9)
            var grid = Path()
            var x = (w.truncatingRemainder(dividingBy: cell)) / 2
            while x <= w { grid.move(to: CGPoint(x: x, y: 0)); grid.addLine(to: CGPoint(x: x, y: h)); x += cell }
            var y = (h.truncatingRemainder(dividingBy: cell)) / 2
            while y <= h { grid.move(to: CGPoint(x: 0, y: y)); grid.addLine(to: CGPoint(x: w, y: y)); y += cell }
            ctx.stroke(grid, with: .color(.white.opacity(0.85)), lineWidth: 1.5)

            let r = min(w, h) * 0.44
            let c = CGPoint(x: w / 2, y: h / 2)
            let circle = Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r))
            ctx.fill(circle, with: .color(Color(white: 0.3)))
            ctx.drawLayer { inner in
                inner.clip(to: circle)
                // Top: black and white blocks; middle: color bars; below: a grey scale.
                let band = r * 0.42
                let top = c.y - band * 1.5
                for i in 0..<6 {
                    let bw = 2 * r / 6
                    inner.fill(Path(CGRect(x: c.x - r + CGFloat(i) * bw, y: top, width: bw, height: band)), with: .color(i % 2 == 0 ? .black : .white))
                }
                let bars: [Color] = [.white, .yellow, .cyan, .green, Color(red: 1, green: 0, blue: 1), .red, .blue, .black]
                let barW = 2 * r / CGFloat(bars.count)
                for (i, col) in bars.enumerated() {
                    inner.fill(Path(CGRect(x: c.x - r + CGFloat(i) * barW, y: top + band, width: barW + 0.5, height: band)), with: .color(col))
                }
                for i in 0..<6 {
                    let gw = 2 * r / 6
                    inner.fill(Path(CGRect(x: c.x - r + CGFloat(i) * gw, y: top + 2 * band, width: gw + 0.5, height: band)), with: .color(Color(white: Double(i) / 5)))
                }
            }
            ctx.stroke(circle, with: .color(.white), lineWidth: 2)
            var cross = Path()
            cross.move(to: CGPoint(x: c.x - 10, y: c.y)); cross.addLine(to: CGPoint(x: c.x + 10, y: c.y))
            cross.move(to: CGPoint(x: c.x, y: c.y - 10)); cross.addLine(to: CGPoint(x: c.x, y: c.y + 10))
            ctx.stroke(cross, with: .color(.white), lineWidth: 2)
        }
        .accessibilityHidden(true)
    }
}
