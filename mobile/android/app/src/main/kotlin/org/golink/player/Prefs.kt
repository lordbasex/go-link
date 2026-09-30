// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player

import android.content.Context
import org.golink.player.core.KeyValueStore
import org.golink.player.core.Picture
import org.golink.player.core.PictureSettings
import org.golink.player.core.PlayerName
import org.golink.player.core.SavedPicture
import org.golink.player.core.SignalUrls

/**
 * The app's small settings, in SharedPreferences (the web keeps the same
 * things in localStorage): the player name, a custom signaling server,
 * the accepted terms, the rooms' return tokens, the sound devices and
 * volumes, and how the game's picture is drawn.
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

    /** The sound settings' output choice (AudioChoice.encode); null is Automatic. */
    var audioOutput: String?
        get() = get(AUDIO_OUTPUT_KEY)
        set(v) = set(AUDIO_OUTPUT_KEY, v)

    /** The sound settings' microphone choice (AudioChoice.encode); null is Automatic. */
    var audioInput: String?
        get() = get(AUDIO_INPUT_KEY)
        set(v) = set(AUDIO_INPUT_KEY, v)

    /** Game and voices volumes, 0 to 1 (1 = as sent). Older values above 1 come back as 1. */
    var gameVolume: Double
        get() = volume(GAME_VOLUME_KEY)
        set(v) = set(GAME_VOLUME_KEY, v.coerceIn(0.0, 1.0).toString())

    var voiceVolume: Double
        get() = volume(VOICE_VOLUME_KEY)
        set(v) = set(VOICE_VOLUME_KEY, v.coerceIn(0.0, 1.0).toString())

    private fun volume(key: String): Double = get(key)?.toDoubleOrNull()?.takeIf { !it.isNaN() }?.coerceIn(0.0, 1.0) ?: 1.0

    /**
     * The viewer's own picture choice (the same keys as the website and the
     * iOS app); nothing chosen lets a room's default apply.
     */
    val savedPicture: SavedPicture get() = PictureSettings.readSaved(this)

    fun choosePicture(p: Picture) = PictureSettings.write(this, p)

    fun clearPicture() = PictureSettings.clear(this)

    companion object {
        const val GAME_VOLUME_KEY = "go-link.game-volume"
        const val VOICE_VOLUME_KEY = "go-link.voice-volume"
        const val AUDIO_OUTPUT_KEY = "go-link.audio-output"
        const val AUDIO_INPUT_KEY = "go-link.audio-input"
        const val NAME_KEY = "go-link.player-name"
        const val SIGNAL_KEY = "go-link.signal-url"
    }
}
