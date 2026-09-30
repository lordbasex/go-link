// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.picture

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import org.webrtc.JavaI420Buffer
import org.webrtc.VideoFrame
import org.webrtc.VideoSink
import java.util.Calendar
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * A synthetic arcade frame for the debug picture lab (the website's
 * picture/testCard.ts, drawn the same way): a test card at a game's native
 * size, 384 x 224, with a grid, color bars, gray steps, 1-4 pixel
 * gratings, diagonals, a circle, a pixel-font clock and moving sprites,
 * sent 60 times a second as I420 frames, like a decoded VP8 stream.
 * With scale 2 every card pixel becomes an exact 2 x 2 block (768 x 448),
 * like a game room's 2x stream.
 */
class TestCardFrames(private val sink: VideoSink?, private val scale: Int = 1, run: Boolean = true) {
    private val fw = W * scale
    private val fh = H * scale
    private val thread = if (run) HandlerThread("go-link-testcard").apply { start() } else null
    private val handler = thread?.let { Handler(it.looper) }
    private val bitmap = Bitmap.createBitmap(fw, fh, Bitmap.Config.ARGB_8888)

    // Integer rectangles without antialiasing: at scale 2 each card pixel is an exact 2 x 2 block.
    private val canvas = Canvas(bitmap).apply { scale(scale.toFloat(), scale.toFloat()) }
    private val paint = Paint().apply { isAntiAlias = false }
    private val pixels = IntArray(fw * fh)
    private val start = SystemClock.uptimeMillis()
    private var n = 0L
    @Volatile private var running = run

    /** Frames sent so far (the lab shows the rate). */
    @Volatile var sent = 0L
        private set

    init {
        handler?.post(::tick)
    }

    fun stop() {
        running = false
        thread?.quitSafely()
    }

    /** One still card (t in ms, a fixed clock) as ARGB pixels, rows top to bottom (the debug 2x check). */
    fun still(t: Long, now: Calendar): IntArray {
        draw(t, now)
        bitmap.getPixels(pixels, 0, fw, 0, 0, fw, fh)
        return pixels.copyOf()
    }

    private fun tick() {
        if (!running) return
        val t = SystemClock.uptimeMillis() - start
        draw(t, Calendar.getInstance())
        val frame = VideoFrame(toI420(), 0, SystemClock.elapsedRealtimeNanos())
        sink?.onFrame(frame)
        frame.release()
        sent++
        n++
        // Drift-free 60 fps: each frame is due at start + n / 60 s.
        handler?.postAtTime(::tick, start + n * 1000 / 60)
    }

    private fun rect(x: Number, y: Number, w: Number, h: Number, color: Int) {
        paint.color = color
        val l = x.toFloat()
        val tp = y.toFloat()
        canvas.drawRect(l, tp, l + w.toFloat(), tp + h.toFloat(), paint)
    }

    private fun text(s: String, x: Int, y: Int, px: Int, color: Int) {
        var cx = x
        for (ch in s) {
            val g = GLYPHS[ch] ?: GLYPHS.getValue(' ')
            for (i in 0 until 15) if (g[i] == '1') rect(cx + (i % 3) * px, y + (i / 3) * px, px, px, color)
            cx += 4 * px
        }
    }

    private fun sprite(rows: List<String>, x: Double, y: Double) {
        rows.forEachIndexed { j, row ->
            row.forEachIndexed { i, c -> SPRITE_COLORS[c]?.let { rect(x.roundToInt() + i, y.roundToInt() + j, 1, 1, it) } }
        }
    }

    private fun draw(t: Long, now: Calendar) {
        rect(0, 0, W, H, 0xFF6A6A6A.toInt())
        for (x in 0..W step 16) rect(x, 0, 1, H, 0xFFE8E8E8.toInt())
        for (y in 0..H step 16) rect(0, y, W, 1, 0xFFE8E8E8.toInt())
        val bx = 64
        val by = 32
        val bw = W - 128
        val bh = H - 64
        rect(bx, by, bw, bh, 0xFF000000.toInt())
        val barW = bw / BARS.size
        BARS.forEachIndexed { i, c -> rect(bx + i * barW, by + 24, barW, 44, c) }
        for (i in 0 until 8) {
            val v = (i / 7.0 * 255).roundToInt()
            rect(bx + i * (bw / 8.0), by + 70, kotlin.math.ceil(bw / 8.0), 16, (0xFF shl 24) or (v shl 16) or (v shl 8) or v)
        }
        val gy = by + 90
        listOf(1, 2, 3, 4).forEachIndexed { k, step ->
            val gx = bx + 8 + k * 62
            var x = 0
            while (x < 56) {
                rect(gx + x, gy, step, 20, WHITE)
                x += step * 2
            }
        }
        for (i in 0 until 40) {
            rect(bx + 8 + i, gy + 24 + i / 2, 1, 1, WHITE)
            rect(bx + 60 + i, gy + 24 + (40 - i) / 2, 1, 1, WHITE)
        }
        val cx = bx + bw - 44
        val cy = gy + 34
        for (a in 0 until 360 step 2) {
            val r = Math.toRadians(a.toDouble())
            rect((cx + cos(r) * 14).roundToInt(), (cy + sin(r) * 14).roundToInt(), 1, 1, WHITE)
        }
        fun p2(v: Int) = v.toString().padStart(2, '0')
        text("${p2(now.get(Calendar.HOUR_OF_DAY))}:${p2(now.get(Calendar.MINUTE))}:${p2(now.get(Calendar.SECOND))}", bx + 100, by + 6, 3, WHITE)
        text("${W}x$H", bx + 110, by + bh - 34, 2, 0xFFC4CAD6.toInt())
        text("GO-LINK", bx + 100, by + bh - 20, 3, 0xFFF2A33A.toInt())
        val s = t / 1000.0
        val shipX = ((s * 60) % (W + 20)) - 10
        sprite(SHIP, shipX, H - 22.0)
        val coinX = 20 + abs(((s * 45) % 80) - 40)
        val coinY = 8 + abs(sin(s * 3)) * 12
        sprite(COIN, coinX, coinY)
        sprite(COIN, W - 30 - coinX, coinY)
    }

    /** The bitmap as an I420 buffer, BT.601 limited range (what a VP8 decoder gives). */
    private fun toI420(): JavaI420Buffer {
        val W = fw
        val H = fh
        bitmap.getPixels(pixels, 0, W, 0, 0, W, H)
        val buf = JavaI420Buffer.allocate(W, H)
        val y = buf.dataY
        val u = buf.dataU
        val v = buf.dataV
        val sy = buf.strideY
        val su = buf.strideU
        val sv = buf.strideV
        for (j in 0 until H) {
            for (i in 0 until W) {
                val p = pixels[j * W + i]
                val r = (p shr 16) and 255
                val g = (p shr 8) and 255
                val b = p and 255
                y.put(j * sy + i, (((66 * r + 129 * g + 25 * b + 128) shr 8) + 16).toByte())
            }
        }
        for (j in 0 until H / 2) {
            for (i in 0 until W / 2) {
                var r = 0
                var g = 0
                var b = 0
                for (dy in 0..1) for (dx in 0..1) {
                    val p = pixels[(2 * j + dy) * W + 2 * i + dx]
                    r += (p shr 16) and 255
                    g += (p shr 8) and 255
                    b += p and 255
                }
                r /= 4
                g /= 4
                b /= 4
                u.put(j * su + i, (((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128).toByte())
                v.put(j * sv + i, (((112 * r - 94 * g - 18 * b + 128) shr 8) + 128).toByte())
            }
        }
        return buf
    }

    companion object {
        const val W = 384
        const val H = 224

        /** Arcade monitors are 4:3, whatever the game's pixel grid is. */
        const val ASPECT = 4.0 / 3.0

        private const val WHITE = 0xFFFFFFFF.toInt()
        private val BARS = listOf(0xFFC0C0C0, 0xFFC0C000, 0xFF00C0C0, 0xFF00C000, 0xFFC000C0, 0xFFC00000, 0xFF0000C0).map { it.toInt() }

        /** A 3x5 pixel font: digits, a colon and a few letters. */
        private val GLYPHS = mapOf(
            '0' to "111101101101111", '1' to "010110010010111", '2' to "111001111100111", '3' to "111001111001111",
            '4' to "101101111001001", '5' to "111100111001111", '6' to "111100111101111", '7' to "111001010010010",
            '8' to "111101111101111", '9' to "111101111001111", ':' to "000010000010000", 'x' to "000101010101000",
            'G' to "111100101101111", 'O' to "111101101101111", 'L' to "100100100100111", 'I' to "111010010010111",
            'N' to "101111111101101", 'K' to "101101110101101", '-' to "000000111000000", ' ' to "000000000000000",
        )

        private val SHIP = listOf("....aa....", "...abba...", "..abbbba..", ".aabccbaa.", "aabbccbbaa", "a.bbbbbb.a", "..d....d..")
        private val COIN = listOf("..eeee..", ".efffee.", "effeefe.", "efeffee.", "effeefe.", ".efffee.", "..eeee..")
        private val SPRITE_COLORS = mapOf(
            'a' to 0xFF4FC3D9.toInt(), 'b' to 0xFFE9ECF2.toInt(), 'c' to 0xFFE0627A.toInt(),
            'd' to 0xFFF2A33A.toInt(), 'e' to 0xFFB87A14.toInt(), 'f' to 0xFFFFD76B.toInt(),
        )
    }
}
