// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import AVFoundation
import GoLinkCore
import SwiftUI

/**
 * The startup intro, only on a cold start: the go-link mark pops in with a
 * soft orange glow, "go-link" rises, then "INSERT COIN" rises with the coin
 * sound and blinks. About two seconds; a tap anywhere skips it. With
 * Reduce Motion everything just fades in. The website's loading screen and
 * the Android app play the same intro.
 */
struct IntroView: View {
    /** Set once per process, so returning from the background never shows it again. */
    nonisolated(unsafe) static var played = false

    let playSound: Bool
    let onDone: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var start = Date()
    @State private var leaving = false
    @State private var soundPlayed = false
    @State private var coin = CoinSound()

    /** Timings are multiplied by this (debug: -introSlow <factor>, to catch frames). */
    private static let slow: Double = {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-introSlow"), i + 1 < args.count, let f = Double(args[i + 1]), f > 0 { return f }
        #endif
        return 1
    }()

    static let soundAt = 1.1
    static let endAt = 2.0

    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSince(start) / Self.slow
            frame(t)
        }
        .opacity(leaving ? 0 : 1)
        .contentShape(Rectangle())
        .onTapGesture { finish(fast: true) }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("go-link, INSERT COIN")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { finish(fast: true) }
        .onAppear {
            start = Date()
            if playSound { coin.prepare() }
            let soundAt = (reduceMotion ? 0.3 : Self.soundAt) * Self.slow
            DispatchQueue.main.asyncAfter(deadline: .now() + soundAt) { coinTime() }
            DispatchQueue.main.asyncAfter(deadline: .now() + Self.endAt * Self.slow) { finish() }
        }
    }

    private func frame(_ t: Double) -> some View {
        let s = Self.state(t, reduceMotion: reduceMotion)
        return GeometryReader { geo in
            ZStack {
                Color(hex: 0x05060A)
                RadialGradient(
                    colors: [Color(hex: 0x1B2030), Color(hex: 0x05060A)],
                    center: UnitPoint(x: 0.5, y: 0.42),
                    startRadius: 0,
                    endRadius: 0.7 * max(geo.size.width, geo.size.height)
                )
                .opacity(s.background)
                VStack(spacing: 26) {
                    IntroMark()
                        .frame(width: 132, height: 132)
                        .shadow(color: Tokens.accent.opacity(0.45 * s.glow), radius: 30 * s.glow)
                        .scaleEffect(s.markScale)
                        .opacity(s.markOpacity)
                    (Text("go") + Text("-").foregroundColor(Tokens.accent) + Text("link"))
                        .font(.system(size: 44, weight: .bold))
                        .kerning(0.44)
                        .foregroundStyle(Tokens.text)
                        .offset(y: s.nameOffset)
                        .opacity(s.nameOpacity)
                    PixelLabel(text: "INSERT COIN", pixel: 3)
                        .offset(y: s.coinOffset)
                        .opacity(s.coinOpacity)
                }
            }
            .ignoresSafeArea()
        }
        .ignoresSafeArea()
    }

    private func coinTime() {
        guard !soundPlayed, !leaving else { return }
        soundPlayed = true
        if playSound { coin.play() }
    }

    private func finish(fast: Bool = false) {
        guard !leaving else { return }
        withAnimation(.easeOut(duration: fast ? 0.15 : 0.3)) { leaving = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + (fast ? 0.15 : 0.3)) { onDone() }
    }

    struct Frame {
        var background = 1.0
        var markScale = 1.0
        var markOpacity = 1.0
        var glow = 0.0
        var nameOffset = 0.0
        var nameOpacity = 1.0
        var coinOffset = 0.0
        var coinOpacity = 1.0
    }

    /** What the intro looks like t seconds in. */
    static func state(_ t: Double, reduceMotion: Bool) -> Frame {
        var s = Frame()
        if reduceMotion {
            let a = clamp(t / 0.3)
            s.background = a
            s.markOpacity = a
            s.nameOpacity = a
            s.coinOpacity = a
            return s
        }
        s.background = clamp(t / 0.2)
        // Pop: 0.3 -> 1.12 (60 %) -> 1 over 0.7 s.
        let p = clamp(t / 0.7)
        if p < 0.6 {
            s.markScale = 0.3 + (1.12 - 0.3) * easeOut(p / 0.6)
            s.markOpacity = p / 0.6
        } else {
            s.markScale = 1.12 - 0.12 * easeInOut((p - 0.6) / 0.4)
        }
        // Glow: a 1.6 s pulse from 0.7 s.
        if t > 0.7 { s.glow = 0.5 - 0.5 * cos(2 * .pi * (t - 0.7) / 1.6) }
        // Name rises at 0.6 s over 0.5 s.
        let n = easeOut(clamp((t - 0.6) / 0.5))
        s.nameOffset = 16 * (1 - n)
        s.nameOpacity = n
        // INSERT COIN rises at 1.1 s over 0.4 s, then blinks 0.5 s on / 0.5 s off.
        let c = easeOut(clamp((t - soundAt) / 0.4))
        s.coinOffset = 16 * (1 - c)
        s.coinOpacity = c
        if t >= 1.5 && Int(((t - 1.5) / 0.5).rounded(.down)) % 2 == 1 { s.coinOpacity = 0 }
        return s
    }

    private static func clamp(_ v: Double) -> Double { min(1, max(0, v)) }
    private static func easeOut(_ v: Double) -> Double { 1 - pow(1 - v, 3) }
    private static func easeInOut(_ v: Double) -> Double { v < 0.5 ? 4 * v * v * v : 1 - pow(-2 * v + 2, 3) / 2 }
}

/** The go-link mark (the app icon's orange tile and gamepad), drawn so it stays sharp at any size. */
struct IntroMark: View {
    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            ZStack {
                RoundedRectangle(cornerRadius: side * 32 / 132, style: .continuous).fill(Tokens.accent)
                Canvas { ctx, size in
                    // The 24-unit gamepad icon, 84/132 of the tile.
                    let u = size.width * (84.0 / 132.0) / 24
                    let o = (size.width - 24 * u) / 2
                    func pt(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: o + x * u, y: o + y * u) }
                    var path = Path(roundedRect: CGRect(origin: pt(2, 7), size: CGSize(width: 20 * u, height: 11 * u)), cornerRadius: 5.5 * u)
                    path.move(to: pt(7, 11)); path.addLine(to: pt(7, 14))
                    path.move(to: pt(5.5, 12.5)); path.addLine(to: pt(8.5, 12.5))
                    for (x, y) in [(16.0, 11.5), (18.2, 13.8)] {
                        path.addEllipse(in: CGRect(x: o + (x - 1.2) * u, y: o + (y - 1.2) * u, width: 2.4 * u, height: 2.4 * u))
                    }
                    ctx.stroke(path, with: .color(Tokens.onAccent), style: StrokeStyle(lineWidth: 2 * u, lineCap: .round, lineJoin: .round))
                }
            }
            .frame(width: side, height: side)
        }
        .accessibilityHidden(true)
    }
}

/** Arcade pixel lettering (GoLinkCore.PixelText), drawn square by square. */
struct PixelLabel: View {
    let text: String
    var pixel: CGFloat = 3
    var color: Color = Tokens.accent

    var body: some View {
        let rows = PixelText.rows(for: text)
        let width = CGFloat(rows.first?.count ?? 0) * pixel
        Canvas { ctx, _ in
            var path = Path()
            for (y, row) in rows.enumerated() {
                for (x, on) in row.enumerated() where on {
                    path.addRect(CGRect(x: CGFloat(x) * pixel, y: CGFloat(y) * pixel, width: pixel, height: pixel))
                }
            }
            ctx.fill(path, with: .color(color))
        }
        .frame(width: width, height: CGFloat(rows.count) * pixel)
        .accessibilityLabel(text)
    }
}

/**
 * The coin: an original sound made for go-link (scripts/coin-sound.mjs).
 * The ambient session lets the silent switch mute it and never stops
 * other apps' audio; a room sets its own session when it starts.
 */
@MainActor
final class CoinSound {
    private var player: AVAudioPlayer?

    func prepare() {
        guard player == nil, let url = Bundle.main.url(forResource: "coin", withExtension: "wav") else { return }
        player = try? AVAudioPlayer(contentsOf: url)
        player?.prepareToPlay()
    }

    func play() {
        prepare()
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.ambient, mode: .default, options: [])
        try? session.setActive(true)
        player?.play()
    }
}
