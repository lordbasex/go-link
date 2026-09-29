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

    private var landscapeLayout: some View {
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
