// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import GoLinkCore
import MetalKit
import SwiftUI
@preconcurrency import WebRTC

/** Something that hands decoded frames to renderers: the room's video track, or the debug lab's test card. */
protocol VideoFeed: AnyObject {
    func add(_ renderer: RTCVideoRenderer)
    func remove(_ renderer: RTCVideoRenderer)
}

extension RTCVideoTrack: VideoFeed {}

/**
 * How this phone draws the game (style, sides) and the comparison, shared
 * by the room's picture and the Game settings panel. The viewer's own
 * choice is kept in UserDefaults (go-link.picture-style,
 * go-link.picture-bands, the website's keys and values) and wins; a
 * viewer who never chose sees the room's default (room_state.picture),
 * else the app's. Changes apply at once, without reconnecting.
 */
@MainActor
final class PictureModel: ObservableObject {
    /** What is drawn now. */
    @Published private(set) var settings: PictureSettings
    /** The viewer's own choice (empty: none). */
    @Published private(set) var saved: PictureSettings.Saved
    /** The host's default for this room, if any. */
    @Published private(set) var room: PictureSettings?
    /** Compare: the left of the line is the plain picture, the right the chosen style. */
    @Published var compare = false
    /** Where the line is, 0-1 of the picture area's width. */
    @Published var split = 0.5
    /** False when this device cannot draw the styles (the plain picture is shown). */
    @Published var available = true
    private let store: KeyValueStore

    init(store: KeyValueStore = Prefs()) {
        self.store = store
        let saved = PictureSettings.readSaved(store)
        self.saved = saved
        settings = PictureSettings.resolve(saved, room: nil)
    }

    var style: PictureStyle {
        get { settings.style }
        set { choose(PictureSettings(style: newValue, bands: settings.bands)) }
    }

    var bands: PictureBands {
        get { settings.bands }
        set { choose(PictureSettings(style: settings.style, bands: newValue)) }
    }

    /** The viewer picks a picture: kept, and it wins over the room's default. */
    func choose(_ next: PictureSettings) {
        next.write(store)
        saved = PictureSettings.readSaved(store)
        settings = next
    }

    func setRoomDefault(_ picture: PictureSettings?) {
        guard picture != room else { return }
        room = picture
        settings = PictureSettings.resolve(saved, room: room)
    }

    /** "Use the room's default": forgets the viewer's choice. */
    func useRoomDefault() {
        PictureSettings.clear(store)
        saved = PictureSettings.Saved()
        settings = PictureSettings.resolve(saved, room: room)
    }

    var offersRoomDefault: Bool { PictureSettings.offersRoomDefault(saved, room: room) }
}

/**
 * The game's picture: our Metal renderer (PictureMTKView) filling the whole
 * area it is given, so the Ambient and Frame sides show around the picture,
 * which keeps its display aspect (never cropped). Without Metal or with a
 * shader error it falls back to WebRTC's own view, fitted to the aspect.
 */
struct PictureView: UIViewRepresentable {
    let feed: VideoFeed?
    /** Width / height as the game is meant to be seen (stream_stats; 4:3 for arcades). */
    let aspect: Double
    /** The game's own size when the device sends it 2x (stream_stats video): averaged back before any style. */
    var native: PictureLayout.Size? = nil
    @ObservedObject var picture: PictureModel
    /** Debug lab: called after each new frame is drawn. */
    var onFrameDrawn: (() -> Void)?

    final class Coordinator {
        var feed: VideoFeed?
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    private var options: PictureRenderer.Options {
        PictureRenderer.Options(settings: picture.settings, split: picture.compare ? picture.split : nil, aspect: aspect, scale: 1, native: native)
    }

    func makeUIView(context: Context) -> PictureContainer {
        let v = PictureContainer(options: options)
        if v.gpu == nil {
            let model = picture
            DispatchQueue.main.async { model.available = false }
        }
        return v
    }

    func updateUIView(_ view: PictureContainer, context: Context) {
        view.aspect = aspect
        view.gpu?.options = options
        view.gpu?.onFrameDrawn = onFrameDrawn
        let c = context.coordinator
        if c.feed !== feed {
            c.feed?.remove(view.sink)
            c.feed = feed
            feed?.add(view.sink)
        }
    }

    static func dismantleUIView(_ view: PictureContainer, coordinator: Coordinator) {
        coordinator.feed?.remove(view.sink)
        coordinator.feed = nil
    }
}

/** Holds the GPU view, or the plain WebRTC view when the GPU path is not available. */
final class PictureContainer: UIView {
    let gpu: PictureMTKView?
    private let plain: RTCMTLVideoView?
    var aspect: Double = 4.0 / 3.0 {
        didSet { if aspect != oldValue { setNeedsLayout() } }
    }

    /** The view that receives the frames. */
    var sink: RTCVideoRenderer { gpu ?? plain! }

    init(options: PictureRenderer.Options) {
        #if DEBUG
        // -plainPicture: try the fallback on purpose.
        let allowGpu = !ProcessInfo.processInfo.arguments.contains("-plainPicture")
        #else
        let allowGpu = true
        #endif
        let gpu = allowGpu ? PictureMTKView(options: options) : nil
        self.gpu = gpu
        if gpu == nil {
            let v = RTCMTLVideoView(frame: .zero)
            v.videoContentMode = .scaleToFill
            v.isUserInteractionEnabled = false
            v.accessibilityIdentifier = "video"
            plain = v
        } else {
            plain = nil
        }
        super.init(frame: .zero)
        backgroundColor = UIColor(Tokens.video)
        isUserInteractionEnabled = false
        if let gpu { addSubview(gpu) }
        if let plain { addSubview(plain) }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func layoutSubviews() {
        super.layoutSubviews()
        gpu?.frame = bounds
        if let plain {
            let r = PictureLayout.fitRect(Double(bounds.width), Double(bounds.height), aspect: aspect)
            plain.frame = CGRect(x: r.x, y: r.y, width: r.w, height: r.h)
            Self.presentFast(plain)
        }
    }

    /** Lets the Metal view inside WebRTC's view draw at the screen's highest rate. */
    static func presentFast(_ view: UIView) {
        for sub in view.subviews {
            if let mtk = sub as? MTKView {
                if mtk.preferredFramesPerSecond != ScreenRateMonitor.maxFps { mtk.preferredFramesPerSecond = ScreenRateMonitor.maxFps }
            } else {
                presentFast(sub)
            }
        }
    }
}

/**
 * Compare's vertical line over the picture: drag it to move the border
 * between the plain picture (left, "Original") and the chosen style
 * (right). VoiceOver adjusts it like a slider.
 */
struct CompareDivider: View {
    @Binding var split: Double
    let after: String

    var body: some View {
        GeometryReader { g in
            let x = CGFloat(split) * g.size.width
            ZStack(alignment: .topLeading) {
                Rectangle().fill(Color.white.opacity(0.9))
                    .frame(width: 2, height: g.size.height)
                    .shadow(color: .black.opacity(0.6), radius: 2)
                    .position(x: x, y: g.size.height / 2)
                label(L("picture_before"))
                    .position(x: max(44, x - 52), y: 22)
                label(after)
                    .position(x: min(g.size.width - 44, x + 52), y: 22)
                Image(systemName: "chevron.left.chevron.right")
                    .font(.system(size: 15, weight: .bold)).foregroundStyle(Tokens.text)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Tokens.video.opacity(0.75)))
                    .overlay(Circle().stroke(Color.white.opacity(0.9), lineWidth: 2))
                    .position(x: x, y: g.size.height / 2)
                // The line's grip: 44 points wide, the whole height.
                Color.clear
                    .frame(width: 44, height: g.size.height)
                    .contentShape(Rectangle())
                    .position(x: x, y: g.size.height / 2)
                    .gesture(DragGesture(minimumDistance: 0, coordinateSpace: .named("compare")).onChanged { v in
                        split = PictureLayout.clampSplit(Double(v.location.x / max(1, g.size.width)))
                    })
                    .accessibilityElement()
                    .accessibilityLabel(L("picture_divider"))
                    .accessibilityValue("\(Int((split * 100).rounded())) %")
                    .accessibilityAdjustableAction { dir in
                        switch dir {
                        case .increment: split = PictureLayout.clampSplit(split + 0.05)
                        case .decrement: split = PictureLayout.clampSplit(split - 0.05)
                        @unknown default: break
                        }
                    }
                    .accessibilityIdentifier("picture-divider")
            }
            .coordinateSpace(name: "compare")
        }
    }

    private func label(_ text: String) -> some View {
        Text(text).font(.system(size: 12, weight: .semibold)).foregroundStyle(Tokens.text).lineLimit(1)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(Tokens.video.opacity(0.7)))
            .fixedSize()
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

extension PictureStyle {
    var title: String { L("picture_style_\(rawValue)") }
    var detail: String { L("picture_style_\(rawValue)_detail") }
}

extension PictureBands {
    var title: String { L("picture_bands_\(rawValue)") }
    var detail: String { L("picture_bands_\(rawValue)_detail") }
}
