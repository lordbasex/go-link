// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.SoundPool
import android.os.Handler
import android.os.Looper
import org.golink.player.R

/**
 * The intro's coin sound (res/raw/coin.wav, an original sound made by
 * scripts/coin-sound.mjs). A game sound effect: it never takes the audio
 * focus (music keeps playing) and stays quiet while the phone is on silent
 * or vibrate. Loaded when the intro starts, played once, then released.
 */
class CoinSound(context: Context) {
    private val audio = context.getSystemService(AudioManager::class.java)
    private val pool = SoundPool.Builder()
        .setMaxStreams(1)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build(),
        )
        .build()
    private val main = Handler(Looper.getMainLooper())
    private var loaded = false
    private var wanted = false
    private var released = false
    private val id: Int

    init {
        pool.setOnLoadCompleteListener { _, _, status ->
            loaded = status == 0
            if (loaded && wanted) start()
        }
        id = pool.load(context, R.raw.coin, 1)
    }

    /** Plays it now (or as soon as it is loaded), then frees the player. */
    fun play() {
        if (released || wanted) return
        wanted = true
        if (audio?.ringerMode != AudioManager.RINGER_MODE_NORMAL) {
            release()
            return
        }
        if (loaded) start()
    }

    private fun start() {
        pool.play(id, 1f, 1f, 1, 0, 1f)
        main.postDelayed({ release() }, 1000)
    }

    fun release() {
        if (released) return
        released = true
        pool.release()
    }
}
