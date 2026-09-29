// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import Foundation
@preconcurrency import WebRTC

/**
 * The process-wide libwebrtc objects: one factory, the app's own audio
 * device (see GoLinkAudioDevice), and the microphone track, created only
 * after the person allows the microphone.
 */
@MainActor
final class WebRtcEngine {
    static let shared = WebRtcEngine()

    let audioDevice = GoLinkAudioDevice()
    let factory: RTCPeerConnectionFactory
    private var micTrack: RTCAudioTrack?

    private init() {
        RTCInitializeSSL()
        factory = RTCPeerConnectionFactory(
            encoderFactory: RTCDefaultVideoEncoderFactory(),
            decoderFactory: RTCDefaultVideoDecoderFactory(),
            audioDevice: audioDevice
        )
    }

    /** The microphone track; call only with the microphone allowed. */
    func microphone() -> RTCAudioTrack {
        if let t = micTrack { return t }
        // Echo cancellation, noise suppression and gain control for voice
        // chat, like the web's getUserMedia constraints.
        let constraints = RTCMediaConstraints(
            mandatoryConstraints: [
                "googEchoCancellation": "true",
                "googNoiseSuppression": "true",
                "googAutoGainControl": "true",
                "googHighpassFilter": "true",
            ],
            optionalConstraints: nil
        )
        let source = factory.audioSource(with: constraints)
        let t = factory.audioTrack(with: source, trackId: "mic")
        micTrack = t
        return t
    }
}
