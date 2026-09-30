// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.ui

import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import org.golink.player.R
import org.golink.player.core.GameControls
import org.golink.player.core.PadSkin
import org.golink.player.core.SkinInstall
import kotlin.math.min

/**
 * Install skin (Settings and Game settings › Skin): paste a skin's JSON,
 * check it (the app's own parser and layout checks, SkinInstall), see it
 * drawn on a phone in both orientations with its warnings, then install it
 * as a custom skin in the Skins folder, or go back and fix the JSON.
 */
@OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
@Composable
fun InstallSkinDialog(skins: SkinStore, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        // A dialog is its own window: its test tags need exposing again for UiAutomator.
        Surface(Modifier.fillMaxSize().semantics { testTagsAsResourceId = true }, color = Tokens.bg) {
            InstallSkin(skins, onDismiss)
        }
    }
}

private sealed interface Stage {
    data object Edit : Stage
    data class Preview(val check: SkinInstall.Check.Ready) : Stage
    data class Done(val skin: PadSkin) : Stage
}

@Composable
private fun InstallSkin(skins: SkinStore, onClose: () -> Unit) {
    val context = LocalContext.current
    val lang = LocalConfiguration.current.locales[0].language
    var text by rememberSaveable { mutableStateOf("") }
    var stage by remember { mutableStateOf<Stage>(Stage.Edit) }
    var error by remember { mutableStateOf<String?>(null) }
    var failed by remember { mutableStateOf(false) }
    fun check() {
        failed = false
        when (val c = skins.check(text)) {
            is SkinInstall.Check.Ready -> {
                error = null
                stage = Stage.Preview(c)
            }
            is SkinInstall.Check.Refused -> error = when (c.problem) {
                SkinInstall.Problem.EMPTY -> context.getString(R.string.skin_install_empty)
                SkinInstall.Problem.TOO_BIG -> context.getString(R.string.skin_install_too_big)
                SkinInstall.Problem.NOT_JSON ->
                    if (c.line != null) context.getString(R.string.skin_install_not_json_at, c.line, c.column ?: 1, c.detail)
                    else context.getString(R.string.skin_install_not_json, c.detail)
                SkinInstall.Problem.INVALID -> context.getString(R.string.skin_install_invalid, c.detail)
                SkinInstall.Problem.BUILT_IN_ID -> context.getString(R.string.skin_install_builtin, c.detail)
            }
        }
    }

    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding()) {
        Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(
                onClick = { if (stage is Stage.Preview) stage = Stage.Edit else onClose() },
                modifier = Modifier.size(48.dp).testTag("skin-install-back"),
            ) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.back), tint = Tokens.text)
            }
            Text(stringResource(R.string.skin_install), color = Tokens.text, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
        }
        Box(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), contentAlignment = Alignment.TopCenter) {
            Column(Modifier.widthIn(max = 560.dp).fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                when (val s = stage) {
                    Stage.Edit -> EditStep(
                        text = text,
                        onText = { text = it; error = null },
                        onPaste = {
                            val clip = (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).primaryClip
                            val pasted = clip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(context)?.toString()
                            if (!pasted.isNullOrBlank()) {
                                text = pasted
                                error = null
                            }
                        },
                        onCheck = { check() },
                        error = error,
                    )
                    is Stage.Preview -> PreviewStep(
                        check = s.check,
                        lang = lang,
                        failed = failed,
                        onInstall = {
                            if (skins.install(text, s.check.skin)) stage = Stage.Done(s.check.skin) else failed = true
                        },
                        onEdit = { stage = Stage.Edit },
                        onCancel = onClose,
                    )
                    is Stage.Done -> DoneStep(
                        skin = s.skin,
                        lang = lang,
                        onUse = {
                            skins.choose(s.skin.id)
                            onClose()
                        },
                        onClose = onClose,
                    )
                }
                Spacer(Modifier.size(24.dp))
            }
        }
    }
}

@Composable
private fun EditStep(text: String, onText: (String) -> Unit, onPaste: () -> Unit, onCheck: () -> Unit, error: String?) {
    Text(stringResource(R.string.skin_install_intro), color = Tokens.muted, fontSize = 14.sp, lineHeight = 20.sp)
    OutlinedTextField(
        value = text,
        onValueChange = { onText(it.take(SkinInstall.MAX_BYTES + 1)) },
        label = { Text(stringResource(R.string.skin_install_field)) },
        placeholder = { Text("{ \"format\": 1, \"id\": \"my-skin\", … }", fontFamily = FontFamily.Monospace, fontSize = 13.sp) },
        textStyle = androidx.compose.ui.text.TextStyle(fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = Tokens.text),
        minLines = 10,
        maxLines = 18,
        isError = error != null,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Tokens.accent,
            unfocusedBorderColor = Tokens.border,
            focusedContainerColor = Tokens.sunken,
            unfocusedContainerColor = Tokens.sunken,
            cursorColor = Tokens.accent,
        ),
        modifier = Modifier.fillMaxWidth().heightIn(min = 200.dp).testTag("skin-install-json"),
    )
    error?.let { Notice(it, danger = true, modifier = Modifier.testTag("skin-install-error")) }
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        SecondaryButton(stringResource(R.string.skin_install_paste), onPaste, Modifier.weight(1f).testTag("skin-install-paste"))
        PrimaryButton(stringResource(R.string.skin_install_check), onCheck, Modifier.weight(1f).testTag("skin-install-check"), enabled = text.isNotBlank())
    }
}

@Composable
private fun PreviewStep(
    check: SkinInstall.Check.Ready,
    lang: String,
    failed: Boolean,
    onInstall: () -> Unit,
    onEdit: () -> Unit,
    onCancel: () -> Unit,
) {
    val skin = check.skin
    var landscape by rememberSaveable { mutableStateOf(false) }
    Text(stringResource(R.string.skin_install_preview), color = Tokens.faint, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp)
    Text(skin.name(lang), color = Tokens.text, fontSize = 22.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.testTag("skin-install-name"))
    Text(
        listOfNotNull(stringResource(R.string.skin_install_id, skin.id), skin.author.takeIf { it.isNotEmpty() }?.let { stringResource(R.string.skin_install_author, it) }).joinToString(" · "),
        color = Tokens.muted,
        fontSize = 13.sp,
        fontFamily = FontFamily.Monospace,
    )
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OrientationChip(stringResource(R.string.skin_install_portrait), !landscape, "skin-install-portrait") { landscape = false }
        OrientationChip(stringResource(R.string.skin_install_landscape), landscape, "skin-install-landscape") { landscape = true }
    }
    PhonePreview(skin, landscape)
    if (check.warnings.isNotEmpty()) {
        Text(stringResource(R.string.skin_install_warnings), color = Tokens.text, fontWeight = FontWeight.SemiBold)
        check.warnings.forEach { Notice(warningText(it), modifier = Modifier.testTag("skin-install-warning")) }
    }
    if (check.replaces) Notice(stringResource(R.string.skin_install_replace_note, skin.id), modifier = Modifier.testTag("skin-install-replaces"))
    if (failed) Notice(stringResource(R.string.skin_install_failed), danger = true)
    PrimaryButton(
        stringResource(if (check.replaces) R.string.skin_install_replace else R.string.skin_install_confirm),
        onInstall,
        Modifier.fillMaxWidth().testTag("skin-install-confirm"),
    )
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        SecondaryButton(stringResource(R.string.skin_install_edit), onEdit, Modifier.weight(1f).testTag("skin-install-edit"))
        SecondaryButton(stringResource(R.string.skin_install_cancel), onCancel, Modifier.weight(1f).testTag("skin-install-cancel"))
    }
}

@Composable
private fun warningText(f: SkinInstall.Found): String {
    val case = stringResource(
        R.string.skin_install_case,
        stringResource(if (f.landscape) R.string.skin_install_landscape else R.string.skin_install_portrait),
        f.width, f.height, f.buttons, f.starts,
    )
    return when (f.warning) {
        SkinInstall.Warning.OFF_SCREEN -> stringResource(R.string.skin_warn_off_screen, case)
        SkinInstall.Warning.ON_PICTURE -> stringResource(R.string.skin_warn_on_picture, case)
        SkinInstall.Warning.OVERLAP -> stringResource(R.string.skin_warn_overlap, case)
        SkinInstall.Warning.TOO_SMALL -> stringResource(R.string.skin_warn_too_small, case)
        SkinInstall.Warning.MENU_OVER -> stringResource(R.string.skin_warn_menu_over, case)
        SkinInstall.Warning.PICTURES_MISSING -> stringResource(R.string.skin_warn_pictures, f.where)
    }
}

@Composable
private fun OrientationChip(label: String, on: Boolean, tag: String, onClick: () -> Unit) {
    TextButton(
        onClick = onClick,
        modifier = Modifier
            .heightIn(min = 44.dp)
            .background(if (on) Tokens.accentTint else Tokens.surface, RoundedCornerShape(999.dp))
            .border(1.dp, if (on) Tokens.accentTintBorder else Tokens.border, RoundedCornerShape(999.dp))
            .testTag(tag),
    ) {
        Text(label, color = if (on) Tokens.accent else Tokens.text2, fontSize = 14.sp)
    }
}

/**
 * The skin drawn by the room's own painter (SkinConsole) on a reference
 * phone (402 x 874 dp, either way round), scaled down to fit, with the
 * test card in its screen.
 */
@Composable
private fun PhonePreview(skin: PadSkin, landscape: Boolean) {
    val w = if (landscape) 874f else 402f
    val h = if (landscape) 402f else 874f
    BoxWithConstraints(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        val scale = min(maxWidth.value / w, (if (landscape) 260f else 520f) / h)
        Box(
            Modifier
                .size((w * scale).dp, (h * scale).dp)
                .clip(RoundedCornerShape(18.dp))
                .border(2.dp, Tokens.borderStrong, RoundedCornerShape(18.dp))
                .testTag("skin-install-preview"),
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.requiredSize(w.dp, h.dp).graphicsLayer { scaleX = scale; scaleY = scale }) {
                val pad = rememberTouchPad {}
                SkinConsole(
                    skin = skin,
                    picture = null,
                    landscape = landscape,
                    pad = pad,
                    controls = GameControls(players = 2, buttons = 6, control = "joy8way"),
                    starts = 2,
                    myPorts = listOf(1),
                    aspect = 4.0 / 3.0,
                    displayOnly = false,
                    keepDock = true,
                    header = { _ ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.Close, null, tint = Tokens.text2, modifier = Modifier.padding(12.dp))
                            Text(skin.name("en"), color = Tokens.text, fontWeight = FontWeight.SemiBold, maxLines = 1)
                        }
                    },
                    screen = { m -> Box(m.background(Tokens.video)) { TestCard(Modifier.fillMaxSize()) } },
                    dock = { _ ->
                        DockButton(Icons.Filled.MicOff, "mic", on = false, tag = "preview-mic") {}
                        DockButton(Icons.AutoMirrored.Filled.VolumeUp, "sound", on = true, tag = "preview-sound") {}
                        DockButton(Icons.Filled.Settings, "settings", on = false, tag = "preview-settings") {}
                    },
                )
            }
        }
    }
}

@Composable
private fun DoneStep(skin: PadSkin, lang: String, onUse: () -> Unit, onClose: () -> Unit) {
    Notice(stringResource(R.string.skin_install_done, skin.name(lang)), modifier = Modifier.testTag("skin-install-done"))
    PrimaryButton(stringResource(R.string.skin_install_use), onUse, Modifier.fillMaxWidth().testTag("skin-install-use"))
    SecondaryButton(stringResource(R.string.skin_install_close), onClose, Modifier.fillMaxWidth().testTag("skin-install-close"))
}

/** Asks before deleting a custom skin. */
@OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
@Composable
fun DeleteSkinDialog(skin: PadSkin, lang: String, onDelete: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Tokens.surface,
        title = { Text(stringResource(R.string.skin_delete_title, skin.name(lang)), color = Tokens.text) },
        text = { Text(stringResource(R.string.skin_delete_body), color = Tokens.muted) },
        confirmButton = {
            TextButton(onClick = onDelete, modifier = Modifier.semantics { testTagsAsResourceId = true }.testTag("skin-delete-confirm")) {
                Text(stringResource(R.string.skin_delete), color = Tokens.dangerText)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, modifier = Modifier.semantics { testTagsAsResourceId = true }.testTag("skin-delete-cancel")) {
                Text(stringResource(R.string.skin_install_cancel), color = Tokens.text2)
            }
        },
    )
}
