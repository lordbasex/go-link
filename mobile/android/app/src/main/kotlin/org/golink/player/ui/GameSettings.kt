// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.golink.player.R
import org.golink.player.core.Picture
import org.golink.player.core.PictureBands
import org.golink.player.core.PictureLayout
import org.golink.player.core.PictureStyle
import org.golink.player.core.PlayerName
import kotlin.math.roundToInt

/** The picture part of the Game settings: the viewer's own choices, applied at once. */
data class PictureChoice(
    val picture: Picture,
    val onPicture: (Picture) -> Unit,
    /** False when this GPU cannot run the picture shaders (the plain picture stays). */
    val available: Boolean,
    val compare: Boolean,
    val onCompare: (Boolean) -> Unit,
    /** The host's default for this room, if any (room_state.picture). */
    val roomDefault: Picture? = null,
    /** The viewer picked a picture of their own (it wins over the room's default). */
    val chosen: Boolean = false,
    /** Forgets the viewer's choice so the room's default applies. */
    val onUseRoomDefault: () -> Unit = {},
)

/**
 * "Game settings", opened from the gear in the room's dock without leaving
 * the room: your name, the sound (volumes, microphone, output), the
 * picture (style, sides and Compare) and the stats overlay. A bottom sheet
 * upright (it leaves the picture above it visible, so a new style shows
 * while choosing), a side sheet from the right held sideways.
 */
@Composable
fun GameSettingsSheet(
    landscape: Boolean,
    onClose: () -> Unit,
    picture: PictureChoice,
    statsOn: Boolean,
    onStats: (Boolean) -> Unit,
    name: (@Composable () -> Unit)?,
    sound: (@Composable () -> Unit)?,
    /** Opened from the players' Sound button: start at the sound part. */
    scrollToSound: Boolean = false,
) {
    val body: @Composable (Modifier) -> Unit = { m ->
        GameSettingsBody(m, onClose, picture, statsOn, onStats, name, sound, scrollToSound)
    }
    if (landscape) SideSheet(onClose, body) else BottomSheet(onClose, body)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BottomSheet(onClose: () -> Unit, body: @Composable (Modifier) -> Unit) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val maxHeight = LocalConfiguration.current.screenHeightDp.dp * 0.62f
    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = state,
        containerColor = Tokens.surface,
        scrimColor = Color.Black.copy(alpha = 0.2f),
        dragHandle = { BottomSheetDefaults.DragHandle(color = Tokens.borderStrong) },
    ) {
        // The sheet is its own window: its test tags need their own flag.
        @OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
        body(Modifier.fillMaxWidth().heightIn(max = maxHeight).navigationBarsPadding().semantics { testTagsAsResourceId = true })
    }
}

@Composable
private fun SideSheet(onClose: () -> Unit, body: @Composable (Modifier) -> Unit) {
    BackHandler(onBack = onClose)
    BoxWithConstraints(Modifier.fillMaxSize()) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.25f))
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClose),
        )
        Surface(
            Modifier.align(Alignment.CenterEnd).fillMaxHeight().width(minOf(400.dp, maxWidth * 0.45f)),
            color = Tokens.surface,
            border = BorderStroke(1.dp, Tokens.borderStrong),
            shape = RoundedCornerShape(topStart = 20.dp, bottomStart = 20.dp),
        ) {
            body(Modifier.fillMaxSize().safeDrawingPadding())
        }
    }
}

@Composable
private fun GameSettingsBody(
    modifier: Modifier,
    onClose: () -> Unit,
    picture: PictureChoice,
    statsOn: Boolean,
    onStats: (Boolean) -> Unit,
    name: (@Composable () -> Unit)?,
    sound: (@Composable () -> Unit)?,
    scrollToSound: Boolean,
) {
    val scroll = rememberScrollState()
    var soundTop by remember { mutableIntStateOf(-1) }
    LaunchedEffect(soundTop) { if (scrollToSound && soundTop > 0) scroll.scrollTo(soundTop) }
    Column(modifier.testTag("game-settings")) {
        Row(Modifier.fillMaxWidth().padding(start = 22.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                stringResource(R.string.game_settings_title),
                color = Tokens.text,
                fontWeight = FontWeight.SemiBold,
                fontSize = 18.sp,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = onClose, modifier = Modifier.size(48.dp).testTag("game-settings-close")) {
                Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.game_settings_close), tint = Tokens.text2)
            }
        }
        Column(
            Modifier.fillMaxWidth().verticalScroll(scroll).padding(horizontal = 22.dp).padding(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            if (name != null) {
                SectionLabel(stringResource(R.string.game_settings_name))
                name()
            }
            if (sound != null) {
                Box(Modifier.onGloballyPositioned { soundTop = it.positionInParent().y.roundToInt() }) {
                    SectionLabel(stringResource(R.string.game_settings_sound))
                }
                sound()
            }
            PictureSection(picture)
            SectionLabel(stringResource(R.string.stats_title_short))
            SwitchRow(
                stringResource(R.string.game_settings_stats),
                stringResource(R.string.game_settings_stats_hint),
                statsOn,
                onStats,
                "settings-stats",
            )
        }
    }
}

@Composable
private fun PictureSection(c: PictureChoice) {
    SectionLabel(stringResource(R.string.picture_title))
    Text(stringResource(if (c.available) R.string.picture_note else R.string.picture_unavailable), color = Tokens.faint, fontSize = 13.sp, lineHeight = 18.sp)
    if (!c.available) return
    val room = c.roomDefault
    if (room != null) {
        Text(
            stringResource(R.string.picture_room_default, styleName(room.style), bandsName(room.bands)),
            color = Tokens.muted,
            fontSize = 13.sp,
            modifier = Modifier.padding(top = 6.dp).testTag("picture-room-default"),
        )
        if (c.chosen && c.picture != room) {
            SecondaryButton(
                stringResource(R.string.picture_use_room_default),
                c.onUseRoomDefault,
                Modifier.fillMaxWidth().padding(top = 6.dp).testTag("picture-use-room-default"),
            )
        }
    }
    Text(stringResource(R.string.picture_style), color = Tokens.text2, fontSize = 14.sp, modifier = Modifier.padding(top = 8.dp))
    Column(Modifier.selectableGroup()) {
        PictureStyle.entries.forEach { s ->
            ChoiceRow(styleName(s), c.picture.style == s, tag = "picture-style-${s.key}", detail = styleDetail(s)) {
                c.onPicture(c.picture.copy(style = s))
            }
        }
    }
    Text(stringResource(R.string.picture_bands), color = Tokens.text2, fontSize = 14.sp, modifier = Modifier.padding(top = 8.dp))
    Column(Modifier.selectableGroup()) {
        PictureBands.entries.forEach { b ->
            ChoiceRow(bandsName(b), c.picture.bands == b, tag = "picture-bands-${b.key}", detail = bandsDetail(b)) {
                c.onPicture(c.picture.copy(bands = b))
            }
        }
    }
    SwitchRow(
        stringResource(R.string.picture_compare),
        if (c.compare) stringResource(R.string.picture_compare_hint) else null,
        c.compare,
        c.onCompare,
        "picture-compare",
    )
}

/** A 48 dp row with a switch; the whole row toggles it. */
@Composable
private fun SwitchRow(label: String, detail: String?, on: Boolean, onChange: (Boolean) -> Unit, tag: String) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .toggleable(value = on, role = Role.Switch, onValueChange = onChange)
            .testTag(tag),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f).padding(vertical = 4.dp)) {
            Text(label, color = Tokens.text, fontSize = 16.sp)
            if (detail != null) Text(detail, color = Tokens.muted, fontSize = 13.sp, lineHeight = 17.sp)
        }
        Switch(
            checked = on,
            onCheckedChange = null,
            colors = SwitchDefaults.colors(checkedThumbColor = Tokens.onAccent, checkedTrackColor = Tokens.accent),
        )
    }
}

/** The name part: the device's rules, saved and sent to the room at once. */
@Composable
fun NameSection(saved: String, onSave: (String) -> Unit) {
    var text by remember(saved) { mutableStateOf(saved) }
    var done by remember { mutableStateOf(false) }
    val usable = PlayerName.normalize(text).isEmpty() || PlayerName.isValid(text)
    val save = {
        if (usable) {
            onSave(text)
            done = true
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        NameField(text, { text = it; done = false }, tag = "settings-name", hintTag = "settings-name-hint", onDone = save)
        SecondaryButton(
            stringResource(if (done) R.string.game_settings_saved else R.string.settings_save),
            save,
            Modifier.fillMaxWidth().testTag("settings-name-save"),
            enabled = usable && !done,
        )
    }
}

@Composable
fun styleName(s: PictureStyle): String = stringResource(
    when (s) {
        PictureStyle.SMOOTH -> R.string.picture_style_smooth
        PictureStyle.SHARP -> R.string.picture_style_sharp
        PictureStyle.CRT -> R.string.picture_style_crt
        PictureStyle.EDGES -> R.string.picture_style_edges
    },
)

@Composable
private fun styleDetail(s: PictureStyle): String = stringResource(
    when (s) {
        PictureStyle.SMOOTH -> R.string.picture_style_smooth_detail
        PictureStyle.SHARP -> R.string.picture_style_sharp_detail
        PictureStyle.CRT -> R.string.picture_style_crt_detail
        PictureStyle.EDGES -> R.string.picture_style_edges_detail
    },
)

@Composable
internal fun bandsName(b: PictureBands): String = stringResource(
    when (b) {
        PictureBands.BLACK -> R.string.picture_bands_black
        PictureBands.AMBIENT -> R.string.picture_bands_ambient
        PictureBands.FRAME -> R.string.picture_bands_frame
    },
)

@Composable
private fun bandsDetail(b: PictureBands): String = stringResource(
    when (b) {
        PictureBands.BLACK -> R.string.picture_bands_black_detail
        PictureBands.AMBIENT -> R.string.picture_bands_ambient_detail
        PictureBands.FRAME -> R.string.picture_bands_frame_detail
    },
)

/**
 * Compare: the line over the live picture. Left of it the renderer draws
 * the picture as it arrives (smooth, black sides), right of it the chosen
 * style. Drag it anywhere along its height; for TalkBack it is a slider.
 */
@Composable
fun CompareDivider(value: Double, onValue: (Double) -> Unit, after: String, modifier: Modifier = Modifier) {
    val current by rememberUpdatedState(value)
    val set by rememberUpdatedState(onValue)
    val description = stringResource(R.string.picture_divider)
    val before = stringResource(R.string.picture_before)
    BoxWithConstraints(modifier.fillMaxSize()) {
        val widthPx = constraints.maxWidth.toFloat().coerceAtLeast(1f)
        val x = (value * widthPx).roundToInt()
        val density = LocalDensity.current
        val half = with(density) { 24.dp.roundToPx() }
        // The line.
        Box(Modifier.offset { IntOffset(x - with(density) { 1.dp.roundToPx() }, 0) }.width(2.dp).fillMaxHeight().background(Color.White.copy(alpha = 0.9f)))
        // The labels at the top, one on each side.
        Box(Modifier.fillMaxWidth().padding(top = 8.dp)) {
            CompareLabel(before, Modifier.offset { IntOffset(x - half * 4, 0) }.width(88.dp), Alignment.CenterEnd)
            CompareLabel(after, Modifier.offset { IntOffset(x + with(density) { 8.dp.roundToPx() }, 0) }.width(140.dp), Alignment.CenterStart)
        }
        // The grab area: 48 dp wide along the whole line, the handle in the middle.
        Box(
            Modifier
                .offset { IntOffset(x - half, 0) }
                .width(48.dp)
                .fillMaxHeight()
                .testTag("picture-divider")
                .semantics {
                    contentDescription = description
                    stateDescription = "${(value * 100).roundToInt()} %"
                    progressBarRangeInfo = ProgressBarRangeInfo(value.toFloat(), 0f..1f)
                    setProgress { v ->
                        set(PictureLayout.clampSplit(v.toDouble()))
                        true
                    }
                }
                .pointerInput(widthPx) {
                    detectHorizontalDragGestures { change, dx ->
                        change.consume()
                        set(PictureLayout.clampSplit(current + dx / widthPx))
                    }
                },
            contentAlignment = Alignment.Center,
        ) {
            Box(
                Modifier.size(40.dp).background(Color(0xCC05060A), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text("‹ ›", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            }
        }
    }
}

@Composable
private fun CompareLabel(text: String, modifier: Modifier, align: Alignment) {
    Box(modifier, contentAlignment = align) {
        Text(
            text,
            color = Color.White,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            modifier = Modifier.background(Color(0xB305060A), RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 4.dp),
        )
    }
}
