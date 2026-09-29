// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.ui

import android.graphics.SurfaceTexture
import android.view.TextureView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import org.webrtc.EglBase
import org.webrtc.EglRenderer
import org.webrtc.GlRectDrawer
import org.webrtc.VideoTrack

/**
 * The game picture. An EglRenderer draws into a TextureView and stretches
 * the frame to the view, so the caller sizes the view to the game's
 * display aspect (the device sends it in stream_stats): arcade games often
 * have non-square pixels, and the web shows them the same way.
 */
@Composable
fun VideoView(track: VideoTrack?, eglContext: EglBase.Context, modifier: Modifier = Modifier) {
    val renderer = remember { EglRenderer("go-link-video").apply { init(eglContext, EglBase.CONFIG_PLAIN, GlRectDrawer()) } }
    DisposableEffect(renderer) {
        onDispose { renderer.release() }
    }
    DisposableEffect(track) {
        if (track != null) runCatching { track.addSink(renderer) }
        onDispose {
            // The track may already be disposed with its connection.
            if (track != null) runCatching { track.removeSink(renderer) }
            renderer.clearImage()
        }
    }
    AndroidView(
        factory = { ctx ->
            TextureView(ctx).apply {
                isOpaque = false
                surfaceTextureListener = object : TextureView.SurfaceTextureListener {
                    override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) {
                        renderer.createEglSurface(surface)
                    }

                    override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) = Unit

                    override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
                        val done = java.util.concurrent.CountDownLatch(1)
                        renderer.releaseEglSurface { done.countDown() }
                        done.await(1, java.util.concurrent.TimeUnit.SECONDS)
                        return true
                    }

                    override fun onSurfaceTextureUpdated(surface: SurfaceTexture) = Unit
                }
            }
        },
        modifier = modifier,
    )
}
