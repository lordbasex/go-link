// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.picture

import android.graphics.Bitmap
import android.opengl.GLES20
import android.util.Log
import org.golink.player.core.Picture
import org.golink.player.core.PictureBands
import org.golink.player.core.PictureStyle
import org.golink.player.core.PixelSize
import org.webrtc.EglBase
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Calendar

/**
 * Debug builds only (`--es lab check2x`): proves the 2x stream path
 * offscreen, like the website's picture lab did in Chromium. The test card
 * (fixed time and clock) is drawn with the real PictureDrawer in every
 * style and side, into an offscreen EGL surface: once at its own size
 * (384 x 224) and once enlarged 2x with nearest neighbour and marked as a
 * 2x stream (native 384 x 224). Both must be byte for byte identical. The
 * same 2x frame drawn raw (no native size) must differ, which shows the
 * check really goes through the average. Smooth on black sides is left
 * out: libwebrtc's plain drawer shows it (the plain picture, unchanged by
 * design).
 */
object Picture2xCheck {
    data class Result(
        val identical: Int = 0,
        val total: Int = 0,
        val rawDiffers: Int = 0,
        val failures: List<String> = emptyList(),
        /** CRT arcade with the ambient sides: native, 2x averaged, 2x raw (for the screenshot). */
        val images: List<Bitmap> = emptyList(),
    ) {
        val ok get() = total > 0 && identical == total && failures.isEmpty()
        val summary get() = (if (ok) "ok" else "failed") + " $identical/$total identical, raw 2x differs in $rawDiffers/$total" +
            (if (failures.isEmpty()) "" else " · " + failures.take(4).joinToString(", "))
    }

    private val TARGETS = listOf(1170 to 878, 844 to 390)

    /** Runs on the calling thread (it makes its own EGL context current there). */
    fun run(): Result {
        val w = TestCardFrames.W
        val h = TestCardFrames.H
        val now = Calendar.getInstance().apply { set(2026, 8, 29, 11, 13, 20) }
        val card = TestCardFrames(null, 1, run = false).still(1250, now)
        val up = IntArray(w * h * 4)
        for (y in 0 until h * 2) for (x in 0 until w * 2) up[y * w * 2 + x] = card[(y / 2) * w + x / 2]
        val egl = EglBase.create(null, EglBase.CONFIG_PIXEL_BUFFER)
        var identical = 0
        var total = 0
        var rawDiffers = 0
        val failures = mutableListOf<String>()
        var images = emptyList<Bitmap>()
        try {
            for ((tw, th) in TARGETS) {
                egl.createPbufferSurface(tw, th)
                egl.makeCurrent()
                val nativeTex = texture(card, w, h)
                val upTex = texture(up, w * 2, h * 2)
                for (style in PictureStyle.entries) for (bands in PictureBands.entries) {
                    if (style == PictureStyle.SMOOTH && bands == PictureBands.BLACK) continue
                    val picture = Picture(style, bands)
                    val a = draw(nativeTex, w, h, picture, tw, th, null)
                    val b = draw(upTex, w * 2, h * 2, picture, tw, th, PixelSize(w, h))
                    val raw = draw(upTex, w * 2, h * 2, picture, tw, th, null)
                    val name = "${style.name.lowercase()}/${bands.name.lowercase()}@${tw}x$th"
                    total++
                    if (a.contentEquals(b)) identical++ else failures += "$name ${differing(a, b)} px differ"
                    if (!a.contentEquals(raw)) rawDiffers++
                    if (tw == TARGETS[0].first && style == PictureStyle.CRT && bands == PictureBands.AMBIENT) {
                        images = listOf(a, b, raw).map { bitmap(it, tw, th) }
                    }
                }
                GLES20.glDeleteTextures(2, intArrayOf(nativeTex, upTex), 0)
                egl.detachCurrent()
                egl.releaseSurface()
            }
        } catch (e: RuntimeException) {
            failures += "error: ${e.message}"
        } finally {
            egl.release()
        }
        return Result(identical, total, rawDiffers, failures, images).also { Log.i("go-link", "picture 2x check: ${it.summary}") }
    }

    /** ARGB pixels (rows top to bottom) as an RGBA texture. */
    private fun texture(argb: IntArray, w: Int, h: Int): Int {
        val bytes = ByteBuffer.allocateDirect(w * h * 4).order(ByteOrder.nativeOrder())
        for (p in argb) {
            bytes.put(((p shr 16) and 255).toByte()).put(((p shr 8) and 255).toByte()).put((p and 255).toByte()).put(255.toByte())
        }
        bytes.position(0)
        val t = IntArray(1)
        GLES20.glGenTextures(1, t, 0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, t[0])
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_NEAREST)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_NEAREST)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glPixelStorei(GLES20.GL_UNPACK_ALIGNMENT, 1)
        GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA, w, h, 0, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, bytes)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0)
        return t[0]
    }

    /**
     * One still picture with a fresh drawer (the ambient light starts from
     * this frame), read back. The texture's row 0 is the card's top row, so
     * the matrix turns y over (libwebrtc's matrices show frames the right
     * way up).
     */
    private fun draw(tex: Int, fw: Int, fh: Int, picture: Picture, tw: Int, th: Int, native: PixelSize?): ByteArray {
        val drawer = PictureDrawer()
        drawer.params = PictureParams(picture, null, TestCardFrames.ASPECT, 3.0, false, native)
        drawer.drawRgb(tex, FLIP_Y, fw, fh, 0, 0, tw, th)
        GLES20.glFinish()
        val out = ByteBuffer.allocateDirect(tw * th * 4).order(ByteOrder.nativeOrder())
        GLES20.glReadPixels(0, 0, tw, th, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, out)
        drawer.release()
        val err = GLES20.glGetError()
        if (err != GLES20.GL_NO_ERROR) throw RuntimeException("GL error $err")
        return ByteArray(tw * th * 4).also { out.position(0); out.get(it) }
    }

    private fun differing(a: ByteArray, b: ByteArray): Int {
        var n = 0
        var i = 0
        while (i + 2 < minOf(a.size, b.size)) {
            if (a[i] != b[i] || a[i + 1] != b[i + 1] || a[i + 2] != b[i + 2]) n++
            i += 4
        }
        return n
    }

    /** glReadPixels rows go bottom to top. */
    private fun bitmap(rgba: ByteArray, w: Int, h: Int): Bitmap {
        val px = IntArray(w * h)
        for (y in 0 until h) for (x in 0 until w) {
            val o = ((h - 1 - y) * w + x) * 4
            px[y * w + x] = (0xFF shl 24) or ((rgba[o].toInt() and 255) shl 16) or ((rgba[o + 1].toInt() and 255) shl 8) or (rgba[o + 2].toInt() and 255)
        }
        return Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888)
    }

    private val FLIP_Y = floatArrayOf(1f, 0f, 0f, 0f, 0f, -1f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 1f, 0f, 1f)
}
