// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import GoLinkCore
import SwiftUI
import UIKit

/**
 * State of the on-screen gamepad (the website's TouchPad and the Android
 * app's TouchPadState): several fingers at once, and a finger can slide
 * from one button to the next, as on an arcade panel.
 *
 * The drawn buttons carry an invisible UIKit anchor (PadAnchor); on every
 * touch event the anchors that are in the window are measured right then
 * (`convert(bounds, to: nil)`), so the hit areas always match what is on
 * screen after a rotation or a layout swap. Nothing is keyed by a frame
 * captured earlier, and an anchor leaving the window only removes itself,
 * so the old layout's buttons going away never unregister the new ones.
 * `releaseAll` (called on every layout change) lets go of all held
 * buttons and sends 0.
 */
@MainActor
final class TouchPadState: ObservableObject {
    @Published private(set) var held = 0
    /** Buttons lit from elsewhere (a real controller), drawn but never sent. */
    @Published var shown = 0
    /**
     * A see-through pad that only shows what a real controller presses:
     * fingers are ignored. Turning it on lets go of the held buttons.
     */
    @Published var displayOnly = false {
        didSet { if displayOnly && !oldValue { releaseAll() } }
    }

    /** What the pad draws lit: the fingers' buttons and the controller's. */
    var lit: Int { held | shown }
    var fourWay: Bool {
        get { tracker.fourWay }
        set { tracker.fourWay = newValue }
    }

    private var tracker = TouchPadTracker<ObjectIdentifier>()
    private var anchors: [ObjectIdentifier: PadAnchor.AnchorView] = [:]
    private let haptic = UIImpactFeedbackGenerator(style: .light)
    private let onChange: (Int) -> Void

    init(onChange: @escaping (Int) -> Void) {
        self.onChange = onChange
    }

    func attach(_ anchor: PadAnchor.AnchorView) { anchors[ObjectIdentifier(anchor)] = anchor }
    func detach(_ anchor: PadAnchor.AnchorView) { anchors[ObjectIdentifier(anchor)] = nil }

    /** The D-pad and the buttons where they are now, in window coordinates. */
    private func geometry() -> (CGRect?, [PadTarget]) {
        var dpad: CGRect?
        var buttons: [PadTarget] = []
        for a in anchors.values where a.window != nil && !a.isHidden {
            let frame = a.convert(a.bounds, to: nil)
            if a.isDpad { dpad = frame } else if a.bit != 0 { buttons.append(PadTarget(bit: a.bit, frame: frame)) }
        }
        return (dpad, buttons)
    }

    func down(_ id: ObjectIdentifier, _ at: CGPoint) {
        let (dpad, buttons) = geometry()
        tracker.down(id, at: at, dpad: dpad, buttons: buttons)
        publish()
    }

    func move(_ id: ObjectIdentifier, _ at: CGPoint) {
        let (dpad, buttons) = geometry()
        if tracker.move(id, at: at, dpad: dpad, buttons: buttons) { publish() }
    }

    func up(_ id: ObjectIdentifier) {
        tracker.up(id)
        publish()
    }

    /** Lets go of every finger and sends 0: the layout changed, or the pad went away. */
    func releaseAll() {
        tracker.releaseAll()
        publish()
    }

    private func publish() {
        let bits = tracker.bits
        // A short tap on each new press.
        if bits & ~held != 0 { haptic.impactOccurred() }
        if bits != held {
            held = bits
            onChange(bits)
        }
    }
}

/**
 * An invisible UIKit view behind a pad control: it measures the control
 * where it really is at the moment a finger lands or moves.
 */
struct PadAnchor: UIViewRepresentable {
    let state: TouchPadState
    var bit = 0
    var isDpad = false

    func makeUIView(context: Context) -> AnchorView {
        let v = AnchorView()
        v.bit = bit
        v.isDpad = isDpad
        v.state = state
        return v
    }

    func updateUIView(_ view: AnchorView, context: Context) {
        view.bit = bit
        view.isDpad = isDpad
        if view.state !== state {
            view.state?.detach(view)
            view.state = state
            if view.window != nil { state.attach(view) }
        }
    }

    static func dismantleUIView(_ view: AnchorView, coordinator: ()) {
        MainActor.assumeIsolated { view.state?.detach(view) }
    }

    final class AnchorView: UIView {
        weak var state: TouchPadState?
        var bit = 0
        var isDpad = false

        override init(frame: CGRect) {
            super.init(frame: frame)
            isUserInteractionEnabled = false
            backgroundColor = .clear
            isAccessibilityElement = false
        }

        required init?(coder: NSCoder) { fatalError("not used") }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            MainActor.assumeIsolated {
                if window != nil { state?.attach(self) } else { state?.detach(self) }
            }
        }
    }
}

/** A part of the pad that takes fingers: the controls drawn inside, a touch layer on top. */
struct PadSurface<Content: View>: View {
    @ObservedObject var state: TouchPadState
    @ViewBuilder let content: Content

    var body: some View {
        content
            .overlay(TouchLayer(state: state))
            .opacity(state.displayOnly ? 0.55 : 1)
            .allowsHitTesting(!state.displayOnly)
    }
}

private struct TouchLayer: UIViewRepresentable {
    let state: TouchPadState

    func makeUIView(context: Context) -> TouchView {
        let v = TouchView()
        v.state = state
        return v
    }

    func updateUIView(_ view: TouchView, context: Context) { view.state = state }

    static func dismantleUIView(_ view: TouchView, coordinator: ()) {
        MainActor.assumeIsolated { view.forgetAll() }
    }

    final class TouchView: UIView {
        weak var state: TouchPadState?
        /** Fingers that started on this surface and are still down. */
        private var active = Set<ObjectIdentifier>()

        override init(frame: CGRect) {
            super.init(frame: frame)
            isMultipleTouchEnabled = true
            backgroundColor = .clear
            isAccessibilityElement = false
        }

        required init?(coder: NSCoder) { fatalError("not used") }

        /**
         * UIKit keeps sending a finger's events to the view it started on,
         * even after that view left the window (the layout swapped on a
         * rotation). Those fingers are let go and their later events are
         * ignored, so they never press the new layout's buttons.
         */
        override func willMove(toWindow newWindow: UIWindow?) {
            super.willMove(toWindow: newWindow)
            if newWindow == nil { MainActor.assumeIsolated { forgetAll() } }
        }

        func forgetAll() {
            for id in active { state?.up(id) }
            active = []
        }

        override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
            MainActor.assumeIsolated {
                guard window != nil, state?.displayOnly != true else { return }
                for t in touches {
                    let id = ObjectIdentifier(t)
                    active.insert(id)
                    state?.down(id, t.location(in: nil))
                }
            }
        }

        override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
            MainActor.assumeIsolated {
                guard window != nil else { return }
                for t in touches where active.contains(ObjectIdentifier(t)) {
                    state?.move(ObjectIdentifier(t), t.location(in: nil))
                }
            }
        }

        override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
            MainActor.assumeIsolated { lift(touches) }
        }

        override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
            MainActor.assumeIsolated { lift(touches) }
        }

        private func lift(_ touches: Set<UITouch>) {
            for t in touches {
                let id = ObjectIdentifier(t)
                if active.remove(id) != nil { state?.up(id) }
            }
        }
    }
}

/** The D-pad: a cross with the held directions lit. */
struct DPad: View {
    @ObservedObject var state: TouchPadState
    let size: CGFloat

    var body: some View {
        let held = state.lit
        Canvas { ctx, sz in
            let s = sz.width
            let arm = s / 3
            let inset = s * 0.06
            ctx.fill(Path(ellipseIn: CGRect(x: 0, y: 0, width: s, height: s)), with: .color(.black.opacity(0.13)))
            ctx.stroke(Path(ellipseIn: CGRect(x: 1, y: 1, width: s - 2, height: s - 2)), with: .color(Tokens.text.opacity(0.4)), lineWidth: 2)
            var cross = Path()
            cross.addLines([
                CGPoint(x: arm, y: inset), CGPoint(x: 2 * arm, y: inset), CGPoint(x: 2 * arm, y: arm), CGPoint(x: s - inset, y: arm),
                CGPoint(x: s - inset, y: 2 * arm), CGPoint(x: 2 * arm, y: 2 * arm), CGPoint(x: 2 * arm, y: s - inset), CGPoint(x: arm, y: s - inset),
                CGPoint(x: arm, y: 2 * arm), CGPoint(x: inset, y: 2 * arm), CGPoint(x: inset, y: arm), CGPoint(x: arm, y: arm),
            ])
            cross.closeSubpath()
            ctx.fill(cross, with: .color(Tokens.text.opacity(0.2)))
            let c = s / 2
            let t = s * 0.08
            func arrow(_ bit: Int, _ tip: CGPoint, _ a: CGPoint, _ b: CGPoint) {
                var p = Path()
                p.addLines([tip, a, b])
                p.closeSubpath()
                ctx.fill(p, with: .color(held & bit != 0 ? Tokens.accent : Tokens.text.opacity(0.6)))
            }
            arrow(PadButton.up, CGPoint(x: c, y: s * 0.12), CGPoint(x: c - t, y: s * 0.12 + t * 1.4), CGPoint(x: c + t, y: s * 0.12 + t * 1.4))
            arrow(PadButton.down, CGPoint(x: c, y: s * 0.88), CGPoint(x: c - t, y: s * 0.88 - t * 1.4), CGPoint(x: c + t, y: s * 0.88 - t * 1.4))
            arrow(PadButton.left, CGPoint(x: s * 0.12, y: c), CGPoint(x: s * 0.12 + t * 1.4, y: c - t), CGPoint(x: s * 0.12 + t * 1.4, y: c + t))
            arrow(PadButton.right, CGPoint(x: s * 0.88, y: c), CGPoint(x: s * 0.88 - t * 1.4, y: c - t), CGPoint(x: s * 0.88 - t * 1.4, y: c + t))
        }
        .frame(width: size, height: size)
        .background(PadAnchor(state: state, isDpad: true))
        .accessibilityElement()
        .accessibilityIdentifier("pad-dpad")
    }
}

/** A round action button (1 to 6), with a metal ring like the website's. */
struct ActionButtonView: View {
    @ObservedObject var state: TouchPadState
    let bit: Int
    let label: String
    let size: CGFloat

    var body: some View {
        let on = state.lit & bit != 0
        Text(label)
            .font(.system(size: size * 0.3, weight: .bold))
            .foregroundStyle(on ? Tokens.onAccent : Tokens.text)
            .frame(width: size, height: size)
            .background(Circle().fill(RadialGradient(
                colors: on ? [Tokens.accent, Color(hex: 0xB8741F)] : [Tokens.text.opacity(0.25), Tokens.text.opacity(0.1)],
                center: .center, startRadius: 0, endRadius: size / 2
            )))
            .overlay(Circle().stroke(LinearGradient(colors: [Color(hex: 0xD9DEE8), Color(hex: 0x5D667A)], startPoint: .top, endPoint: .bottom), lineWidth: 2))
            .background(PadAnchor(state: state, bit: bit))
            .accessibilityElement()
            .accessibilityLabel(label)
            .accessibilityIdentifier("pad-button-\(label)")
    }
}

/** A small capsule (Coin, 1P, 2P...). */
struct PillButtonView: View {
    @ObservedObject var state: TouchPadState
    let bit: Int
    let label: String
    var mine = false
    var tag = ""

    var body: some View {
        let on = state.lit & bit != 0
        Text(label)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(on ? Tokens.onAccent : Tokens.text)
            .padding(.horizontal, 14)
            .frame(minWidth: 56, minHeight: 36)
            .background(Capsule().fill(on ? Tokens.accent : Tokens.text.opacity(0.2)))
            .overlay(Capsule().stroke(mine ? Tokens.accent : Tokens.text.opacity(0.4), lineWidth: 1))
            .background(PadAnchor(state: state, bit: bit))
            .accessibilityElement()
            .accessibilityLabel(label)
            .accessibilityIdentifier(tag)
    }
}

/** The game's action buttons in a grid: 1-3 in one row, 4 in two, 5-6 in two rows of three. */
struct ActionButtons: View {
    @ObservedObject var state: TouchPadState
    let controls: GameControls
    let maxSize: CGFloat

    var body: some View {
        let bits = TouchPadLogic.actionButtons(controls.buttons)
        let cols = bits.count <= 3 ? max(bits.count, 1) : (bits.count == 4 ? 2 : 3)
        let rows = stride(from: 0, to: bits.count, by: cols).map { Array(bits[$0..<min($0 + cols, bits.count)]) }
        let gap: CGFloat = 12
        GeometryReader { g in
            let byWidth = (g.size.width - gap * CGFloat(cols - 1)) / CGFloat(cols)
            let byHeight = (g.size.height - gap * CGFloat(max(rows.count - 1, 0))) / CGFloat(max(rows.count, 1))
            let size = max(36, min(byWidth, byHeight, maxSize))
            VStack(spacing: gap) {
                ForEach(Array(rows.enumerated()), id: \.offset) { r, row in
                    HStack(spacing: gap) {
                        ForEach(Array(row.enumerated()), id: \.offset) { c, bit in
                            ActionButtonView(state: state, bit: bit, label: "\(r * cols + c + 1)", size: size)
                        }
                    }
                }
            }
            .frame(width: g.size.width, height: g.size.height)
        }
    }
}

/** Coin and the start buttons of each player (1P, 2P...). */
struct StartRow: View {
    @ObservedObject var state: TouchPadState
    let starts: Int
    let myPorts: [Int]
    var withCoin = true

    var body: some View {
        HStack(spacing: 8) {
            if withCoin { PillButtonView(state: state, bit: PadButton.coin, label: L("room_coin"), tag: "pad-coin") }
            ForEach(1...min(max(starts, 1), 4), id: \.self) { port in
                PillButtonView(state: state, bit: startOf(port), label: L("room_start_player", port), mine: myPorts.contains(port), tag: "pad-start-\(port)")
            }
        }
    }
}
