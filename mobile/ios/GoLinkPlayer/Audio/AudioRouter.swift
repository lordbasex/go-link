// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import AVFoundation
import Combine
import GoLinkCore

/**
 * The room's sound route. The output is the system's (the Sound sheet
 * shows the system route picker, and the session never uses the
 * earpiece); the microphone is the person's choice among the session's
 * inputs, through GoLinkCore's AudioSelection, which also notices when a
 * chosen headset disconnects.
 */
@MainActor
final class AudioRouter: ObservableObject {
    enum Output { case speaker, headphones, bluetooth, other }

    @Published private(set) var output: Output = .speaker
    @Published private(set) var outputName = ""
    @Published private(set) var inputOptions: [AudioOption] = []
    @Published private(set) var shownInput: AudioChoice = .automatic
    /** A chosen microphone that disconnected (the choice went back to Automatic). */
    @Published var lost: LostAudioDevice?

    private let prefs: Prefs
    private let selection: AudioSelection
    private var recording = false
    private var observers: [NSObjectProtocol] = []

    init(prefs: Prefs, device: GoLinkAudioDevice) {
        self.prefs = prefs
        selection = AudioSelection(input: AudioChoice.decode(prefs.audioInput))
        device.onSessionChange = { [weak self] voice in
            self?.recording = voice
            self?.refresh()
        }
    }

    func start() {
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.refresh() }
        })
        refresh()
    }

    func stop() {
        observers.forEach(NotificationCenter.default.removeObserver)
        observers = []
    }

    func chooseInput(_ choice: AudioChoice) {
        selection.chooseInput(choice)
        prefs.audioInput = AudioChoice.encode(choice)
        refresh()
    }

    /** Reads the route and the inputs again, and applies the microphone choice. */
    func refresh() {
        let session = AVAudioSession.sharedInstance()
        let outs = session.currentRoute.outputs
        if let first = outs.first {
            outputName = first.portName
            switch first.portType {
            case .builtInSpeaker, .builtInReceiver: output = .speaker
            case .headphones, .usbAudio, .lineOut: output = .headphones
            case .bluetoothA2DP, .bluetoothHFP, .bluetoothLE: output = .bluetooth
            default: output = .other
            }
        }
        let inputs = (session.availableInputs ?? []).enumerated().compactMap { i, p in Self.device(p, id: i) }
        let gone = selection.update(outputs: [], inputs: inputs)
        if gone.contains(where: { $0.input }) {
            prefs.audioInput = nil
            lost = gone.first { $0.input }
        }
        inputOptions = selection.inputOptions()
        shownInput = selection.shownInput()
        applyInput()
    }

    /** The preferred microphone, only while the play-and-record session is on. */
    private func applyInput() {
        guard recording else { return }
        let session = AVAudioSession.sharedInstance()
        let wanted = selection.plan().input
        let port = wanted.flatMap { w in session.availableInputs?.first { $0.uid == w.address || ($0.portType == .builtInMic && w.kind == .builtinMic) } }
        if session.preferredInput?.uid != port?.uid {
            try? session.setPreferredInput(port)
        }
    }

    /** An input port as GoLinkCore sees it; nil for kinds the sheet does not offer. */
    static func device(_ p: AVAudioSessionPortDescription, id: Int) -> AudioDevice? {
        let kind: AudioKind
        switch p.portType {
        case .builtInMic: kind = .builtinMic
        case .headsetMic, .lineIn: kind = .wired
        case .bluetoothHFP, .bluetoothLE: kind = .bluetooth
        case .usbAudio: kind = .usb
        case .carAudio: kind = .bluetooth
        default: return nil
        }
        return AudioDevice(id: id, kind: kind, name: String(p.portName.prefix(60)), address: p.uid)
    }

    // MARK: Microphone permission

    enum MicPermission { case undetermined, granted, denied }

    static var micPermission: MicPermission {
        switch AVAudioApplication.shared.recordPermission {
        case .granted: return .granted
        case .denied: return .denied
        default: return .undetermined
        }
    }

    static func requestMic(_ done: @escaping (Bool) -> Void) {
        AVAudioApplication.requestRecordPermission { ok in DispatchQueue.main.async { done(ok) } }
    }
}
