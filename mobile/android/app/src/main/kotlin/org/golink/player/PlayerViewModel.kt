// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.golink.player.core.InviteTarget
import org.golink.player.core.SignalUrls
import org.golink.player.core.Terms
import java.time.Instant

/** The app's screens. */
sealed interface Screen {
    data object Home : Screen

    data object Scan : Screen

    /**
     * The PIN form. target is fixed when it came from a QR code or a link
     * (the person only types the PIN), or null to type the code too.
     */
    data class Join(val target: InviteTarget?) : Screen

    /** Asks for the headphones permission (Android 12+) before a room. */
    data class Headphones(val target: InviteTarget, val pin: String) : Screen

    data object Room : Screen

    data object Settings : Screen
}

class PlayerViewModel(app: Application) : AndroidViewModel(app) {
    val prefs = Prefs(app)

    private val _screen = MutableStateFlow<Screen>(Screen.Home)
    val screen: StateFlow<Screen> = _screen.asStateFlow()

    private val _signal = MutableStateFlow(prefs.signal)
    val signal: StateFlow<SignalUrls.Choice> = _signal.asStateFlow()

    var session: RoomSession? = null
        private set

    fun go(screen: Screen) {
        _screen.value = screen
    }

    /** An invitation from a QR code or an App Link: straight to the PIN. */
    fun openInvite(target: InviteTarget) {
        leaveRoom()
        _screen.value = Screen.Join(target)
    }

    fun termsAccepted(): Boolean = Terms.accepted(prefs)

    /** Joins with the typed PIN, after the terms were accepted on the form. */
    fun join(target: InviteTarget, pin: String, askHeadphones: Boolean) {
        Terms.accept(prefs, Instant.now().toString())
        if (askHeadphones) {
            _screen.value = Screen.Headphones(target, pin)
            return
        }
        enterRoom(target, pin)
    }

    fun enterRoom(target: InviteTarget, pin: String) {
        leaveRoom()
        val s = RoomSession(getApplication(), prefs, target, pin, viewModelScope)
        session = s
        s.start()
        _screen.value = Screen.Room
    }

    fun leaveRoom() {
        session?.close()
        session = null
        if (_screen.value == Screen.Room) _screen.value = Screen.Home
    }

    fun setName(name: String) {
        prefs.playerName = name
        session?.setName(prefs.playerName)
    }

    /** Saves a custom signaling server (already tested), or null for the official one. */
    fun setSignal(url: String?) {
        prefs.saveCustomSignal(url)
        _signal.value = prefs.signal
    }

    override fun onCleared() {
        session?.close()
        session = null
    }
}
