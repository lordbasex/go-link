// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

#if DEBUG
import CoreVideo
import GoLinkCore
import QuartzCore
import SwiftUI
@preconcurrency import WebRTC

/**
 * Debug builds only (launch argument -pictureLab): the room's console
 * layout with the website's synthetic test card (PictureTestCard, 384 x 224
 * shown at 4:3) streamed at 60 fps into the real picture renderer, the
 * dock's gear and the real Game settings panel, so every style, the sides
 * and Compare can be tried and captured without a room. Optional
 * arguments: -labStyle <smooth|sharp|crt|edges>, -labBands
 * <black|ambient|frame>, -labCompare, -labSettings (opens the panel),
 * -labRoom <style>,<bands> (a room default from the host), -labUp2 (the
 * card enlarged 2x with nearest neighbour and drawn as a 2x stream, like
 * the High and Normal video qualities; add -labRaw to draw it raw).
 * "picture-lab-fps" shows the new frames drawn per second and the screen's
 * measured rate.
 */
struct PictureLabView: View {
    @StateObject private var feed = TestCardFeed()
    @StateObject private var picture: PictureModel
    @StateObject private var pad = TouchPadState { _ in }
    @StateObject private var screenRate = ScreenRateMonitor()
    @State private var settingsOpen: Bool
    @State private var statsOn = false
    @State private var game = 1.0
    @State private var voices = 1.0
    private let up2 = ProcessInfo.processInfo.arguments.contains("-labUp2")
    private let raw = ProcessInfo.processInfo.arguments.contains("-labRaw")

    init() {
        let args = ProcessInfo.processInfo.arguments
        func value(_ flag: String) -> String? {
            args.firstIndex(of: flag).flatMap { $0 + 1 < args.count ? args[$0 + 1] : nil }
        }
        let store = MemoryStore()
        if value("-labStyle") != nil || value("-labBands") != nil {
            PictureSettings.parse(style: value("-labStyle"), bands: value("-labBands")).write(store)
        }
        let model = PictureModel(store: store)
        // -labRoom crt,frame: a room default from its host (room_state.picture).
        if let r = value("-labRoom")?.split(separator: ","), r.count == 2 {
            if let st = PictureStyle(rawValue: String(r[0])), let b = PictureBands(rawValue: String(r[1])) {
                model.setRoomDefault(PictureSettings(style: st, bands: b))
            }
        }
        model.compare = args.contains("-labCompare")
        _picture = StateObject(wrappedValue: model)
        _settingsOpen = State(initialValue: args.contains("-labSettings"))
    }

    var body: some View {
        GeometryReader { g in
            let landscape = g.size.width > g.size.height
            ZStack {
                Tokens.bg.ignoresSafeArea()
                ConsoleLayout(
                    landscape: landscape,
                    size: g.size,
                    pad: pad,
                    controls: GameControls(players: 2, buttons: 6, control: "joy8way"),
                    starts: 2,
                    myPorts: [1],
                    showPad: true,
                    aspect: CGFloat(PictureTestCard.aspect),
                    header: { _ in AnyView(Text("lab").foregroundStyle(Tokens.muted).frame(height: Tokens.control)) },
                    screen: AnyView(screen),
                    dock: { AnyView(dock(vertical: $0)) },
                    noPad: AnyView(EmptyView())
                )
                if settingsOpen {
                    GameSettingsPanel(
                        landscape: landscape,
                        picture: picture,
                        sound: GameSound(game: $game, voices: $voices),
                        initialName: "Lab",
                        onSaveName: { _ in },
                        statsOn: $statsOn,
                        onClose: { settingsOpen = false }
                    )
                    .transition(.move(edge: landscape ? .trailing : .bottom))
                }
            }
            .animation(.easeOut(duration: 0.2), value: settingsOpen)
        }
        .onAppear {
            screenRate.start()
            feed.start(scale: up2 ? 2 : 1)
        }
        .onDisappear {
            feed.stop()
            screenRate.stop()
        }
    }

    private var screen: some View {
        ZStack {
            Tokens.video
            PictureView(
                feed: feed, aspect: PictureTestCard.aspect,
                native: up2 && !raw ? PictureLayout.Size(w: PictureTestCard.width, h: PictureTestCard.height) : nil,
                picture: picture, onFrameDrawn: feed.countDrawn
            )
            if picture.compare && picture.available {
                CompareDivider(split: $picture.split, after: picture.settings.style.title)
            }
            Text("\(feed.drawnFps) fps · \(ScreenRate.label(screenRate.hz))" + (up2 ? (raw ? " · 2× raw" : " · 2×") : ""))
                .font(.system(size: 11, weight: .medium, design: .monospaced)).foregroundStyle(Tokens.voice)
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(Capsule().fill(Tokens.video.opacity(0.6)))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                .padding(6)
                .accessibilityIdentifier("picture-lab-fps")
        }
        .clipped()
    }

    private func dock(vertical: Bool) -> some View {
        let items = Group {
            DockButton(icon: "gamecontroller", label: L("room_touchpad"), on: true, tag: "dock-pad") {}
            DockButton(icon: "gearshape", label: L("room_settings"), on: settingsOpen, tag: "dock-settings") { settingsOpen.toggle() }
        }
        return Group {
            if vertical {
                VStack(spacing: 6) { items }.frame(maxHeight: .infinity)
            } else {
                HStack(spacing: 6) { items }.frame(maxWidth: .infinity).padding(.vertical, 6)
            }
        }
    }
}

/**
 * The test card as a video feed: 60 frames a second drawn with Core
 * Graphics into a BGRA pixel buffer and handed to the renderers like
 * WebRTC's decoded frames (the renderer converts them to I420 with
 * WebRTC's own converter).
 */
@MainActor
final class TestCardFeed: ObservableObject, VideoFeed {
    @Published private(set) var drawnFps = 0
    private var renderers: [RTCVideoRenderer] = []
    private var link: CADisplayLink?
    private var start0 = CACurrentMediaTime()
    private var drawn = 0
    private var countStart = CACurrentMediaTime()
    private var pool: CVPixelBufferPool?
    /** 2: every card pixel as a 2 x 2 block (a 2x stream). */
    private var scale = 1

    nonisolated func add(_ renderer: RTCVideoRenderer) {
        MainActor.assumeIsolated { renderers.append(renderer) }
    }

    nonisolated func remove(_ renderer: RTCVideoRenderer) {
        MainActor.assumeIsolated { renderers.removeAll { $0 === renderer } }
    }

    func start(scale: Int = 1) {
        guard link == nil else { return }
        self.scale = scale
        let attrs: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: PictureTestCard.width * scale,
            kCVPixelBufferHeightKey as String: PictureTestCard.height * scale,
            kCVPixelBufferIOSurfacePropertiesKey as String: [:] as [String: Any],
        ]
        CVPixelBufferPoolCreate(nil, nil, attrs as CFDictionary, &pool)
        let l = CADisplayLink(target: Tick(self), selector: #selector(Tick.tick))
        // A game's rate: 60 frames a second, whatever the screen does.
        l.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 60, preferred: 60)
        l.add(to: .main, forMode: .common)
        link = l
    }

    func stop() {
        link?.invalidate()
        link = nil
    }

    /** PictureView's callback: one new frame reached the screen. */
    nonisolated func countDrawn() {
        MainActor.assumeIsolated {
            drawn += 1
            let now = CACurrentMediaTime()
            if now - countStart >= 1 {
                drawnFps = Int((Double(drawn) / (now - countStart)).rounded())
                drawn = 0
                countStart = now
            }
        }
    }

    fileprivate func frame() {
        guard let pool else { return }
        var out: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, pool, &out)
        guard let pb = out else { return }
        CVPixelBufferLockBaseAddress(pb, [])
        if let base = CVPixelBufferGetBaseAddress(pb),
           let ctx = CGContext(data: base, width: PictureTestCard.width * scale, height: PictureTestCard.height * scale, bitsPerComponent: 8,
                               bytesPerRow: CVPixelBufferGetBytesPerRow(pb), space: CGColorSpaceCreateDeviceRGB(),
                               bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue) {
            // Integer rectangles without antialiasing: at scale 2 each card pixel is an exact 2 x 2 block.
            ctx.translateBy(x: 0, y: CGFloat(PictureTestCard.height * scale))
            ctx.scaleBy(x: CGFloat(scale), y: -CGFloat(scale))
            PictureTestCard.draw(ctx, t: CACurrentMediaTime() - start0)
        }
        CVPixelBufferUnlockBaseAddress(pb, [])
        let frame = RTCVideoFrame(buffer: RTCCVPixelBuffer(pixelBuffer: pb), rotation: ._0, timeStampNs: Int64(CACurrentMediaTime() * 1e9))
        for r in renderers { r.renderFrame(frame) }
    }

    private final class Tick: NSObject {
        weak var feed: TestCardFeed?

        init(_ feed: TestCardFeed) { self.feed = feed }

        @objc func tick() { MainActor.assumeIsolated { feed?.frame() } }
    }
}
#endif
