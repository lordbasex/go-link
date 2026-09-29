// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.golink.player.audio.AudioRouter
import org.golink.player.core.InviteTarget
import org.golink.player.core.MAX_LOCAL_PLAYERS
import org.golink.player.core.Pad
import org.golink.player.core.RoomClient
import org.golink.player.core.RoomPasses
import org.golink.player.core.RtcPeerFactory
import org.golink.player.core.SignalClient
import org.golink.player.input.GamepadInput
import org.golink.player.net.OkHttpSockets
import org.golink.player.rtc.AndroidRtcPeer
import org.golink.player.rtc.MediaListener
import org.golink.player.rtc.WebRtcEngine
import org.webrtc.AudioTrack
import org.webrtc.VideoTrack

/** What the room screen shows about sound and voice. */
data class SoundState(
    val gameMuted: Boolean = false,
    val micOn: Boolean = false,
    /** Ports whose voice this player silenced. */
    val silenced: Set<Int> = emptySet(),
    /** Ports whose voice track arrived. */
    val voices: Set<Int> = emptySet(),
)

/**
 * One visit to a room: the signaling connection, the room logic from
 * :core, the WebRTC peer, the audio route and the controllers. It lives in
 * the ViewModel, so turning the phone keeps the game running.
 */
class RoomSession(
    context: Context,
    private val prefs: Prefs,
    val target: InviteTarget,
    pin: String,
    private val scope: CoroutineScope,
) {
    private val engine = WebRtcEngine.get(context)
    val eglContext get() = engine.eglBase.eglBaseContext
    private val router = AudioRouter(context)
    val audioOutput = router.output

    private var peer: AndroidRtcPeer? = null

    /** The current WebRTC connection, for the debug build's diagnostics. */
    val rtcPeer: AndroidRtcPeer? get() = peer
    private var stopProbe: () -> Unit = {}
    private var gameAudio: AudioTrack? = null
    private val voiceTracks = HashMap<Int, AudioTrack>()

    private val _video = MutableStateFlow<VideoTrack?>(null)
    val video: StateFlow<VideoTrack?> = _video.asStateFlow()

    private val _sound = MutableStateFlow(SoundState())
    val sound: StateFlow<SoundState> = _sound.asStateFlow()

    private val _controllers = MutableStateFlow<List<GamepadInput.Controller>>(emptyList())
    val controllers: StateFlow<List<GamepadInput.Controller>> = _controllers.asStateFlow()

    val gamepads = GamepadInput { scope.launch(Dispatchers.Main.immediate) { pushPads() } }
    private var touchButtons = 0
    private val lastPads = MutableList(MAX_LOCAL_PLAYERS) { Pad.EMPTY }

    private val media = object : MediaListener {
        override fun onVideo(track: VideoTrack) {
            scope.launch(Dispatchers.Main) { _video.value = track }
        }

        override fun onGameAudio(track: AudioTrack) {
            scope.launch(Dispatchers.Main) {
                gameAudio = track
                applyVolumes()
            }
        }

        override fun onVoice(port: Int, track: AudioTrack) {
            scope.launch(Dispatchers.Main) {
                voiceTracks[port] = track
                _sound.update { it.copy(voices = it.voices + port) }
                applyVolumes()
            }
        }

        override fun onClosed() {
            _video.value = null
            gameAudio = null
            voiceTracks.clear()
            _sound.update { it.copy(voices = emptySet()) }
        }
    }

    private val signal = SignalClient(prefs.signal.url, OkHttpSockets(), scope)

    val client = RoomClient(
        signal = signal,
        target = target,
        typedPin = pin,
        passes = RoomPasses(prefs),
        peers = RtcPeerFactory { servers, events ->
            // Runs on the main thread (RoomClient's scope).
            AndroidRtcPeer(engine, servers, events, media).also { p ->
                peer = p
                applyMic()
            }
        },
        scope = scope,
    )

    fun start() {
        router.start()
        client.setIdentity(prefs.playerName, listOf(0))
        client.start()
        // Debug builds log the room and the RTP counters for the end-to-end
        // test (src/debug); release builds have an empty probe (src/release).
        stopProbe = E2eProbe.attach(this, scope)
    }

    fun close() {
        stopProbe()
        client.close()
        peer = null
        router.stop()
        gamepads.clear()
    }

    /** Re-picks the audio device (a permission changed, a headset came). */
    fun reroute() = router.route()

    fun setName(name: String) = client.setIdentity(name, localPlayers())

    /** Buttons held on the on-screen gamepad: they belong to local player 0. */
    fun setTouchButtons(buttons: Int) {
        if (buttons == touchButtons) return
        touchButtons = buttons
        pushPads()
    }

    private fun localPlayers(): List<Int> = (listOf(0) + gamepads.controllers.map { it.player }).distinct().sorted()

    private fun pushPads() {
        val pads = gamepads.pads().toMutableList()
        pads[0] = pads[0].copy(buttons = pads[0].buttons or touchButtons)
        pads.forEachIndexed { player, pad ->
            if (pad != lastPads[player]) {
                lastPads[player] = pad
                client.setPad(player, pad)
            }
        }
        val list = gamepads.controllers
        if (list != _controllers.value) {
            _controllers.value = list
            client.setIdentity(prefs.playerName, localPlayers())
        }
    }

    fun setGameMuted(muted: Boolean) {
        _sound.update { it.copy(gameMuted = muted) }
        applyVolumes()
    }

    /** Silences (or not) one player's voice, only for this phone. */
    fun toggleSilence(port: Int) {
        _sound.update { s -> s.copy(silenced = if (port in s.silenced) s.silenced - port else s.silenced + port) }
        applyVolumes()
    }

    /** Turns the microphone on or off. Call on() only with RECORD_AUDIO granted. */
    fun setMic(on: Boolean) {
        _sound.update { it.copy(micOn = on) }
        applyMic()
    }

    private fun applyMic() {
        val p = peer ?: return
        p.setMicTrack(if (_sound.value.micOn) engine.microphone() else null)
    }

    private fun applyVolumes() {
        val s = _sound.value
        gameAudio?.setVolume(if (s.gameMuted) 0.0 else 1.0)
        for ((port, track) in voiceTracks) track.setVolume(if (port in s.silenced) 0.0 else 1.0)
    }
}
