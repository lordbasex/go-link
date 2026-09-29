// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.ui

import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentPaste
import androidx.compose.material.icons.filled.Dialpad
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.golink.player.R
import org.golink.player.core.InviteTarget
import org.golink.player.core.Invites
import org.golink.player.core.SignalUrls

@Composable
fun HomeScreen(
    signal: SignalUrls.Choice,
    onScan: () -> Unit,
    onType: () -> Unit,
    onInvite: (InviteTarget) -> Unit,
    onSettings: () -> Unit,
    onOfficialServer: () -> Unit,
) {
    val context = LocalContext.current
    var pasteError by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize().safeDrawingPadding()) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Brand(stringResource(R.string.app_subtitle))
                Spacer(Modifier.weight(1f))
                IconButton(onClick = onSettings, modifier = Modifier.size(48.dp).testTag("home-settings")) {
                    Icon(Icons.Filled.Settings, contentDescription = stringResource(R.string.settings_title), tint = Tokens.text2)
                }
            }
            Column(
                Modifier.widthIn(max = 480.dp).fillMaxWidth().padding(top = 28.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                if (signal.custom) {
                    ServerIndicator(signal.url, onOfficialServer)
                }
                Text(stringResource(R.string.home_title), color = Tokens.text, fontSize = 28.sp, fontWeight = FontWeight.Bold)
                Text(stringResource(R.string.home_subtitle), color = Tokens.muted, fontSize = 16.sp)
                Card {
                    PrimaryButton(stringResource(R.string.home_scan), onScan, Modifier.fillMaxWidth(), icon = Icons.Filled.QrCodeScanner)
                    SecondaryButton(stringResource(R.string.home_enter_code), onType, Modifier.fillMaxWidth().testTag("home-code"), icon = Icons.Filled.Dialpad)
                    SecondaryButton(
                        stringResource(R.string.home_paste),
                        {
                            val target = clipboardText(context)?.let { Invites.parseTyped(it) }
                            pasteError = target == null
                            if (target != null) onInvite(target)
                        },
                        Modifier.fillMaxWidth(),
                        icon = Icons.Filled.ContentPaste,
                    )
                    if (pasteError) Notice(stringResource(R.string.home_paste_invalid), danger = true)
                }
                Text(stringResource(R.string.home_pin_note), color = Tokens.faint, fontSize = 13.sp)
                Text(stringResource(R.string.home_host_hint), color = Tokens.faint, fontSize = 13.sp)
            }
        }
    }
}

/** Always visible while a custom signaling server is in use, with the way back. */
@Composable
fun ServerIndicator(url: String, onOfficialServer: () -> Unit) {
    Notice(stringResource(R.string.home_custom_server, url))
    TextButton(onClick = onOfficialServer) { Text(stringResource(R.string.settings_back_official), color = Tokens.accent) }
}

private fun clipboardText(context: Context): String? {
    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    val clip = cm.primaryClip ?: return null
    if (clip.itemCount == 0) return null
    return clip.getItemAt(0).coerceToText(context)?.toString()
}
