// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player

import android.content.Context
import org.golink.player.core.KeyValueStore
import org.golink.player.core.PlayerName
import org.golink.player.core.SignalUrls

/**
 * The app's small settings, in SharedPreferences (the web keeps the same
 * things in localStorage): the player name, a custom signaling server,
 * the accepted terms, the rooms' return tokens and the sound devices.
 */
class Prefs(context: Context) : KeyValueStore {
    private val sp = context.getSharedPreferences("go-link", Context.MODE_PRIVATE)

    override fun get(key: String): String? = sp.getString(key, null)

    override fun set(key: String, value: String?) {
        sp.edit().apply { if (value == null) remove(key) else putString(key, value) }.apply()
    }

    var playerName: String
        get() = get(NAME_KEY) ?: ""
        set(v) = set(NAME_KEY, PlayerName.normalize(v).ifEmpty { null })

    /** The signaling server in use: a custom one saved in Settings, or the official one. */
    val signal: SignalUrls.Choice get() = SignalUrls.resolve(get(SIGNAL_KEY), allowDevHosts = BuildConfig.DEBUG)

    fun saveCustomSignal(url: String?) = set(SIGNAL_KEY, url)

    /** Whether a permission explainer was already shown (then the system decides). */
    fun asked(permission: String): Boolean = sp.getBoolean("asked:$permission", false)

    fun markAsked(permission: String) = sp.edit().putBoolean("asked:$permission", true).apply()

    /** The on-screen gamepad; on unless the person hid it. */
    var touchPad: Boolean
        get() = sp.getBoolean("touchpad", true)
        set(v) = sp.edit().putBoolean("touchpad", v).apply()

    /** The room's stats overlay (fps, ping, path); off unless the person turned it on. */
    var statsOverlay: Boolean
        get() = sp.getBoolean("stats-overlay", false)
        set(v) = sp.edit().putBoolean("stats-overlay", v).apply()

    /** The coin sound of the startup intro; on unless the person turned it off. */
    var startupSound: Boolean
        get() = sp.getBoolean("startup-sound", true)
        set(v) = sp.edit().putBoolean("startup-sound", v).apply()

    /** The Sound sheet's output choice (AudioChoice.encode); null is Automatic. */
    var audioOutput: String?
        get() = get(AUDIO_OUTPUT_KEY)
        set(v) = set(AUDIO_OUTPUT_KEY, v)

    /** The Sound sheet's microphone choice (AudioChoice.encode); null is Automatic. */
    var audioInput: String?
        get() = get(AUDIO_INPUT_KEY)
        set(v) = set(AUDIO_INPUT_KEY, v)

    companion object {
        const val AUDIO_OUTPUT_KEY = "go-link.audio-output"
        const val AUDIO_INPUT_KEY = "go-link.audio-input"
        const val NAME_KEY = "go-link.player-name"
        const val SIGNAL_KEY = "go-link.signal-url"
    }
}
