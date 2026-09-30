// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.ui

import androidx.compose.foundation.background
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Gamepad
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
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
    val screenHz by rememberHighRefreshRate()
    val stats = LiveStatsView(fps = 60, width = 768, height = 448, codec = "VP8", rttMs = 28, path = NetPath.DIRECT, lossPercent = 0.0, audioCodec = "Opus", audioKhz = 48)
    Column(Modifier.fillMaxSize().background(Tokens.bg).safeDrawingPadding()) {
        Box(Modifier.fillMaxWidth().aspectRatio(4f / 3f)) {
            TestCard(Modifier.fillMaxSize())
            StatsCorner(
                on = true,
                stats = stats,
                screenHz = screenHz,
                onToggle = {},
                modifier = Modifier.align(Alignment.TopStart).padding(8.dp),
                video = org.golink.player.core.StreamVideo(2, 384, 224, org.golink.player.core.VideoQuality.HIGH),
            )
            Box(Modifier.align(Alignment.BottomEnd).padding(8.dp)) { ControllerChip("DualSense Wireless Controller") }
            PauseAskedBanner(onCancel = {}, modifier = Modifier.align(Alignment.TopCenter).padding(top = 156.dp, start = 8.dp, end = 8.dp))
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

/**
 * Debug builds only (`--es lab skin --es skin violet --ei buttons 6 --ei
 * starts 2`): a gamepad skin around the test card, with no room, for
 * screenshots and the e2e skin test. "pad-log" lists every held-buttons
 * value sent, in order ("16 0" is button 1 pressed and let go);
 * "pad-clear" empties it; "pad-layout" says the orientation.
 */
@Composable
fun SkinLab(prefs: org.golink.player.Prefs, skinId: String?, buttons: Int, starts: Int, lit: Int = 0) {
    val log = androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateListOf<Int>() }
    val pad = rememberTouchPad { log.add(it) }
    // --ei lit <bits>: buttons shown held, with no finger (screenshots of the pressed look).
    pad.extra = lit
    val skins = rememberSkinStore(prefs)
    // The lab starts on the skin asked for; Game settings (the menu's gear) can change it like in a room.
    androidx.compose.runtime.LaunchedEffect(skinId) { if (skinId != null) skins.show(skinId) }
    val skin = skins.selected ?: skins.catalog.skins.first()
    var settings by androidx.compose.runtime.saveable.rememberSaveable { androidx.compose.runtime.mutableStateOf(false) }
    val landscape = androidx.compose.ui.platform.LocalConfiguration.current.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE
    androidx.compose.runtime.DisposableEffect(landscape) { onDispose { pad.releaseAll() } }
    Box(Modifier.fillMaxSize().background(Tokens.bg)) {
        SkinConsole(
            skin = skin,
            picture = skins.background(skin, landscape),
            landscape = landscape,
            pad = pad,
            controls = GameControls(players = 2, buttons = buttons, control = "joy8way"),
            starts = starts,
            myPorts = listOf(1),
            aspect = 4.0 / 3.0,
            displayOnly = false,
            keepDock = settings,
            header = { compact ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    androidx.compose.material3.Icon(Icons.Filled.Close, null, tint = Tokens.text2, modifier = Modifier.padding(12.dp))
                    if (!compact) {
                        Column {
                            androidx.compose.material3.Text("Test pattern", color = Tokens.text, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)
                            androidx.compose.material3.Text("P1", color = Tokens.text2, fontSize = androidx.compose.ui.unit.TextUnit(12f, androidx.compose.ui.unit.TextUnitType.Sp))
                        }
                    }
                }
            },
            screen = { m ->
                Box(m.background(Tokens.video)) {
                    TestCard(Modifier.fillMaxSize())
                    Row(Modifier.align(Alignment.BottomStart).padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
                        androidx.compose.material3.Text(
                            if (landscape) "landscape" else "portrait",
                            color = Color.White.copy(alpha = 0.05f),
                            fontSize = androidx.compose.ui.unit.TextUnit(6f, androidx.compose.ui.unit.TextUnitType.Sp),
                            modifier = Modifier.testTag("pad-layout"),
                        )
                        androidx.compose.material3.Text(
                            log.joinToString(" "),
                            color = Color.White,
                            fontSize = androidx.compose.ui.unit.TextUnit(12f, androidx.compose.ui.unit.TextUnitType.Sp),
                            modifier = Modifier.padding(horizontal = 6.dp).testTag("pad-log"),
                        )
                        Box(Modifier.size(32.dp).testTag("pad-clear").clickable { log.clear() })
                    }
                }
            },
            dock = { _ ->
                DockButton(Icons.Filled.MicOff, "mic", on = false, tag = "lab-mic") {}
                DockButton(Icons.AutoMirrored.Filled.VolumeUp, "sound", on = true, tag = "lab-sound") {}
                DockButton(Icons.Filled.Pause, "pause", on = false, tag = "lab-pause") {}
                DockButton(Icons.AutoMirrored.Filled.Chat, "chat", on = false, tag = "lab-chat") {}
                DockButton(Icons.Filled.People, "players", on = false, tag = "lab-players") {}
                DockButton(Icons.Filled.Gamepad, "pad", on = true, tag = "lab-pad") {}
                DockButton(Icons.Filled.Settings, "settings", on = settings, tag = "lab-settings") { settings = true }
            },
        )
    }
    if (settings) {
        GameSettingsSheet(
            landscape = landscape,
            onClose = { settings = false },
            picture = PictureChoice(picture = prefs.savedPicture.let { org.golink.player.core.PictureSettings.resolve(it, null) }, onPicture = {}, available = true, compare = false, onCompare = {}),
            statsOn = false,
            onStats = {},
            name = null,
            sound = null,
            skins = skins,
        )
    }
}

/**
 * Debug builds only (`--es lab cinema`): landscape without the on-screen
 * pad, the test card with the room's buttons in the floating capsule
 * (the same capsule the room uses), for screenshots.
 */
@Composable
fun CinemaLab() {
    var wake by androidx.compose.runtime.remember { androidx.compose.runtime.mutableIntStateOf(0) }
    androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxSize().background(Tokens.bg).safeDrawingPadding()) {
        Box(Modifier.fillMaxSize().clickable { wake++ }, contentAlignment = Alignment.Center) {
            TestCard(Modifier.fillMaxHeight().aspectRatio(4f / 3f))
        }
        FloatingCapsule(keep = false, wake = wake, maxHeight = maxHeight - 16.dp, modifier = Modifier.align(Alignment.CenterEnd).padding(end = 8.dp)) {
            androidx.compose.material3.Icon(Icons.Filled.Close, "leave", tint = Tokens.text2, modifier = Modifier.padding(12.dp))
            Box(Modifier.width(28.dp).height(1.dp).background(Color.White.copy(alpha = 0.14f)))
            DockButton(Icons.Filled.MicOff, "mic", on = false, tag = "lab-mic") {}
            DockButton(Icons.AutoMirrored.Filled.VolumeUp, "sound", on = true, tag = "lab-sound") {}
            DockButton(Icons.Filled.Pause, "pause", on = false, tag = "lab-pause") {}
            DockButton(Icons.AutoMirrored.Filled.Chat, "chat", on = false, tag = "lab-chat") {}
            DockButton(Icons.Filled.People, "players", on = false, tag = "lab-players") {}
            DockButton(Icons.Filled.Gamepad, "pad", on = false, tag = "lab-pad") {}
            DockButton(Icons.Filled.Settings, "settings", on = false, tag = "lab-settings") {}
        }
        Box(Modifier.align(Alignment.TopEnd).padding(8.dp)) { ControllerChip("Pro Controller") }
    }
}
