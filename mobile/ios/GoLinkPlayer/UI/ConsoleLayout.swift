// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import GoLinkCore
import SwiftUI

/**
 * The room's two console layouts: portrait is a Game Boy (picture on top,
 * pad below); landscape is a Switch (pad halves on both sides). The room
 * passes its header, picture, dock and the view shown without a pad; the
 * debug pad lab passes stand-ins, so both run the very same pad layout.
 */
struct ConsoleLayout: View {
    let landscape: Bool
    let size: CGSize
    let pad: TouchPadState
    let controls: GameControls
    let starts: Int
    let myPorts: [Int]
    let showPad: Bool
    let aspect: CGFloat
    let header: (_ compact: Bool) -> AnyView
    let screen: AnyView
    let dock: (_ vertical: Bool) -> AnyView
    let noPad: AnyView
    /** Cinema mode (landscape, no pad): the room's buttons as a column for the floating capsule. */
    var floatingDock: AnyView? = nil
    /** Keeps the floating capsule shown (a sheet or the drawer is open). */
    var keepDock = false
    @State private var wake = 0

    var body: some View {
        if landscape { landscapeLayout } else { portraitLayout }
    }

    private var portraitLayout: some View {
        VStack(spacing: 0) {
            header(false)
            screen
                .frame(width: size.width, height: size.width / min(max(aspect, 1), 2))
            dock(false)
            if showPad {
                PadSurface(state: pad) {
                    VStack(spacing: 8) {
                        HStack(alignment: .center) {
                            DPad(state: pad, size: min(170, size.width * 0.42))
                            Spacer(minLength: 12)
                            ActionButtons(state: pad, controls: controls, maxSize: 72)
                                .frame(maxWidth: min(220, size.width * 0.48), maxHeight: 190)
                        }
                        .frame(maxHeight: .infinity)
                        StartRow(state: pad, starts: starts, myPorts: myPorts)
                        Text("go-link").font(.system(size: 12, weight: .bold)).foregroundStyle(Tokens.faint.opacity(0.5))
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .contentShape(Rectangle())
                }
            } else {
                // No pad: the chat fills the space under the picture.
                noPad
                    .padding(.horizontal, 12)
                    .frame(maxHeight: .infinity)
            }
        }
    }

    @ViewBuilder private var landscapeLayout: some View {
        if !showPad, let floatingDock { cinemaLayout(floatingDock) } else { padLandscape }
    }

    /**
     * Landscape without the on-screen pad (a controller in hand, or the pad
     * turned off): the picture as large as the screen allows, the sides
     * filled by the picture's own sides style (Ambient by default), the
     * leave button at the top left and the room's buttons in a floating
     * capsule on the right that folds away after 3 s like a skin's menu.
     */
    private func cinemaLayout(_ items: AnyView) -> some View {
        ZStack {
            screen
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .simultaneousGesture(TapGesture().onEnded { wake += 1 })
                .environment(\.screenTrailingInset, 64)
            // The leave button rides at the top of the capsule, so the picture's corners stay free
            // for the stats (left) and the controller (right).
            FloatingDock(keep: keepDock, wake: wake, maxHeight: size.height - 16) {
                VStack(spacing: 6) {
                    header(true)
                    Rectangle().fill(.white.opacity(0.14)).frame(width: 28, height: 1)
                    items
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
            .padding(.trailing, 8)
        }
    }

    private var padLandscape: some View {
        HStack(spacing: 0) {
            if showPad {
                PadSurface(state: pad) {
                    VStack(spacing: 10) {
                        header(true).frame(maxWidth: .infinity, alignment: .leading)
                        Spacer(minLength: 0)
                        DPad(state: pad, size: min(150, size.height * 0.42, size.width * 0.2))
                        Spacer(minLength: 0)
                        PillButtonView(state: pad, bit: PadButton.coin, label: L("room_coin"), tag: "pad-coin")
                    }
                    .padding(8)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .contentShape(Rectangle())
                }
                .frame(width: size.width * 0.24)
            } else {
                header(true).frame(width: 60).frame(maxHeight: .infinity, alignment: .top)
            }
            screen
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            if showPad {
                PadSurface(state: pad) {
                    VStack(spacing: 10) {
                        StartRow(state: pad, starts: starts, myPorts: myPorts, withCoin: false)
                            .scaleEffect(starts > 2 ? 0.8 : 1)
                        ActionButtons(state: pad, controls: controls, maxSize: 64)
                            .frame(maxHeight: size.height * 0.6)
                    }
                    .padding(8)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .contentShape(Rectangle())
                }
                .frame(width: size.width * 0.22)
            }
            dock(true).frame(width: 56)
        }
    }
}

/**
 * The room's buttons in a see-through capsule over the picture that folds
 * into a small handle after 3 s (never while VoiceOver is on or a sheet is
 * open); a tap on the picture (`wake` changes) or on the handle brings it
 * back.
 */
struct FloatingDock<Content: View>: View {
    var keep = false
    var wake = 0
    /** The capsule shrinks to fit this height (a short landscape screen). */
    var maxHeight: CGFloat = .infinity
    @ViewBuilder let content: Content
    @State private var shown = true
    @State private var task: Task<Void, Never>?
    @State private var natural: CGSize = .zero

    var body: some View {
        Group {
            if shown || keep || UIAccessibility.isVoiceOverRunning {
                content
                    .fixedSize()
                    .padding(6)
                    .background(Capsule().fill(Tokens.video.opacity(0.55)))
                    .overlay(Capsule().stroke(.white.opacity(0.14), lineWidth: 1))
                    .background(GeometryReader { g in
                        Color.clear.onAppear { natural = g.size }.onChange(of: g.size) { _, s in natural = s }
                    })
                    .scaleEffect(natural.height > maxHeight ? maxHeight / natural.height : 1)
                    .transition(.opacity)
            } else {
                SwiftUI.Button(action: show) {
                    Capsule().fill(.white.opacity(0.4)).frame(width: 6, height: 46)
                        .frame(width: Tokens.control, height: 88)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L("room_show_menu"))
                .accessibilityIdentifier("dock-handle")
                .transition(.opacity)
            }
        }
        .onAppear(perform: show)
        .onChange(of: wake) { _, _ in show() }
        .onChange(of: keep) { _, _ in show() }
        .onDisappear { task?.cancel() }
    }

    private func show() {
        withAnimation(.easeOut(duration: 0.2)) { shown = true }
        task?.cancel()
        task = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            guard !Task.isCancelled, !keep else { return }
            withAnimation(.easeOut(duration: 0.3)) { shown = false }
        }
    }
}

/** Room on the right of the picture kept free for a floating capsule (cinema mode). */
private struct ScreenTrailingInsetKey: EnvironmentKey {
    static let defaultValue: CGFloat = 0
}

extension EnvironmentValues {
    var screenTrailingInset: CGFloat {
        get { self[ScreenTrailingInsetKey.self] }
        set { self[ScreenTrailingInsetKey.self] = newValue }
    }
}

/** Keeps a corner overlay (the controller button) clear of the floating capsule. */
struct TrailingInsetPadding: ViewModifier {
    @Environment(\.screenTrailingInset) private var inset

    func body(content: Content) -> some View { content.padding(.trailing, inset) }
}
