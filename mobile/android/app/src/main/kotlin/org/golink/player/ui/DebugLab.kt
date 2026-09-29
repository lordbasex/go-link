// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.unit.dp
import org.golink.player.core.Button
import org.golink.player.core.GameControls
import org.golink.player.core.LiveStatsView
import org.golink.player.core.NetPath

/**
 * Debug builds only (`--es lab overlay`): the room's new overlays with
 * sample values and no room, to look at them on an emulator: the stats
 * box, the see-through pad lit by a "controller", its chip and the
 * pending pause banner, over the test card as the picture.
 */
@Composable
fun OverlayLab() {
    val pad = rememberTouchPad { }
    pad.extra = Button.RIGHT or Button.B1 or Button.B5
    val stats = LiveStatsView(fps = 60, width = 640, height = 480, codec = "VP8", rttMs = 28, path = NetPath.DIRECT, lossPercent = 0.0, audioCodec = "Opus", audioKhz = 48)
    Column(Modifier.fillMaxSize().background(Tokens.bg).safeDrawingPadding()) {
        Box(Modifier.fillMaxWidth().aspectRatio(4f / 3f)) {
            TestCard(Modifier.fillMaxSize())
            StatsCorner(on = true, stats = stats, onToggle = {}, modifier = Modifier.align(Alignment.TopStart).padding(8.dp))
            Box(Modifier.align(Alignment.BottomEnd).padding(8.dp)) { ControllerChip("DualSense Wireless Controller") }
            PauseAskedBanner(onCancel = {}, modifier = Modifier.align(Alignment.TopCenter).padding(top = 120.dp, start = 8.dp, end = 8.dp))
        }
        PadSurface(pad, Modifier.fillMaxWidth().weight(1f).alpha(0.55f), enabled = false) {
            Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.SpaceEvenly) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    DPad(pad, 160.dp)
                    Box(Modifier.widthIn(max = 200.dp)) { ActionButtons(pad, GameControls.DEFAULT, 64.dp) }
                }
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { StartRow(pad, 2, listOf(1)) }
            }
        }
    }
}
