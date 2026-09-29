// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.audio

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Sends the game sound and the voice chat to a headset when one is
 * connected (Bluetooth, wired or USB), with its microphone, and to the
 * loudspeaker otherwise, never to the earpiece.
 *
 * libwebrtc plays and records in the voice-communication path, which is
 * what gives echo cancellation and lets a Bluetooth headset's microphone
 * work. Android 12+ picks the device with setCommunicationDevice (it needs
 * BLUETOOTH_CONNECT to see Bluetooth headsets); older versions use
 * Bluetooth SCO and the speakerphone switch.
 */
class AudioRouter(context: Context) {
    enum class Output { SPEAKER, WIRED, BLUETOOTH, USB }

    private val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val handler = Handler(Looper.getMainLooper())
    private var active = false
    private var savedMode = AudioManager.MODE_NORMAL
    private var scoStarted = false

    private val _output = MutableStateFlow(Output.SPEAKER)
    val output: StateFlow<Output> = _output.asStateFlow()

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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            am.clearCommunicationDevice()
        } else {
            if (scoStarted) {
                am.stopBluetoothSco()
                am.isBluetoothScoOn = false
                scoStarted = false
            }
            am.isSpeakerphoneOn = false
        }
        am.mode = savedMode
    }

    /** Re-picks the device, e.g. after the Bluetooth permission was granted. */
    fun route() {
        if (!active) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) routeModern() else routeLegacy()
    }

    @SuppressLint("NewApi")
    private fun routeModern() {
        val available = am.availableCommunicationDevices
        val pick = PREFERENCE.firstNotNullOfOrNull { type -> available.firstOrNull { it.type == type } }
            ?: available.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
        if (pick != null && am.communicationDevice?.id != pick.id) am.setCommunicationDevice(pick)
        _output.value = outputOf(pick?.type ?: AudioDeviceInfo.TYPE_BUILTIN_SPEAKER)
    }

    @Suppress("DEPRECATION")
    private fun routeLegacy() {
        val outs = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).map { it.type }.toSet()
        when {
            AudioDeviceInfo.TYPE_BLUETOOTH_SCO in outs -> {
                am.isSpeakerphoneOn = false
                if (!scoStarted) {
                    runCatching { am.startBluetoothSco() }
                    am.isBluetoothScoOn = true
                    scoStarted = true
                }
                _output.value = Output.BLUETOOTH
            }
            outs.any { it in WIRED } -> {
                stopSco()
                am.isSpeakerphoneOn = false
                _output.value = if (AudioDeviceInfo.TYPE_USB_HEADSET in outs) Output.USB else Output.WIRED
            }
            else -> {
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
    }
}
