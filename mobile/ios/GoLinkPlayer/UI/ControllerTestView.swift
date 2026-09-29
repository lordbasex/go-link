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
 * name and link, and the input latency: from the moment the app gets an
 * input event to the next frame drawn after it.
 */
struct ControllerTestView: View {
    @EnvironmentObject private var app: AppModel
    @StateObject private var model = ControllerTestModel()

    var body: some View {
        GeometryReader { g in
            let landscape = g.size.width > g.size.height
            ZStack {
                Tokens.video.ignoresSafeArea()
                if landscape {
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

    /** The test card, with the title, the close button and the readouts over it. */
    private var cardArea: some View {
        ZStack {
            TestCardDrawing().ignoresSafeArea(edges: .top)
            VStack(alignment: .leading, spacing: 8) {
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
                Spacer(minLength: 0)
                readouts
            }
            .padding(12)
        }
        .clipped()
    }

    private var readouts: some View {
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
            Text(L("test_latency_note")).font(.caption2).foregroundStyle(Tokens.muted).fixedSize(horizontal: false, vertical: true)
        }
        .font(.footnote)
        .padding(10)
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
    private var link: CADisplayLink?
    private var pendingEvent: CFTimeInterval?
    private var bag = Set<AnyCancellable>()

    init() {
        pad = TouchPadState { [weak self] _ in self?.mark() }
        var changed: () -> Void = {}
        gamepads = GamepadInput { changed() }
        changed = { [weak self] in self?.controllerChanged() }
        // Republish the controllers' list for the readouts.
        gamepads.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }.store(in: &bag)
    }

    func start() {
        gamepads.start()
        let target = LinkTarget(model: self)
        let l = CADisplayLink(target: target, selector: #selector(LinkTarget.tick(_:)))
        l.add(to: .main, forMode: .common)
        link = l
    }

    func stop() {
        link?.invalidate()
        link = nil
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

    fileprivate func frame(_ link: CADisplayLink) {
        guard let t = pendingEvent else { return }
        pendingEvent = nil
        // targetTimestamp: when the frame being prepared reaches the screen.
        latency.add((link.targetTimestamp - t) * 1000)
    }

    /** CADisplayLink keeps its target strongly: a small object in between. */
    private final class LinkTarget: NSObject {
        weak var model: ControllerTestModel?

        init(model: ControllerTestModel) { self.model = model }

        @objc func tick(_ link: CADisplayLink) {
            MainActor.assumeIsolated { model?.frame(link) }
        }
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
