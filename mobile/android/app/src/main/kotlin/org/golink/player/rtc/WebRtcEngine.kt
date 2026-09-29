// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.rtc

import android.content.Context
import android.util.Log
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.MediaConstraints
import org.webrtc.PeerConnectionFactory
import org.webrtc.audio.JavaAudioDeviceModule

/**
 * The process-wide libwebrtc objects: one factory, one EGL context shared
 * by the decoder and the video view, one audio device module, and the
 * microphone track (created only after the person allows the microphone).
 */
class WebRtcEngine private constructor(context: Context) {
    val eglBase: EglBase = EglBase.create()

    private val adm: JavaAudioDeviceModule = JavaAudioDeviceModule.builder(context)
        // Echo cancellation and noise suppression for voice chat, like the
        // web's getUserMedia constraints.
        .setUseHardwareAcousticEchoCanceler(true)
        .setUseHardwareNoiseSuppressor(true)
        .setUseStereoOutput(true)
        .setAudioRecordErrorCallback(object : JavaAudioDeviceModule.AudioRecordErrorCallback {
            override fun onWebRtcAudioRecordInitError(errorMessage: String?) {
                log("mic init: $errorMessage")
            }

            override fun onWebRtcAudioRecordStartError(errorCode: JavaAudioDeviceModule.AudioRecordStartErrorCode?, errorMessage: String?) {
                log("mic start: $errorMessage")
            }

            override fun onWebRtcAudioRecordError(errorMessage: String?) {
                log("mic: $errorMessage")
            }
        })
        .createAudioDeviceModule()

    val factory: PeerConnectionFactory = PeerConnectionFactory.builder()
        .setAudioDeviceModule(adm)
        .setVideoDecoderFactory(DefaultVideoDecoderFactory(eglBase.eglBaseContext))
        .setVideoEncoderFactory(DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true))
        .createPeerConnectionFactory()

    private var micSource: AudioSource? = null
    private var micTrack: AudioTrack? = null

    /** The microphone track; call only with the RECORD_AUDIO permission. */
    fun microphone(): AudioTrack {
        micTrack?.let { return it }
        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("googEchoCancellation", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googNoiseSuppression", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googAutoGainControl", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googHighpassFilter", "true"))
        }
        val source = factory.createAudioSource(constraints)
        micSource = source
        return factory.createAudioTrack("mic", source).also { micTrack = it }
    }

    private fun log(text: String) {
        Log.w("go-link", text)
    }

    companion object {
        @Volatile private var instance: WebRtcEngine? = null

        fun get(context: Context): WebRtcEngine = instance ?: synchronized(this) {
            instance ?: run {
                PeerConnectionFactory.initialize(
                    PeerConnectionFactory.InitializationOptions.builder(context.applicationContext).createInitializationOptions(),
                )
                WebRtcEngine(context.applicationContext).also { instance = it }
            }
        }
    }
}
