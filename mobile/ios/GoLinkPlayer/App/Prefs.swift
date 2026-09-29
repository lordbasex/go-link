// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import Foundation
import GoLinkCore

/**
 * The app's small settings, in UserDefaults (the web keeps the same things
 * in localStorage, the Android app in SharedPreferences): the player name,
 * a custom signaling server, the accepted terms, the rooms' return tokens,
 * the microphone choice and the startup sound.
 */
final class Prefs: KeyValueStore {
    static let nameKey = "go-link.player-name"
    static let signalKey = "go-link.signal-url"
    static let audioInputKey = "go-link.audio-input"
    static let touchPadKey = "go-link.touchpad"
    static let gameVolumeKey = "go-link.game-volume"
    static let voiceVolumeKey = "go-link.voice-volume"
    static let startupSoundKey = "go-link.startup-sound"
    static let statsKey = "go-link.stats"

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func get(_ key: String) -> String? { defaults.string(forKey: key) }

    func set(_ key: String, _ value: String?) {
        if let value { defaults.set(value, forKey: key) } else { defaults.removeObject(forKey: key) }
    }

    var playerName: String {
        get { get(Self.nameKey) ?? "" }
        set {
            // The device's rules (PlayerName): what it would keep, or nothing.
            let clean = PlayerName.sanitize(newValue)
            set(Self.nameKey, clean.isEmpty ? nil : clean)
        }
    }

    /** Debug builds may reach ws:// on the development machine; release builds never. */
    static var allowDevHosts: Bool {
        #if DEBUG
        return true
        #else
        return false
        #endif
    }

    /** The signaling server in use: a custom one saved in Settings, or the official one. */
    var signal: SignalUrls.Choice { SignalUrls.resolve(get(Self.signalKey), allowDevHosts: Self.allowDevHosts) }

    func saveCustomSignal(_ url: String?) { set(Self.signalKey, url) }

    /** The on-screen gamepad; on unless the person hid it. */
    var touchPad: Bool {
        get { defaults.object(forKey: Self.touchPadKey) as? Bool ?? true }
        set { defaults.set(newValue, forKey: Self.touchPadKey) }
    }

    /** The Sound sheet's microphone choice (AudioChoice.encode); nil is Automatic. */
    var audioInput: String? {
        get { get(Self.audioInputKey) }
        set { set(Self.audioInputKey, newValue) }
    }

    /** Game and voice volumes, 0 to 3 (1 = as sent), like the web's 0-300 %. */
    var gameVolume: Double {
        get { defaults.object(forKey: Self.gameVolumeKey) as? Double ?? 1 }
        set { defaults.set(newValue, forKey: Self.gameVolumeKey) }
    }

    var voiceVolume: Double {
        get { defaults.object(forKey: Self.voiceVolumeKey) as? Double ?? 1 }
        set { defaults.set(newValue, forKey: Self.voiceVolumeKey) }
    }

    /** The room's stats overlay (fps, ping, path); off unless the person turned it on. */
    var stats: Bool {
        get { defaults.object(forKey: Self.statsKey) as? Bool ?? false }
        set { defaults.set(newValue, forKey: Self.statsKey) }
    }

    /** The intro's coin sound on a cold start; on unless the person turned it off. */
    var startupSound: Bool {
        get { defaults.object(forKey: Self.startupSoundKey) as? Bool ?? true }
        set { defaults.set(newValue, forKey: Self.startupSoundKey) }
    }
}
