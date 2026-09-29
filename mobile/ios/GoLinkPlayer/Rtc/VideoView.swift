// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import SwiftUI
@preconcurrency import WebRTC

/**
 * The game's picture: a Metal view that draws the received VP8 frames,
 * stretched to the box it is given (the box already has the display
 * aspect from stream_stats, since arcade pixels are not square).
 */
struct VideoView: UIViewRepresentable {
    let track: RTCVideoTrack?

    final class Coordinator {
        var track: RTCVideoTrack?
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> RTCMTLVideoView {
        let v = RTCMTLVideoView(frame: .zero)
        v.videoContentMode = .scaleToFill
        v.backgroundColor = .black
        v.isUserInteractionEnabled = false
        v.accessibilityIdentifier = "video"
        return v
    }

    func updateUIView(_ view: RTCMTLVideoView, context: Context) {
        let c = context.coordinator
        if c.track !== track {
            c.track?.remove(view)
            c.track = track
            track?.add(view)
        }
    }

    static func dismantleUIView(_ view: RTCMTLVideoView, coordinator: Coordinator) {
        coordinator.track?.remove(view)
        coordinator.track = nil
    }
}
