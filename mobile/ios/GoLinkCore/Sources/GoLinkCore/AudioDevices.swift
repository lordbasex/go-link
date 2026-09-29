// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import Foundation

// The room's Sound sheet: which microphone and which output the voice chat
// and the game sound use. A port of the Android app's AudioDevices.kt. The
// platform lists its live devices (on iOS, AVAudioSession's inputs, mapped
// to AudioDevice); this file builds the options, maps a saved choice back
// to a live device, plans the route and decides when a chosen device is
// gone (then the choice goes back to Automatic). On iOS the output itself
// is picked with the system's route picker; the microphone uses this.

/** The kinds of audio device the Sound sheet offers. The earpiece is never one of them. */
public enum AudioKind: String, CaseIterable, Sendable {
    case speaker = "SPEAKER"
    case builtinMic = "BUILTIN_MIC"
    case wired = "WIRED"
    case bluetooth = "BLUETOOTH"
    case usb = "USB"
    case hearingAid = "HEARING_AID"

    /** Part of the phone itself: there is only one of each, so the kind alone identifies it. */
    public var builtIn: Bool { self == .speaker || self == .builtinMic }
}

private func keyOf(_ kind: AudioKind, _ name: String, _ address: String) -> String {
    kind.builtIn ? kind.rawValue : "\(kind.rawValue)|\(address)|\(name)"
}

/**
 * A connected device. id is the platform's id, which can change when the
 * device reconnects; address (a port's uid) and name (the product name)
 * identify it again after that.
 */
public struct AudioDevice: Equatable, Hashable, Sendable {
    public let id: Int
    public let kind: AudioKind
    public let name: String
    public let address: String

    public init(id: Int, kind: AudioKind, name: String = "", address: String = "") {
        self.id = id
        self.kind = kind
        self.name = name
        self.address = address
    }

    public var key: String { keyOf(kind, name, address) }

    public func with(id: Int) -> AudioDevice { AudioDevice(id: id, kind: kind, name: name, address: address) }
}

/** What the person picked: Automatic, or one device. */
public enum AudioChoice: Equatable, Hashable, Sendable {
    case automatic
    case device(kind: AudioKind, name: String, address: String)

    public var key: String? {
        if case let .device(kind, name, address) = self { return keyOf(kind, name, address) }
        return nil
    }

    public static func of(_ d: AudioDevice) -> AudioChoice {
        .device(kind: d.kind, name: d.kind.builtIn ? "" : d.name, address: d.kind.builtIn ? "" : d.address)
    }

    /** The saved form (nil for Automatic, which needs nothing saved). */
    public static func encode(_ c: AudioChoice) -> String? {
        guard case let .device(kind, name, address) = c else { return nil }
        return JSON.obj(("kind", .string(kind.rawValue)), ("name", .string(name)), ("address", .string(address))).text
    }

    /** Reads a saved choice; anything unreadable is Automatic. */
    public static func decode(_ text: String?) -> AudioChoice {
        guard let text, !text.trimmingCharacters(in: .whitespaces).isEmpty,
              let o = JSONText.parseObject(text),
              let kind = AudioKind(rawValue: o["kind"].str(40))
        else { return .automatic }
        return .device(kind: kind, name: o["name"].str(200), address: o["address"].str(200))
    }
}

/** One row of the sheet: Automatic (device nil) or a live device. */
public struct AudioOption: Equatable, Sendable {
    public let choice: AudioChoice
    public let device: AudioDevice?
}

/** Where to send the sound and which microphone to prefer; nil means the automatic route. */
public struct AudioPlan: Equatable, Sendable {
    public let communication: AudioDevice?
    public let input: AudioDevice?

    public init(communication: AudioDevice?, input: AudioDevice?) {
        self.communication = communication
        self.input = input
    }
}

/** A chosen device that disconnected: its choice went back to Automatic. */
public struct LostAudioDevice: Equatable, Sendable {
    public let input: Bool
    public let kind: AudioKind
    public let name: String
}

public enum AudioChoices {
    /** Automatic, the loudspeaker, then each headset (never the earpiece, never a microphone). */
    public static func outputs(_ devices: [AudioDevice]) -> [AudioOption] {
        options(devices.filter { $0.kind != .builtinMic }, builtIn: .speaker)
    }

    /** Automatic, the phone's microphone, then each headset's microphone. */
    public static func inputs(_ devices: [AudioDevice]) -> [AudioOption] {
        options(devices.filter { $0.kind != .speaker && $0.kind != .hearingAid }, builtIn: .builtinMic)
    }

    private static func options(_ devices: [AudioDevice], builtIn: AudioKind) -> [AudioOption] {
        var seen = Set<String>()
        let unique = devices.filter { seen.insert($0.key).inserted }
        let first = unique.filter { $0.kind == builtIn }
        let rest = unique.filter { $0.kind != builtIn }
        return [AudioOption(choice: .automatic, device: nil)] + (first + rest).map { AudioOption(choice: .of($0), device: $0) }
    }

    /** The live device a choice means, or nil (Automatic, or not connected). */
    public static func resolve(_ choice: AudioChoice, _ devices: [AudioDevice]) -> AudioDevice? {
        guard let key = choice.key else { return nil }
        return devices.first { $0.key == key }
    }

    /**
     * The route for both choices. A chosen output is the communication
     * device. A chosen headset microphone with an automatic output also
     * makes that headset the communication device, since a Bluetooth
     * headset's microphone opens only together with its sound.
     */
    public static func plan(output: AudioChoice, input: AudioChoice, outputs: [AudioDevice], inputs: [AudioDevice]) -> AudioPlan {
        let out = resolve(output, outputs)
        let mic = resolve(input, inputs)
        var communication = out
        if communication == nil, let mic, !mic.kind.builtIn { communication = counterpart(mic, outputs) }
        return AudioPlan(communication: communication, input: mic)
    }

    /** The output side of a headset's microphone: the same kind, and the same address when both have one. */
    public static func counterpart(_ mic: AudioDevice, _ outputs: [AudioDevice]) -> AudioDevice? {
        let same = outputs.filter { $0.kind == mic.kind }
        return same.first { !mic.address.isEmpty && $0.address == mic.address }
            ?? same.first { mic.address.isEmpty || $0.address.isEmpty }
    }
}

/**
 * The two choices during one room visit. A saved device that is not
 * connected when the room opens waits (the route stays automatic) and is
 * used as soon as it connects; a chosen device that was connected and then
 * disappears goes back to Automatic, and update reports it.
 */
public final class AudioSelection {
    public private(set) var output: AudioChoice
    public private(set) var input: AudioChoice

    private var outputSeen = false
    private var inputSeen = false
    private var outputs: [AudioDevice] = []
    private var inputs: [AudioDevice] = []

    public init(output: AudioChoice = .automatic, input: AudioChoice = .automatic) {
        self.output = output
        self.input = input
    }

    public func chooseOutput(_ choice: AudioChoice) {
        output = choice
        outputSeen = AudioChoices.resolve(choice, outputs) != nil
    }

    public func chooseInput(_ choice: AudioChoice) {
        input = choice
        inputSeen = AudioChoices.resolve(choice, inputs) != nil
    }

    /** Takes the live devices; returns the chosen devices that just disconnected. */
    @discardableResult
    public func update(outputs: [AudioDevice], inputs: [AudioDevice]) -> [LostAudioDevice] {
        self.outputs = outputs
        self.inputs = inputs
        var lost: [LostAudioDevice] = []
        if case let .device(kind, name, _) = output {
            if AudioChoices.resolve(output, outputs) != nil {
                outputSeen = true
            } else if outputSeen {
                lost.append(LostAudioDevice(input: false, kind: kind, name: name))
                output = .automatic
                outputSeen = false
            }
        }
        if case let .device(kind, name, _) = input {
            if AudioChoices.resolve(input, inputs) != nil {
                inputSeen = true
            } else if inputSeen {
                lost.append(LostAudioDevice(input: true, kind: kind, name: name))
                input = .automatic
                inputSeen = false
            }
        }
        return lost
    }

    public func plan() -> AudioPlan { AudioChoices.plan(output: output, input: input, outputs: outputs, inputs: inputs) }

    /** The sheet's rows. */
    public func outputOptions() -> [AudioOption] { AudioChoices.outputs(outputs) }

    public func inputOptions() -> [AudioOption] { AudioChoices.inputs(inputs) }

    /** The row to mark: the choice when its device is here, Automatic otherwise. */
    public func shownOutput() -> AudioChoice { AudioChoices.resolve(output, outputs) != nil ? output : .automatic }

    public func shownInput() -> AudioChoice { AudioChoices.resolve(input, inputs) != nil ? input : .automatic }
}
