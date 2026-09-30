// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import org.golink.player.core.RefreshRateMeter
import org.golink.player.core.ScreenRate

/**
 * While the calling screen is shown (the room and the controller test),
 * asks for the display mode with the current resolution and the highest
 * refresh rate (90, 120 or 144 Hz where the phone has one) and puts the
 * window's previous choice back when it leaves, so menus stay at the
 * system's rate and save battery. The game picture is a SurfaceView in
 * this window, so the window's mode covers it too.
 *
 * Returns the refresh rate the screen really draws at, measured from the
 * Choreographer's frame times (null for the first second). Battery saver
 * or the phone's own "smooth display" setting may keep it lower, and the
 * reading then says so.
 */
@Composable
fun rememberHighRefreshRate(): State<Int?> {
    val context = LocalContext.current
    val view = LocalView.current
    val hz = remember { mutableStateOf<Int?>(null) }
    DisposableEffect(Unit) {
        val window = context.findActivity()?.window
        val display = view.display
        val saved = window?.attributes?.preferredDisplayModeId ?: 0
        if (window != null && display != null) {
            runCatching {
                val cur = display.mode
                val best = ScreenRate.fastest(
                    display.supportedModes.map { ScreenRate.Mode(it.modeId, it.physicalWidth, it.physicalHeight, it.refreshRate) },
                    ScreenRate.Mode(cur.modeId, cur.physicalWidth, cur.physicalHeight, cur.refreshRate),
                )
                if (best.id != saved) window.attributes = window.attributes.apply { preferredDisplayModeId = best.id }
            }
        }
        onDispose {
            if (window != null && window.attributes.preferredDisplayModeId != saved) {
                window.attributes = window.attributes.apply { preferredDisplayModeId = saved }
            }
        }
    }
    LaunchedEffect(Unit) {
        val meter = RefreshRateMeter()
        while (true) {
            withFrameNanos { nanos -> meter.frame(nanos / 1e9)?.let { if (it != hz.value) hz.value = it } }
        }
    }
    return hz
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
