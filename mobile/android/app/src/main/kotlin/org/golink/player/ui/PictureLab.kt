// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.ui

import android.content.res.Configuration
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Gamepad
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.delay
import org.golink.player.Prefs
import org.golink.player.R
import org.golink.player.core.Button
import org.golink.player.core.GameControls
import org.golink.player.core.Picture
import org.golink.player.core.PictureBands
import org.golink.player.core.PictureSettings
import org.golink.player.core.PictureStyle
import org.golink.player.core.PixelSize
import org.golink.player.picture.PictureParams
import org.golink.player.picture.TestCardFrames
import org.golink.player.rtc.WebRtcEngine

/**
 * Debug builds only (`--es lab picture`): the room's layout with the
 * picture renderer fed by a synthetic 384 x 224 test card at 60 fps
 * instead of a game, the real dock gear and Game settings sheet, so every
 * picture style, the sides and Compare can be looked at (and screenshotted)
 * on an emulator without a room. Optional extras set the starting state:
 * `--es style crt --es bands frame --ez compare true --ez sheet true`;
 * `--ez plain true` draws with libwebrtc's plain drawer instead (a baseline);
 * `--ez up2 true` sends the card enlarged 2x with nearest neighbour and
 * draws it as a 2x stream, like the High and Normal video qualities (add
 * `--ez raw true` to draw it raw).
 * The measured rate of the frames sent shows at the top left ("lab-fps").
 */
@Composable
fun PictureLab(
    prefs: Prefs,
    style: String?,
    bands: String?,
    startCompare: Boolean,
    startSheet: Boolean,
    plain: Boolean = false,
    room: String? = null,
    up2: Boolean = false,
    raw: Boolean = false,
) {
    // --es room crt:frame: a room default, as a host would set it.
    val roomDefault = room?.split(":")?.let { PictureSettings.parseRoom(it.getOrNull(0), it.getOrNull(1)) }
    val context = LocalContext.current
    val egl = remember { WebRtcEngine.get(context).eglBase.eglBaseContext }
    var picture by remember {
        val saved = PictureSettings.read(prefs)
        mutableStateOf(Picture(PictureStyle.of(style) ?: saved.style, PictureBands.of(bands) ?: saved.bands))
    }
    var compare by remember { mutableStateOf(startCompare) }
    var split by remember { mutableDoubleStateOf(0.5) }
    var sheet by remember { mutableStateOf(startSheet) }
    var ok by remember { mutableStateOf(true) }
    var statsOn by remember { mutableStateOf(prefs.statsOverlay) }
    var game by remember { mutableDoubleStateOf(prefs.gameVolume) }
    var voices by remember { mutableDoubleStateOf(prefs.voiceVolume) }
    var source by remember { mutableStateOf<TestCardFrames?>(null) }
    var fps by remember { mutableLongStateOf(0L) }
    LaunchedEffect(source) {
        val s = source ?: return@LaunchedEffect
        var last = s.sent
        while (true) {
            delay(1_000)
            fps = s.sent - last
            last = s.sent
        }
    }
    val landscape = LocalConfiguration.current.orientation == Configuration.ORIENTATION_LANDSCAPE
    val density = LocalDensity.current.density.toDouble()
    val pad = rememberTouchPad { }
    val screen: @Composable (Modifier) -> Unit = { m ->
        Box(m.background(Tokens.video)) {
            PictureView(
                eglContext = egl,
                params = PictureParams(
                    picture,
                    if (compare && ok) split else null,
                    TestCardFrames.ASPECT,
                    density,
                    native = if (up2 && !raw) PixelSize(TestCardFrames.W, TestCardFrames.H) else null,
                ),
                modifier = Modifier.fillMaxSize().testTag("video"),
                onUnavailable = { ok = false },
                key = Unit,
                plain = plain,
                connect = { sink ->
                    val frames = TestCardFrames(sink, if (up2) 2 else 1)
                    source = frames
                    val stop: () -> Unit = { frames.stop() }
                    stop
                },
            )
            if (compare && ok) CompareDivider(split, { split = it }, styleName(picture.style))
            Text(
                "$fps fps" + if (up2) (if (raw) " · 2× raw" else " · 2×") else "",
                color = Tokens.voice,
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                modifier = Modifier.align(Alignment.BottomStart).padding(8.dp).testTag("lab-fps"),
            )
        }
    }
    val dockItems: List<@Composable () -> Unit> = listOf(
        { DockButton(Icons.Filled.MicOff, stringResource(R.string.room_mic_off), on = false, tag = "dock-mic") {} },
        { DockButton(Icons.AutoMirrored.Filled.VolumeUp, stringResource(R.string.room_sound_on), on = true, tag = "dock-sound") {} },
        { DockButton(Icons.AutoMirrored.Filled.Chat, stringResource(R.string.room_chat), on = false, tag = "dock-chat") {} },
        { DockButton(Icons.Filled.People, stringResource(R.string.room_players), on = false, tag = "dock-players") {} },
        { DockButton(Icons.Filled.Gamepad, stringResource(R.string.room_touchpad), on = true, tag = "dock-pad") {} },
        { DockButton(Icons.Filled.Settings, stringResource(R.string.room_settings), on = sheet, tag = "dock-settings") { sheet = true } },
    )
    val controls = GameControls(players = 2, buttons = 6, control = "joy8way")
    Box(Modifier.fillMaxSize().background(Tokens.bg)) {
        if (landscape) {
            Row(Modifier.fillMaxSize().safeDrawingPadding()) {
                PadSurface(pad, Modifier.fillMaxHeight().weight(0.26f)) {
                    Column(Modifier.fillMaxSize().padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.SpaceEvenly) {
                        DPad(pad, 150.dp)
                        PillButton(pad, Button.COIN, stringResource(R.string.room_coin), tag = "pad-coin")
                    }
                }
                screen(Modifier.fillMaxHeight().weight(0.48f))
                PadSurface(pad, Modifier.fillMaxHeight().weight(0.26f)) {
                    Row(Modifier.fillMaxSize()) {
                        Column(
                            Modifier.fillMaxHeight().weight(1f).padding(8.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.SpaceEvenly,
                        ) {
                            StartRow(pad, 2, listOf(1), withCoin = false)
                            ActionButtons(pad, controls, 64.dp)
                        }
                        Column(
                            Modifier.fillMaxHeight().padding(2.dp),
                            verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterVertically),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) { dockItems.forEach { it() } }
                    }
                }
            }
        } else {
            Column(Modifier.fillMaxSize().safeDrawingPadding()) {
                screen(Modifier.fillMaxWidth().aspectRatio((TestCardFrames.ASPECT).toFloat()))
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 2.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterHorizontally),
                    verticalAlignment = Alignment.CenterVertically,
                ) { dockItems.forEach { it() } }
                PadSurface(pad, Modifier.fillMaxWidth().weight(1f)) {
                    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.SpaceEvenly) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            DPad(pad, 160.dp)
                            Box(Modifier.widthIn(max = 200.dp)) { ActionButtons(pad, controls, 64.dp) }
                        }
                        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { StartRow(pad, 2, listOf(1)) }
                    }
                }
            }
        }
    }
    if (sheet) {
        GameSettingsSheet(
            landscape = landscape,
            onClose = { sheet = false },
            picture = PictureChoice(
                picture = picture,
                onPicture = {
                    picture = it
                    prefs.choosePicture(it)
                },
                available = ok,
                compare = compare,
                onCompare = { compare = it },
                roomDefault = roomDefault,
                chosen = true,
                onUseRoomDefault = {
                    prefs.clearPicture()
                    roomDefault?.let { picture = it }
                },
            ),
            statsOn = statsOn,
            onStats = {
                statsOn = it
                prefs.statsOverlay = it
            },
            name = { NameSection(prefs.playerName) { prefs.playerName = it } },
            // No room here: only the volumes of the sound part.
            sound = {
                Column {
                    VolumeRow(stringResource(R.string.sound_game_volume), game, { game = it; prefs.gameVolume = it }, "sound-game")
                    VolumeRow(stringResource(R.string.sound_voices_volume), voices, { voices = it; prefs.voiceVolume = it }, "sound-voices")
                }
            },
        )
    }
}

/**
 * Debug builds only (`--es lab check2x`): Picture2xCheck's result
 * ("picture-2x-check") and its three CRT pictures: native, 2x averaged,
 * 2x raw.
 */
@Composable
fun Picture2xCheckScreen() {
    var result by remember { mutableStateOf<org.golink.player.picture.Picture2xCheck.Result?>(null) }
    LaunchedEffect(Unit) {
        val done = kotlinx.coroutines.CompletableDeferred<org.golink.player.picture.Picture2xCheck.Result>()
        // Its own thread: the EGL context stays current on the thread that made it.
        Thread({ done.complete(org.golink.player.picture.Picture2xCheck.run()) }, "go-link-check2x").start()
        result = done.await()
    }
    Column(
        Modifier.fillMaxSize().background(Tokens.bg).safeDrawingPadding().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        val r = result
        Text(
            r?.summary ?: "running…",
            color = if (r == null) Tokens.muted else if (r.ok) Tokens.voice else Tokens.dangerText,
            fontFamily = FontFamily.Monospace,
            fontSize = 13.sp,
            modifier = Modifier.testTag("picture-2x-check"),
        )
        r?.images?.zip(listOf("native 384×224", "2× averaged", "2× raw"))?.forEach { (img, label) ->
            Text(label, color = Tokens.muted, fontSize = 12.sp)
            androidx.compose.foundation.Image(
                img.asImageBitmap(),
                contentDescription = label,
                modifier = Modifier.fillMaxWidth().aspectRatio(img.width.toFloat() / img.height),
                filterQuality = androidx.compose.ui.graphics.FilterQuality.None,
            )
        }
    }
}
