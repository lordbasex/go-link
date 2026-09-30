// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.picture

import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.util.Log
import org.golink.player.core.Picture
import org.golink.player.core.PixelSize
import org.golink.player.core.PictureBands
import org.golink.player.core.PictureLayout
import org.golink.player.core.PictureSettings
import org.golink.player.core.PictureStyle
import org.golink.player.core.workingSize
import org.webrtc.GlRectDrawer
import org.webrtc.RendererCommon
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/**
 * What the picture renderer draws, set from the UI thread and read on the
 * render thread (one immutable value, swapped at once).
 */
data class PictureParams(
    val picture: Picture = PictureSettings.DEFAULT,
    /** Where the chosen style starts, 0-1 of the width (the left side is the plain picture); null = no split. */
    val split: Double? = null,
    /** The game's display aspect (width / height), 4:3 for arcades. */
    val aspect: Double = 4.0 / 3.0,
    /** Screen pixels per dp: the website's devicePixelRatio. */
    val density: Double = 1.0,
    /** Slower ambient changes (the system's "remove animations"). */
    val reducedMotion: Boolean = false,
    /**
     * The game's own size when the device sends it 2x (stream_stats video):
     * a frame exactly twice this size is averaged back to it before any
     * style; any other frame is drawn as it is.
     */
    val native: PixelSize? = null,
)

/**
 * The game's picture drawn with the website's shaders, as a libwebrtc
 * GlDrawer: EglRenderer hands it every decoded frame (a hardware
 * decoder's OES texture, an RGB texture or the three I420 planes) on its
 * render thread, with the whole view as the viewport.
 *
 * Each frame is first converted to an RGBA texture at the frame's own size
 * (YUV with BT.601 limited range, like the browser's VP8 path), with row 0
 * at the top of the game's picture, as a WebGL upload is. A 2x stream
 * (docs/protocol.md, Video scale) is then averaged back to the game's own
 * size (DOWN_SHADER), and every later pass reads that texture. Then the
 * website's passes run unchanged: the tiny ambient texture (blended over
 * the last one), the smooth edges enlargement when that style is on, and
 * the picture itself with its sides over the whole view (never cropped:
 * PictureLayout.fitRect). If any shader fails to compile, the drawer falls
 * back to libwebrtc's plain drawer, letterboxed, and says so once.
 */
class PictureDrawer(
    private val onUnavailable: () -> Unit = {},
    /** Debug: libwebrtc's plain drawer only (a baseline to measure the shaders' cost). */
    private val plainOnly: Boolean = false,
) : RendererCommon.GlDrawer {
    @Volatile var params = PictureParams()

    private val fallback = GlRectDrawer()
    private var failed = plainOnly
    private var gl: Gl? = null

    /** The GL objects, made on the render thread at the first frame. */
    private class Gl(
        val picture: Program,
        val ambient: Program,
        val edges: Program,
        val down: Program,
        val oes: Program,
        val rgb: Program,
        val yuv: Program,
        val quad: FloatBuffer,
        val src: Target,
        val amb: Target,
        val pre: Target,
        /** A 2x frame averaged back to the game's size. */
        val nat: Target,
    )

    private class Program(val id: Int, names: List<String>) {
        val loc: Map<String, Int> = names.associateWith { GLES20.glGetUniformLocation(id, it) }
        operator fun get(name: String): Int = loc[name] ?: -1
    }

    /** A texture with its framebuffer. */
    private class Target(val tex: Int, val fbo: Int, var w: Int = 0, var h: Int = 0)

    override fun drawOes(oesTextureId: Int, texMatrix: FloatArray, frameWidth: Int, frameHeight: Int, viewportX: Int, viewportY: Int, viewportWidth: Int, viewportHeight: Int) {
        val g = if (plainLook()) null else ready()
        if (g == null) {
            clearSides(viewportX, viewportY, viewportWidth, viewportHeight)
            val r = letterbox(viewportX, viewportY, viewportWidth, viewportHeight)
            fallback.drawOes(oesTextureId, texMatrix, frameWidth, frameHeight, r[0], r[1], r[2], r[3])
            return
        }
        convert(g, g.oes, texMatrix, frameWidth, frameHeight) {
            GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
            GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, oesTextureId)
            GLES20.glUniform1i(g.oes["u_tex0"], 0)
        }
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, 0)
        draw(g, frameWidth, frameHeight, viewportX, viewportY, viewportWidth, viewportHeight)
    }

    override fun drawRgb(textureId: Int, texMatrix: FloatArray, frameWidth: Int, frameHeight: Int, viewportX: Int, viewportY: Int, viewportWidth: Int, viewportHeight: Int) {
        val g = if (plainLook()) null else ready()
        if (g == null) {
            clearSides(viewportX, viewportY, viewportWidth, viewportHeight)
            val r = letterbox(viewportX, viewportY, viewportWidth, viewportHeight)
            fallback.drawRgb(textureId, texMatrix, frameWidth, frameHeight, r[0], r[1], r[2], r[3])
            return
        }
        convert(g, g.rgb, texMatrix, frameWidth, frameHeight) {
            GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, textureId)
            GLES20.glUniform1i(g.rgb["u_tex0"], 0)
        }
        draw(g, frameWidth, frameHeight, viewportX, viewportY, viewportWidth, viewportHeight)
    }

    override fun drawYuv(yuvTextures: IntArray, texMatrix: FloatArray, frameWidth: Int, frameHeight: Int, viewportX: Int, viewportY: Int, viewportWidth: Int, viewportHeight: Int) {
        val g = if (plainLook()) null else ready()
        if (g == null) {
            clearSides(viewportX, viewportY, viewportWidth, viewportHeight)
            val r = letterbox(viewportX, viewportY, viewportWidth, viewportHeight)
            fallback.drawYuv(yuvTextures, texMatrix, frameWidth, frameHeight, r[0], r[1], r[2], r[3])
            return
        }
        convert(g, g.yuv, texMatrix, frameWidth, frameHeight) {
            for (i in 0..2) {
                GLES20.glActiveTexture(GLES20.GL_TEXTURE0 + i)
                GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, yuvTextures[i])
                GLES20.glUniform1i(g.yuv["u_tex$i"], i)
            }
        }
        for (i in 2 downTo 0) {
            GLES20.glActiveTexture(GLES20.GL_TEXTURE0 + i)
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0)
        }
        draw(g, frameWidth, frameHeight, viewportX, viewportY, viewportWidth, viewportHeight)
    }

    override fun release() {
        fallback.release()
        gl?.let { g ->
            listOf(g.picture, g.ambient, g.edges, g.down, g.oes, g.rgb, g.yuv).forEach { GLES20.glDeleteProgram(it.id) }
            listOf(g.src, g.amb, g.pre, g.nat).forEach {
                GLES20.glDeleteTextures(1, intArrayOf(it.tex), 0)
                GLES20.glDeleteFramebuffers(1, intArrayOf(it.fbo), 0)
            }
        }
        gl = null
    }

    /**
     * Smooth on black sides without Compare is exactly the plain bilinear
     * picture (the website then shows its <video> as it is): libwebrtc's
     * own drawer does it, letterboxed, for less GPU work.
     */
    private fun plainLook(): Boolean {
        val p = params
        return p.split == null && p.picture.style == PictureStyle.SMOOTH && p.picture.bands == PictureBands.BLACK
    }

    /** The sides in the video black (#05060a) around the plain picture. */
    private fun clearSides(x: Int, y: Int, w: Int, h: Int) {
        GLES20.glViewport(x, y, w, h)
        GLES20.glClearColor(BLACK[0], BLACK[1], BLACK[2], 1f)
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
    }

    /** The GL objects, or null when this GPU cannot run the shaders (the plain drawer then). */
    private fun ready(): Gl? {
        if (failed) return null
        gl?.let { return it }
        return try {
            setup().also { gl = it }
        } catch (e: RuntimeException) {
            Log.w(TAG, "picture renderer unavailable: ${e.message}")
            failed = true
            onUnavailable()
            null
        }
    }

    /** The plain picture's place in the view when the shaders cannot run: letterboxed, never stretched. */
    private fun letterbox(x: Int, y: Int, w: Int, h: Int): IntArray {
        val r = PictureLayout.fitRect(w.toDouble(), h.toDouble(), params.aspect)
        if (r.w <= 0) return intArrayOf(x, y, w, h)
        val rw = Math.round(r.w).toInt()
        val rh = Math.round(r.h).toInt()
        return intArrayOf(x + (w - rw) / 2, y + (h - rh) / 2, rw, rh)
    }

    private fun setup(): Gl {
        val quad = ByteBuffer.allocateDirect(6 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()
        // One triangle that covers the whole viewport.
        quad.put(floatArrayOf(-1f, -1f, 3f, -1f, -1f, 3f)).position(0)
        val convertNames = listOf("u_tex0", "u_tex1", "u_tex2", "u_texMatrix")
        return Gl(
            picture = Program(build(Shaders.VERTEX_SHADER, Shaders.PICTURE_SHADER), PICTURE_UNIFORMS),
            ambient = Program(build(Shaders.VERTEX_SHADER, Shaders.AMBIENT_SHADER), listOf("u_src", "u_size", "u_mix")),
            edges = Program(build(Shaders.VERTEX_SHADER, Shaders.EDGES_SHADER), listOf("u_src", "u_srcSize", "u_outSize")),
            down = Program(build(Shaders.VERTEX_SHADER, Shaders.DOWN_SHADER), listOf("u_src", "u_srcSize")),
            oes = Program(build(CONVERT_VERTEX, CONVERT_OES), convertNames),
            rgb = Program(build(CONVERT_VERTEX, CONVERT_RGB), convertNames),
            yuv = Program(build(CONVERT_VERTEX, CONVERT_YUV), convertNames),
            quad = quad,
            src = target(),
            amb = target().also { size(it, AMB_W, AMB_H, clear = true) },
            pre = target(),
            nat = target(),
        )
    }

    private fun build(vertex: String, fragment: String): Int {
        fun compile(type: Int, source: String): Int {
            val s = GLES20.glCreateShader(type)
            GLES20.glShaderSource(s, source)
            GLES20.glCompileShader(s)
            val ok = IntArray(1)
            GLES20.glGetShaderiv(s, GLES20.GL_COMPILE_STATUS, ok, 0)
            if (ok[0] == 0) {
                val log = GLES20.glGetShaderInfoLog(s)
                GLES20.glDeleteShader(s)
                throw RuntimeException("shader: $log")
            }
            return s
        }
        val v = compile(GLES20.GL_VERTEX_SHADER, vertex)
        val f = compile(GLES20.GL_FRAGMENT_SHADER, fragment)
        val p = GLES20.glCreateProgram()
        GLES20.glAttachShader(p, v)
        GLES20.glAttachShader(p, f)
        GLES20.glBindAttribLocation(p, 0, "a_pos")
        GLES20.glLinkProgram(p)
        GLES20.glDeleteShader(v)
        GLES20.glDeleteShader(f)
        val ok = IntArray(1)
        GLES20.glGetProgramiv(p, GLES20.GL_LINK_STATUS, ok, 0)
        if (ok[0] == 0) {
            val log = GLES20.glGetProgramInfoLog(p)
            GLES20.glDeleteProgram(p)
            throw RuntimeException("program: $log")
        }
        return p
    }

    private fun target(): Target {
        val t = IntArray(1)
        GLES20.glGenTextures(1, t, 0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, t[0])
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0)
        val f = IntArray(1)
        GLES20.glGenFramebuffers(1, f, 0)
        return Target(t[0], f[0])
    }

    /** (Re)allocates a target's texture and attaches it to its framebuffer. */
    private fun size(t: Target, w: Int, h: Int, clear: Boolean = false) {
        if (t.w == w && t.h == h) return
        t.w = w
        t.h = h
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, t.tex)
        GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA, w, h, 0, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, null)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0)
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, t.fbo)
        GLES20.glFramebufferTexture2D(GLES20.GL_FRAMEBUFFER, GLES20.GL_COLOR_ATTACHMENT0, GLES20.GL_TEXTURE_2D, t.tex, 0)
        val status = GLES20.glCheckFramebufferStatus(GLES20.GL_FRAMEBUFFER)
        if (clear) {
            GLES20.glClearColor(0f, 0f, 0f, 1f)
            GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
        }
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
        if (status != GLES20.GL_FRAMEBUFFER_COMPLETE) throw RuntimeException("framebuffer $status")
    }

    private fun quad(g: Gl) {
        GLES20.glEnableVertexAttribArray(0)
        GLES20.glVertexAttribPointer(0, 2, GLES20.GL_FLOAT, false, 0, g.quad)
    }

    /** The frame, as an RGBA texture at its own size (row 0 = the picture's top row). */
    private inline fun convert(g: Gl, p: Program, texMatrix: FloatArray, w: Int, h: Int, bind: () -> Unit) {
        size(g.src, w, h)
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, g.src.fbo)
        GLES20.glViewport(0, 0, w, h)
        GLES20.glUseProgram(p.id)
        GLES20.glUniformMatrix4fv(p["u_texMatrix"], 1, false, texMatrix, 0)
        bind()
        quad(g)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, 3)
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
    }

    /** The website's passes over the converted frame (renderer.ts draw()). */
    private fun draw(g: Gl, frameW: Int, frameH: Int, vx: Int, vy: Int, vw: Int, vh: Int) {
        val o = params
        val ws = workingSize(frameW, frameH, o.native)
        val w = ws.w
        val h = ws.h
        val style = o.picture.style
        val bands = o.picture.bands
        val scale = o.density
        val ref = PictureLayout.fitRect(vw.toDouble(), vh.toDouble(), o.aspect)
        val inset = if (bands == PictureBands.FRAME) PictureLayout.frameInset(vw.toDouble(), vh.toDouble(), scale) else 0
        val rect = if (inset > 0) PictureLayout.fitRect(vw.toDouble(), vh.toDouble(), o.aspect, inset.toDouble()) else ref
        quad(g)

        // A 2x picture: back to the game's pixels first, and every pass
        // below reads that texture instead of the frame.
        val work = if (ws.down) g.nat else g.src
        if (ws.down) {
            size(g.nat, w, h)
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, g.nat.fbo)
            GLES20.glViewport(0, 0, w, h)
            GLES20.glUseProgram(g.down.id)
            GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, g.src.tex)
            GLES20.glUniform1i(g.down["u_src"], 0)
            GLES20.glUniform2f(g.down["u_srcSize"], frameW.toFloat(), frameH.toFloat())
            GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, 3)
        }

        // The ambient texture, blended over its last state.
        if (bands == PictureBands.AMBIENT) {
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, g.amb.fbo)
            GLES20.glViewport(0, 0, AMB_W, AMB_H)
            GLES20.glUseProgram(g.ambient.id)
            GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, work.tex)
            GLES20.glUniform1i(g.ambient["u_src"], 0)
            GLES20.glUniform2f(g.ambient["u_size"], AMB_W.toFloat(), AMB_H.toFloat())
            GLES20.glUniform1f(g.ambient["u_mix"], if (o.reducedMotion) 0.05f else 0.2f)
            GLES20.glEnable(GLES20.GL_BLEND)
            GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA)
            GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, 3)
            GLES20.glDisable(GLES20.GL_BLEND)
        }

        // Smooth edges: the enlarged texture first (an integer per axis, at
        // least the final scale, so the last step only shrinks or keeps it).
        if (style == PictureStyle.EDGES) {
            val nx = PictureLayout.prescale(rect.w, w)
            val ny = PictureLayout.prescale(rect.h, h)
            size(g.pre, w * nx, h * ny)
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, g.pre.fbo)
            GLES20.glViewport(0, 0, g.pre.w, g.pre.h)
            GLES20.glUseProgram(g.edges.id)
            GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, work.tex)
            GLES20.glUniform1i(g.edges["u_src"], 0)
            GLES20.glUniform2f(g.edges["u_srcSize"], w.toFloat(), h.toFloat())
            GLES20.glUniform2f(g.edges["u_outSize"], g.pre.w.toFloat(), g.pre.h.toFloat())
            GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, 3)
        } else if (g.pre.w == 0) {
            size(g.pre, 1, 1)
        }

        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
        GLES20.glViewport(vx, vy, vw, vh)
        val p = g.picture
        GLES20.glUseProgram(p.id)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, work.tex)
        GLES20.glUniform1i(p["u_src"], 0)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE1)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, g.amb.tex)
        GLES20.glUniform1i(p["u_amb"], 1)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE2)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, g.pre.tex)
        GLES20.glUniform1i(p["u_pre"], 2)
        GLES20.glUniform2f(p["u_preSize"], g.pre.w.toFloat(), g.pre.h.toFloat())
        GLES20.glUniform2f(p["u_srcSize"], w.toFloat(), h.toFloat())
        GLES20.glUniform2f(p["u_ambSize"], AMB_W.toFloat(), AMB_H.toFloat())
        GLES20.glUniform2f(p["u_canvas"], vw.toFloat(), vh.toFloat())
        GLES20.glUniform4f(p["u_rect"], rect.x.toFloat(), rect.y.toFloat(), rect.w.toFloat(), rect.h.toFloat())
        GLES20.glUniform4f(p["u_rectRef"], ref.x.toFloat(), ref.y.toFloat(), ref.w.toFloat(), ref.h.toFloat())
        GLES20.glUniform1f(p["u_style"], style.code.toFloat())
        GLES20.glUniform1f(p["u_bands"], bands.code.toFloat())
        GLES20.glUniform1f(p["u_split"], o.split?.let { (it * vw).toFloat() } ?: -1f)
        GLES20.glUniform1f(p["u_dpr"], scale.toFloat())
        GLES20.glUniform1f(p["u_bezelWidth"], inset.toFloat())
        GLES20.glUniform3fv(p["u_black"], 1, BLACK, 0)
        GLES20.glUniform3fv(p["u_cabinet"], 1, CABINET, 0)
        GLES20.glUniform3fv(p["u_cabinet2"], 1, CABINET_2, 0)
        GLES20.glUniform3fv(p["u_bezel"], 1, BEZEL, 0)
        GLES20.glUniform3fv(p["u_bezelHi"], 1, BEZEL_HI, 0)
        GLES20.glUniform3fv(p["u_trim"], 1, TRIM, 0)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, 3)
        for (i in 2 downTo 0) {
            GLES20.glActiveTexture(GLES20.GL_TEXTURE0 + i)
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0)
        }
        GLES20.glUseProgram(0)
    }

    companion object {
        private const val TAG = "go-link"

        /** The ambient texture: tiny on purpose (the blur is free). */
        private const val AMB_W = 32
        private const val AMB_H = 24

        private val PICTURE_UNIFORMS = listOf(
            "u_src", "u_amb", "u_pre", "u_preSize", "u_srcSize", "u_ambSize", "u_canvas", "u_rect", "u_rectRef", "u_style", "u_bands",
            "u_split", "u_dpr", "u_black", "u_cabinet", "u_cabinet2", "u_bezel", "u_bezelHi", "u_trim", "u_bezelWidth",
        )

        private fun rgb(hex: Int) = floatArrayOf(((hex shr 16) and 255) / 255f, ((hex shr 8) and 255) / 255f, (hex and 255) / 255f)

        // The website's tokens (tokens.css; the video stage always uses the dark ones).
        private val BLACK = rgb(0x05060A) // --color-video
        private val CABINET = rgb(0x0B0D13) // --picture-cabinet
        private val CABINET_2 = rgb(0x1A1F2C) // --picture-cabinet-2
        private val BEZEL = rgb(0x07080C) // --picture-bezel
        private val BEZEL_HI = rgb(0x3B4254) // --picture-bezel-hi
        private val TRIM = rgb(0xF2A33A) // --color-accent

        /**
         * libwebrtc's texture matrix maps the viewport's (0,0) bottom left to
         * the frame the right way up on screen. Drawing into our texture,
         * row 0 must be the picture's top row (the website's upload), so the
         * y coordinate is turned over before the matrix.
         */
        private const val CONVERT_VERTEX = """
attribute vec2 a_pos;
uniform mat4 u_texMatrix;
varying vec2 v_tc;
void main() {
  vec2 q = a_pos * 0.5 + 0.5;
  v_tc = (u_texMatrix * vec4(q.x, 1.0 - q.y, 0.0, 1.0)).xy;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
"""

        private const val CONVERT_OES = """
#extension GL_OES_EGL_image_external : require
precision mediump float;
uniform samplerExternalOES u_tex0;
varying vec2 v_tc;
void main() {
  gl_FragColor = vec4(texture2D(u_tex0, v_tc).rgb, 1.0);
}
"""

        private const val CONVERT_RGB = """
precision mediump float;
uniform sampler2D u_tex0;
varying vec2 v_tc;
void main() {
  gl_FragColor = vec4(texture2D(u_tex0, v_tc).rgb, 1.0);
}
"""

        /** BT.601, limited range (16-235 luma, 16-240 chroma), like the browser's VP8 picture. */
        private const val CONVERT_YUV = """
precision mediump float;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform sampler2D u_tex2;
varying vec2 v_tc;
void main() {
  float y = 1.164383 * (texture2D(u_tex0, v_tc).r - 0.062745);
  float u = texture2D(u_tex1, v_tc).r - 0.501961;
  float v = texture2D(u_tex2, v_tc).r - 0.501961;
  gl_FragColor = vec4(clamp(vec3(y + 1.596027 * v, y - 0.391762 * u - 0.812968 * v, y + 2.017232 * u), 0.0, 1.0), 1.0);
}
"""
    }
}
