// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.ui

import android.content.res.Resources
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.golink.player.R
import org.golink.player.RoomSession
import org.golink.player.core.AudioChoice
import org.golink.player.core.AudioKind
import org.golink.player.core.AudioOption
import org.golink.player.core.LostAudioDevice

/**
 * The Sound sheet: the microphone and the output for the voice chat and
 * the game sound (Automatic, the phone's own, or a connected headset), and
 * a test chime.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SoundSheet(session: RoomSession, onClose: () -> Unit) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val view by session.audioChoices.collectAsState()
    val res = LocalContext.current.resources
    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = state,
        containerColor = Tokens.surface,
        dragHandle = { BottomSheetDefaults.DragHandle(color = Tokens.borderStrong) },
    ) {
        // The sheet is its own window: its test tags need their own flag.
        @OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 22.dp)
                .padding(bottom = 16.dp)
                .navigationBarsPadding()
                .semantics { testTagsAsResourceId = true }
                .testTag("sound-sheet"),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(stringResource(R.string.sound_title), color = Tokens.text, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
            SectionLabel(stringResource(R.string.sound_microphone))
            Column(Modifier.selectableGroup()) {
                view.inputs.forEach { option ->
                    ChoiceRow(optionLabel(res, option), option.choice == view.input, tag = "sound-in-${tagOf(option)}") {
                        session.chooseAudioInput(option.choice)
                    }
                }
            }
            SectionLabel(stringResource(R.string.sound_output))
            Column(Modifier.selectableGroup()) {
                view.outputs.forEach { option ->
                    ChoiceRow(optionLabel(res, option), option.choice == view.output, tag = "sound-out-${tagOf(option)}") {
                        session.chooseAudioOutput(option.choice)
                    }
                }
            }
            Text(
                stringResource(R.string.sound_note),
                color = Tokens.faint,
                fontSize = 13.sp,
                lineHeight = 19.sp,
                modifier = Modifier.padding(top = 6.dp, bottom = 12.dp),
            )
            PrimaryButton(
                stringResource(R.string.sound_test),
                { session.testSound() },
                Modifier.fillMaxWidth().testTag("sound-test"),
                icon = Icons.AutoMirrored.Filled.VolumeUp,
            )
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text.uppercase(LocalContext.current.resources.configuration.locales[0]),
        color = Tokens.faint,
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.SemiBold,
        fontSize = 12.sp,
        letterSpacing = 1.sp,
        modifier = Modifier.padding(top = 12.dp, bottom = 2.dp),
    )
}

/** A 48 dp radio row, as in the design: the ring, then the name. */
@Composable
private fun ChoiceRow(label: String, selected: Boolean, tag: String, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .height(48.dp)
            .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
            .testTag(tag),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val ring = if (selected) Tokens.accent else Tokens.borderStrong
        Box(Modifier.size(20.dp).border(BorderStroke(2.dp, ring), CircleShape), contentAlignment = Alignment.Center) {
            if (selected) Box(Modifier.size(10.dp).background(Tokens.accent, CircleShape))
        }
        Text(
            label,
            color = Tokens.text,
            fontSize = 16.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = 14.dp),
        )
    }
}

private fun tagOf(option: AudioOption): String = when (val c = option.choice) {
    AudioChoice.Automatic -> "auto"
    is AudioChoice.Device -> when (c.kind) {
        AudioKind.SPEAKER -> "speaker"
        AudioKind.BUILTIN_MIC -> "phone"
        else -> "${c.kind.name.lowercase()}-${option.device?.id ?: 0}"
    }
}

private fun optionLabel(res: Resources, option: AudioOption): String {
    val device = option.device ?: return res.getString(R.string.sound_automatic)
    return deviceName(res, device.kind, device.name)
}

/** A device's name: the phone's own by its role, a headset by its product name (or its kind). */
fun deviceName(res: Resources, kind: AudioKind, name: String): String = when (kind) {
    AudioKind.SPEAKER -> res.getString(R.string.sound_speaker)
    AudioKind.BUILTIN_MIC -> res.getString(R.string.sound_phone_mic)
    else -> name.ifBlank {
        res.getString(
            when (kind) {
                AudioKind.BLUETOOTH -> R.string.sound_bluetooth
                AudioKind.USB -> R.string.sound_usb
                AudioKind.HEARING_AID -> R.string.sound_hearing_aid
                else -> R.string.sound_wired
            },
        )
    }
}

/** The snackbar text for a chosen device that disconnected. */
fun lostText(res: Resources, lost: LostAudioDevice): String {
    val name = deviceName(res, lost.kind, lost.name)
    return res.getString(if (lost.input) R.string.sound_input_lost else R.string.sound_output_lost, name)
}
