// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import Combine
import Foundation
import GoLinkCore
import UIKit
@preconcurrency import WebRTC

/** What the room screen shows about sound and voice. */
struct SoundState: Equatable {
    var micOn = false
    /** Ports whose voice this player silenced. */
    var silenced = Set<Int>()
    /** Ports whose voice track arrived. */
    var voices = Set<Int>()
    /** 0 to 3 (1 = as sent). */
    var gameVolume = 1.0
    var voiceVolume = 1.0
}

/**
 * One visit to a room: the signaling connection, the room logic from
 * GoLinkCore, the WebRTC peer, the audio route and the controllers. The
 * iOS counterpart of the Android app's RoomSession.
 */
@MainActor
final class RoomSession: ObservableObject {
    let target: InviteTarget
    let client: RoomClient
    let router: AudioRouter
    let gamepads: GamepadInput

    @Published private(set) var ui = RoomUi()
    @Published private(set) var video: RTCVideoTrack?
    @Published private(set) var sound = SoundState()
    @Published private(set) var controllers: [GamepadInput.Controller] = []
    /** Every connected controller (used or not): with one, the on-screen pad only shows it. */
    @Published private(set) var connectedControllers: [GamepadInput.Connected] = []
    /** The buttons held on the real controllers, to light the see-through pad. */
    @Published private(set) var controllerBits = 0
    /**
     * The name step: shown once per visit, when the PIN has been accepted
     * and before the room (never again after a reconnect in this visit).
     */
    @Published private(set) var askName = true
    /** The stats overlay's numbers, while it is on (nil until the first reading). */
    @Published private(set) var liveStats: LiveStatsView?

    private let prefs: Prefs
    private let engine = WebRtcEngine.shared
    private let signal: SignalClient
    private(set) var peer: IOSRtcPeer?
    private var gameAudio: RTCAudioTrack?
    private var voiceTracks: [Int: RTCAudioTrack] = [:]
    private var touchButtons = 0
    private var lastPads = [Pad](repeating: .empty, count: maxLocalPlayers)
    private var uiToken: CancelHandle?
    private var bag = Set<AnyCancellable>()
    private var stopProbe: () -> Void = {}
    private let statsMeter = LiveStatsMeter()
    private var statsTimer: Timer?

    init(prefs: Prefs, target: InviteTarget, pin: String) {
        self.prefs = prefs
        self.target = target
        signal = SignalClient(url: prefs.signal.url, factory: URLSessionSockets(), scheduler: MainScheduler.shared)
        router = AudioRouter(prefs: prefs, device: WebRtcEngine.shared.audioDevice)
        let peers = PeerFactory()
        client = RoomClient(signal: signal, target: target, typedPin: pin, passes: RoomPasses(prefs), peers: peers, scheduler: MainScheduler.shared)
        var pushPads: () -> Void = {}
        gamepads = GamepadInput { pushPads() }
        pushPads = { [weak self] in self?.pushPads() }
        peers.session = self
        sound.gameVolume = prefs.gameVolume
        sound.voiceVolume = prefs.voiceVolume
    }

    /** Creates the WebRTC peer when the device offers (RoomClient asks for it). */
    private final class PeerFactory: RtcPeerFactory {
        weak var session: RoomSession?

        func create(iceServers: [IceServer], events: RtcPeerEvents) -> RtcPeer {
            let s = session!
            let p = IOSRtcPeer(engine: s.engine, iceServers: iceServers, events: events, media: s)
            s.peer = p
            s.applyMic()
            return p
        }
    }

    func start() {
        uiToken = client.onUi { [weak self] in self?.ui = $0 }
        gamepads.$controllers.sink { [weak self] list in
            guard let self else { return }
            self.controllers = list
            self.client.setIdentity(name: self.prefs.playerName, localPlayers: self.localPlayers(list))
        }.store(in: &bag)
        gamepads.$connected.sink { [weak self] list in self?.connectedControllers = list }.store(in: &bag)
        router.start()
        gamepads.start()
        client.setIdentity(name: prefs.playerName, localPlayers: [0])
        client.start()
        UIApplication.shared.isIdleTimerDisabled = true
        stopProbe = E2eProbe.attach(self)
    }

    func close() {
        setStatsOn(false)
        stopProbe()
        uiToken?.cancel()
        bag = []
        client.close()
        peer = nil
        engine.audioDevice.micEnabled = false
        router.stop()
        gamepads.stop()
        UIApplication.shared.isIdleTimerDisabled = false
    }

    func leave() { close() }

    func setName(_ name: String) {
        prefs.playerName = name
        client.setIdentity(name: prefs.playerName, localPlayers: localPlayers(gamepads.controllers))
    }

    /** The name step's "Enter the room": saves the name and tells the device. */
    func confirmName(_ name: String) {
        setName(name)
        askName = false
    }

    // MARK: Stats

    /** Reads libwebrtc's statistics once a second while the overlay is on. */
    func setStatsOn(_ on: Bool) {
        statsTimer?.invalidate()
        statsTimer = nil
        statsMeter.reset()
        liveStats = nil
        guard on else { return }
        let t = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.readStats() }
        }
        RunLoop.main.add(t, forMode: .common)
        statsTimer = t
        readStats()
    }

    private func readStats() {
        guard let peer else { return }
        peer.stats { [weak self] report in
            guard let self, self.statsTimer != nil else { return }
            self.liveStats = self.statsMeter.update(LiveStatsReader.sample(report, labels: peer.trackLabels))
        }
    }

    /** Buttons held on the on-screen gamepad: they belong to local player 0. */
    func setTouchButtons(_ buttons: Int) {
        guard buttons != touchButtons else { return }
        touchButtons = buttons
        pushPads()
    }

    private func localPlayers(_ list: [GamepadInput.Controller]) -> [Int] {
        Array(Set([0] + list.map(\.player))).sorted()
    }

    private func pushPads() {
        var pads = gamepads.pads()
        let fromControllers = pads.reduce(0) { $0 | $1.buttons }
        if fromControllers != controllerBits { controllerBits = fromControllers }
        pads[0].buttons |= touchButtons
        for (player, pad) in pads.enumerated() where pad != lastPads[player] {
            lastPads[player] = pad
            client.setPad(player: player, pad: pad)
        }
    }

    // MARK: Sound

    func setGameVolume(_ v: Double) {
        sound.gameVolume = v.clamped(0, 3)
        prefs.gameVolume = sound.gameVolume
        applyVolumes()
    }

    func setVoiceVolume(_ v: Double) {
        sound.voiceVolume = v.clamped(0, 3)
        prefs.voiceVolume = sound.voiceVolume
        applyVolumes()
    }

    /** The dock's switch: game sound off and back to the chosen volume. */
    @Published private(set) var gameMuted = false

    func setGameMuted(_ muted: Bool) {
        gameMuted = muted
        applyVolumes()
    }

    /** Silences (or not) one player's voice, only for this device. */
    func toggleSilence(_ port: Int) {
        if sound.silenced.contains(port) { sound.silenced.remove(port) } else { sound.silenced.insert(port) }
        applyVolumes()
    }

    /** Turns the microphone on or off. Call on() only with the microphone allowed. */
    func setMic(_ on: Bool) {
        sound.micOn = on
        applyMic()
    }

    func testSound() { engine.audioDevice.chime() }

    fileprivate func applyMic() {
        engine.audioDevice.micEnabled = sound.micOn
        peer?.setMicTrack(sound.micOn ? engine.microphone() : nil)
    }

    private func applyVolumes() {
        // libwebrtc's remote volume goes from 0 to 10 (1 = as received).
        gameAudio?.source.volume = gameMuted ? 0 : sound.gameVolume
        for (port, track) in voiceTracks {
            track.source.volume = sound.silenced.contains(port) ? 0 : sound.voiceVolume
        }
    }
}

extension RoomSession: MediaListener {
    func onVideo(_ track: RTCVideoTrack) { video = track }

    func onGameAudio(_ track: RTCAudioTrack) {
        gameAudio = track
        applyVolumes()
    }

    func onVoice(port: Int, track: RTCAudioTrack) {
        voiceTracks[port] = track
        sound.voices.insert(port)
        applyVolumes()
    }

    func onMediaClosed() {
        video = nil
        gameAudio = nil
        voiceTracks = [:]
        sound.voices = []
    }
}
