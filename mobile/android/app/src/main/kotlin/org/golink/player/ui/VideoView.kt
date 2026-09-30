// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.ui

import android.os.Handler
import android.os.Looper
import android.view.SurfaceHolder
import android.view.SurfaceView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import org.golink.player.picture.PictureDrawer
import org.golink.player.picture.PictureParams
import org.webrtc.EglBase
import org.webrtc.EglRenderer
import org.webrtc.VideoFrame
import org.webrtc.VideoSink
import org.webrtc.VideoTrack

/**
 * The game picture, drawn by the picture renderer (PictureDrawer: the
 * website's shaders) into a SurfaceView that covers the whole screen area:
 * the shader letterboxes the game at its display aspect (the device sends
 * it in stream_stats; arcade pixels are often not square) and fills the
 * sides (black, ambient or a cabinet frame). A setting change redraws the
 * last frame at once.
 */
@Composable
fun VideoView(
    track: VideoTrack?,
    eglContext: EglBase.Context,
    params: PictureParams,
    modifier: Modifier = Modifier,
    onUnavailable: () -> Unit = {},
) {
    PictureView(
        eglContext = eglContext,
        params = params,
        modifier = modifier,
        onUnavailable = onUnavailable,
        key = track,
        connect = { sink ->
            if (track != null) runCatching { track.addSink(sink) }
            val disconnect: () -> Unit = {
                // The track may already be disposed with its connection.
                if (track != null) runCatching { track.removeSink(sink) }
            }
            disconnect
        },
    )
}

/** The renderer over any frame source: a WebRTC track, or the debug lab's test card. */
@Composable
fun PictureView(
    eglContext: EglBase.Context,
    params: PictureParams,
    modifier: Modifier = Modifier,
    onUnavailable: () -> Unit = {},
    key: Any? = null,
    /** Debug: the plain drawer only, as a baseline. */
    plain: Boolean = false,
    connect: (VideoSink) -> () -> Unit,
) {
    val unavailable = rememberUpdatedState(onUnavailable)
    val drawer = remember {
        val main = Handler(Looper.getMainLooper())
        PictureDrawer(onUnavailable = { main.post { unavailable.value() } }, plainOnly = plain)
    }
    val renderer = remember { EglRenderer("go-link-video").apply { init(eglContext, EglBase.CONFIG_PLAIN, drawer) } }
    val sink = remember { LastFrameSink(renderer) }
    SideEffect {
        if (drawer.params != params) {
            drawer.params = params
            sink.redraw()
        }
    }
    DisposableEffect(renderer) {
        onDispose {
            sink.close()
            renderer.release()
        }
    }
    DisposableEffect(key) {
        val disconnect = connect(sink)
        onDispose {
            disconnect()
            sink.clear()
            renderer.clearImage()
        }
    }
    AndroidView(
        factory = { ctx ->
            // A SurfaceView goes straight to the screen's compositor: no extra
            // copy through the app's own drawing, so less GPU work and delay
            // than a TextureView. Compose draws the overlays above it.
            SurfaceView(ctx).apply {
                holder.addCallback(object : SurfaceHolder.Callback {
                    override fun surfaceCreated(holder: SurfaceHolder) {
                        renderer.createEglSurface(holder.surface)
                        sink.redraw()
                    }

                    // EglRenderer reads the new size at its next frame.
                    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) = sink.redraw()

                    override fun surfaceDestroyed(holder: SurfaceHolder) {
                        val done = java.util.concurrent.CountDownLatch(1)
                        renderer.releaseEglSurface { done.countDown() }
                        done.await(1, java.util.concurrent.TimeUnit.SECONDS)
                    }
                })
            }
        },
        modifier = modifier,
    )
}

/**
 * Passes the frames on and keeps the last one, so a new setting (or a new
 * size) shows at once even on a still picture. A hardware decoder's
 * texture frame is never kept: holding it would stall the decoder, and the
 * next frame comes within a frame's time anyway.
 */
private class LastFrameSink(private val renderer: EglRenderer) : VideoSink {
    private var last: VideoFrame? = null

    /**
     * Redraws go through their own thread: EglRenderer.onFrame can wait
     * while the render thread swaps buffers, and the main thread must never.
     */
    private val worker = java.util.concurrent.Executors.newSingleThreadExecutor { Thread(it, "go-link-redraw") }

    override fun onFrame(frame: VideoFrame) {
        synchronized(this) {
            last?.release()
            last = if (frame.buffer is VideoFrame.TextureBuffer) null else frame.also { it.retain() }
        }
        renderer.onFrame(frame)
    }

    fun redraw() {
        val frame = synchronized(this) { last?.also { it.retain() } } ?: return
        runCatching {
            worker.execute {
                renderer.onFrame(frame)
                frame.release()
            }
        }.onFailure { frame.release() }
    }

    fun clear() {
        synchronized(this) {
            last?.release()
            last = null
        }
    }

    /** No more redraws (the view is gone). */
    fun close() {
        clear()
        worker.shutdown()
    }
}
