// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.audio

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import org.golink.player.Prefs
import org.golink.player.core.AudioChoice
import org.golink.player.core.AudioDevice
import org.golink.player.core.AudioKind
import org.golink.player.core.AudioOption
import org.golink.player.core.AudioSelection
import org.golink.player.core.LostAudioDevice
import kotlin.math.PI
import kotlin.math.min
import kotlin.math.sin

/** What the Sound sheet shows: its rows and the marked ones. */
data class AudioChoicesView(
    val outputs: List<AudioOption> = emptyList(),
    val inputs: List<AudioOption> = emptyList(),
    val output: AudioChoice = AudioChoice.Automatic,
    val input: AudioChoice = AudioChoice.Automatic,
)

/**
 * Sends the game sound and the voice chat to a headset when one is
 * connected (Bluetooth, wired or USB), with its microphone, and to the
 * loudspeaker otherwise, never to the earpiece. That is "Automatic"; the
 * Sound sheet can also pick the output and the microphone by hand
 * (the choices and their rules live in :core, AudioDevices.kt).
 *
 * libwebrtc plays and records in the voice-communication path, which is
 * what gives echo cancellation and lets a Bluetooth headset's microphone
 * work. Android 12+ picks the device with setCommunicationDevice (it needs
 * BLUETOOTH_CONNECT to see Bluetooth headsets); older versions use
 * Bluetooth SCO and the speakerphone switch. A chosen microphone is also
 * given to libwebrtc's recorder as its preferred device ([onInput]).
 */
class AudioRouter(context: Context, private val prefs: Prefs, private val onInput: (AudioDeviceInfo?) -> Unit) {
    enum class Output { SPEAKER, WIRED, BLUETOOTH, USB }

    private val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val handler = Handler(Looper.getMainLooper())
    private var active = false
    private var savedMode = AudioManager.MODE_NORMAL
    private var scoStarted = false
    private var tone: AudioTrack? = null

    private val selection = AudioSelection(AudioChoice.decode(prefs.audioOutput), AudioChoice.decode(prefs.audioInput))
    private var liveOutputs = emptyMap<Int, AudioDeviceInfo>()
    private var liveInputs = emptyMap<Int, AudioDeviceInfo>()

    private val _output = MutableStateFlow(Output.SPEAKER)
    val output: StateFlow<Output> = _output.asStateFlow()

    private val _choices = MutableStateFlow(AudioChoicesView())
    val choices: StateFlow<AudioChoicesView> = _choices.asStateFlow()

    private val _lost = MutableSharedFlow<LostAudioDevice>(extraBufferCapacity = 4)

    /** A chosen device disconnected and its choice went back to Automatic. */
    val lost: SharedFlow<LostAudioDevice> = _lost.asSharedFlow()

    private val devices = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(added: Array<out AudioDeviceInfo>?) = route()

        override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>?) = route()
    }

    /** Takes over the audio route while a room is open. */
    fun start() {
        if (active) return
        active = true
        savedMode = am.mode
        am.mode = AudioManager.MODE_IN_COMMUNICATION
        am.registerAudioDeviceCallback(devices, handler)
        route()
    }

    /** Gives the audio route back (leaving the room). */
    @Suppress("DEPRECATION")
    fun stop() {
        if (!active) return
        active = false
        am.unregisterAudioDeviceCallback(devices)
        stopTone()
        onInput(null)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            am.clearCommunicationDevice()
        } else {
            stopSco()
            am.isSpeakerphoneOn = false
        }
        am.mode = savedMode
    }

    /** Picks the output (Automatic or one device) and remembers it. */
    fun chooseOutput(choice: AudioChoice) {
        selection.chooseOutput(choice)
        prefs.audioOutput = AudioChoice.encode(choice)
        route()
    }

    /** Picks the microphone (Automatic or one device) and remembers it. */
    fun chooseInput(choice: AudioChoice) {
        selection.chooseInput(choice)
        prefs.audioInput = AudioChoice.encode(choice)
        route()
    }

    /** Re-picks the device, e.g. after the Bluetooth permission was granted. */
    fun route() {
        if (!active) return
        val outs = outputDevices()
        val ins = inputDevices()
        liveOutputs = outs.associate { it.second.id to it.first }
        liveInputs = ins.associate { it.second.id to it.first }
        val lost = selection.update(outs.map { it.second }, ins.map { it.second })
        for (l in lost) {
            if (l.input) prefs.audioInput = null else prefs.audioOutput = null
            _lost.tryEmit(l)
        }
        val plan = selection.plan()
        val chosen = plan.communication?.let { liveOutputs[it.id] }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) routeModern(chosen) else routeLegacy(plan.communication?.kind)
        onInput(plan.input?.let { liveInputs[it.id] })
        _choices.value = AudioChoicesView(selection.outputOptions(), selection.inputOptions(), selection.shownOutput(), selection.shownInput())
    }

    @SuppressLint("NewApi")
    private fun routeModern(chosen: AudioDeviceInfo?) {
        val available = am.availableCommunicationDevices
        val pick = chosen?.let { c -> available.firstOrNull { it.id == c.id } }
            ?: PREFERENCE.firstNotNullOfOrNull { type -> available.firstOrNull { it.type == type } }
            ?: available.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
        if (pick != null && am.communicationDevice?.id != pick.id) am.setCommunicationDevice(pick)
        _output.value = outputOf(pick?.type ?: AudioDeviceInfo.TYPE_BUILTIN_SPEAKER)
    }

    /** Below Android 12 only the kind can be chosen: SCO for Bluetooth, the speakerphone switch for the rest. */
    @Suppress("DEPRECATION")
    private fun routeLegacy(chosen: AudioKind?) {
        val outs = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).map { it.type }.toSet()
        val kind = chosen ?: when {
            AudioDeviceInfo.TYPE_BLUETOOTH_SCO in outs -> AudioKind.BLUETOOTH
            AudioDeviceInfo.TYPE_USB_HEADSET in outs -> AudioKind.USB
            outs.any { it in WIRED } -> AudioKind.WIRED
            else -> AudioKind.SPEAKER
        }
        when (kind) {
            AudioKind.BLUETOOTH, AudioKind.HEARING_AID -> {
                am.isSpeakerphoneOn = false
                if (!scoStarted) {
                    runCatching { am.startBluetoothSco() }
                    am.isBluetoothScoOn = true
                    scoStarted = true
                }
                _output.value = Output.BLUETOOTH
            }
            AudioKind.WIRED, AudioKind.USB -> {
                stopSco()
                am.isSpeakerphoneOn = false
                _output.value = if (kind == AudioKind.USB) Output.USB else Output.WIRED
            }
            AudioKind.SPEAKER, AudioKind.BUILTIN_MIC -> {
                stopSco()
                am.isSpeakerphoneOn = true
                _output.value = Output.SPEAKER
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun stopSco() {
        if (!scoStarted) return
        am.stopBluetoothSco()
        am.isBluetoothScoOn = false
        scoStarted = false
    }

    /** The outputs the sheet offers, with the platform device behind each. */
    @SuppressLint("NewApi")
    private fun outputDevices(): List<Pair<AudioDeviceInfo, AudioDevice>> {
        val list = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            am.availableCommunicationDevices
        } else {
            // Hearing aids are not reached through SCO, the only way to pick a device here.
            am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).filter { it.type != TYPE_HEARING_AID }
        }
        return list.mapNotNull { d -> kindOf(d.type, input = false)?.let { d to device(d, it) } }
    }

    private fun inputDevices(): List<Pair<AudioDeviceInfo, AudioDevice>> =
        am.getDevices(AudioManager.GET_DEVICES_INPUTS).mapNotNull { d -> kindOf(d.type, input = true)?.let { d to device(d, it) } }

    private fun device(d: AudioDeviceInfo, kind: AudioKind): AudioDevice {
        val address = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) d.address.orEmpty() else ""
        return AudioDevice(d.id, kind, d.productName?.toString().orEmpty().trim(), address)
    }

    /**
     * Plays a short two-note chime in the voice-communication path, so it
     * comes out where the voice chat and the game sound do.
     */
    fun testTone() {
        stopTone()
        val rate = 48_000
        val notes = listOf(660.0 to 0.16, 880.0 to 0.26)
        val samples = ShortArray(notes.sumOf { (rate * it.second).toInt() })
        var at = 0
        for ((hz, seconds) in notes) {
            val n = (rate * seconds).toInt()
            val fade = rate / 100 // 10 ms in and out, no clicks
            for (i in 0 until n) {
                val envelope = min(1.0, min(i, n - 1 - i).toDouble() / fade)
                samples[at + i] = (sin(2 * PI * hz * i / rate) * envelope * 0.5 * Short.MAX_VALUE).toInt().toShort()
            }
            at += n
        }
        val track = runCatching {
            AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build(),
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setSampleRate(rate)
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build(),
                )
                .setTransferMode(AudioTrack.MODE_STATIC)
                .setBufferSizeInBytes(samples.size * 2)
                .build()
        }.getOrNull() ?: return
        track.write(samples, 0, samples.size)
        track.play()
        tone = track
        handler.postDelayed({ if (tone === track) stopTone() }, samples.size * 1000L / rate + 300)
    }

    private fun stopTone() {
        val t = tone ?: return
        tone = null
        runCatching { t.stop() }
        t.release()
    }

    private fun outputOf(type: Int): Output = when (type) {
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO, TYPE_BLE_HEADSET, TYPE_BLE_SPEAKER, TYPE_HEARING_AID -> Output.BLUETOOTH
        AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> Output.WIRED
        AudioDeviceInfo.TYPE_USB_HEADSET -> Output.USB
        else -> Output.SPEAKER
    }

    companion object {
        // Constants newer than minSdk, by value.
        private const val TYPE_BLE_HEADSET = 26
        private const val TYPE_BLE_SPEAKER = 27
        private const val TYPE_HEARING_AID = 23

        /** A headset beats the loudspeaker; Bluetooth first, as it was connected on purpose. */
        private val PREFERENCE = listOf(
            TYPE_BLE_HEADSET,
            AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
            TYPE_HEARING_AID,
            AudioDeviceInfo.TYPE_USB_HEADSET,
            AudioDeviceInfo.TYPE_WIRED_HEADSET,
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
        )

        private val WIRED = setOf(
            AudioDeviceInfo.TYPE_WIRED_HEADSET,
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
            AudioDeviceInfo.TYPE_USB_HEADSET,
        )

        /**
         * The Sound sheet's kind of a platform device type, or null for the
         * ones it never offers: the earpiece, Bluetooth A2DP (music only,
         * no microphone; the headset shows up as SCO too), telephony, HDMI…
         */
        fun kindOf(type: Int, input: Boolean): AudioKind? = when (type) {
            AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> if (input) null else AudioKind.SPEAKER
            AudioDeviceInfo.TYPE_BUILTIN_MIC -> if (input) AudioKind.BUILTIN_MIC else null
            AudioDeviceInfo.TYPE_WIRED_HEADSET -> AudioKind.WIRED
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> if (input) null else AudioKind.WIRED
            AudioDeviceInfo.TYPE_USB_HEADSET -> AudioKind.USB
            AudioDeviceInfo.TYPE_USB_DEVICE -> if (input) AudioKind.USB else null
            AudioDeviceInfo.TYPE_BLUETOOTH_SCO, TYPE_BLE_HEADSET -> AudioKind.BLUETOOTH
            TYPE_HEARING_AID -> if (input) null else AudioKind.HEARING_AID
            else -> null
        }
    }
}
