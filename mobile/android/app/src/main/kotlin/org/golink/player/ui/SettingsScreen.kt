// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.RemoveCircleOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.golink.player.BuildConfig
import org.golink.player.R
import org.golink.player.core.Protocol
import org.golink.player.core.SignalClient
import org.golink.player.core.SignalUrlCheck
import org.golink.player.core.SignalUrls
import org.golink.player.net.OkHttpSockets

/**
 * The player's name, the signaling server (official or the host's own,
 * like the website's "Signaling server" button: wss:// only, tested for a
 * hello before saving), the startup sound and the permissions.
 */
@Composable
fun SettingsScreen(
    name: String,
    signal: SignalUrls.Choice,
    startupSound: Boolean,
    onStartupSound: (Boolean) -> Unit,
    onName: (String) -> Unit,
    onSignal: (String?) -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var nameText by rememberSaveable { mutableStateOf(name) }
    var coin by rememberSaveable { mutableStateOf(startupSound) }
    var url by rememberSaveable { mutableStateOf(if (signal.custom) signal.url else "") }
    var status by remember { mutableStateOf<String?>(null) }
    var statusBad by remember { mutableStateOf(false) }
    var testing by remember { mutableStateOf(false) }
    val badScheme = stringResource(R.string.settings_server_bad_scheme)
    val badFormat = stringResource(R.string.settings_server_bad_format)
    val saved = stringResource(R.string.settings_server_saved)
    val noAnswer = stringResource(R.string.settings_server_no_answer)
    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = Tokens.accent,
        unfocusedBorderColor = Tokens.border,
        focusedContainerColor = Tokens.sunken,
        unfocusedContainerColor = Tokens.sunken,
        cursorColor = Tokens.accent,
    )
    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding()) {
        Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { if (nameUsable(nameText)) onName(nameText); onBack() }, modifier = Modifier.size(48.dp)) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.back), tint = Tokens.text)
            }
            Text(stringResource(R.string.settings_title), color = Tokens.text, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
        }
        Box(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), contentAlignment = Alignment.TopCenter) {
            Column(Modifier.widthIn(max = 520.dp).fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Card {
                    Text(stringResource(R.string.settings_name), color = Tokens.text, fontWeight = FontWeight.SemiBold)
                    Text(stringResource(R.string.settings_name_hint), color = Tokens.muted, fontSize = 14.sp)
                    NameField(nameText, { nameText = it }, tag = "settings-name", hintTag = "settings-name-hint")
                    SecondaryButton(
                        stringResource(R.string.settings_save),
                        { onName(nameText) },
                        Modifier.fillMaxWidth().testTag("settings-name-save"),
                        enabled = nameUsable(nameText),
                    )
                }
                Card {
                    Text(stringResource(R.string.settings_server), color = Tokens.text, fontWeight = FontWeight.SemiBold)
                    Text(stringResource(R.string.settings_server_explain), color = Tokens.muted, fontSize = 14.sp)
                    Text(
                        if (signal.custom) stringResource(R.string.home_custom_server, signal.url) else stringResource(R.string.settings_server_official),
                        color = if (signal.custom) Tokens.accent else Tokens.text2,
                        fontSize = 14.sp,
                    )
                    OutlinedTextField(
                        value = url,
                        onValueChange = { url = it.take(300); status = null },
                        singleLine = true,
                        label = { Text(stringResource(R.string.settings_server_url)) },
                        placeholder = { Text("wss://signal.example.org/ws") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                        textStyle = androidx.compose.ui.text.TextStyle(fontFamily = FontFamily.Monospace, fontSize = 14.sp),
                        colors = fieldColors,
                        modifier = Modifier.fillMaxWidth().testTag("settings-server-url"),
                    )
                    PrimaryButton(
                        stringResource(if (testing) R.string.settings_server_testing else R.string.settings_server_test_save),
                        {
                            when (val check = SignalUrls.check(url, allowDevHosts = BuildConfig.DEBUG)) {
                                is SignalUrlCheck.Bad -> {
                                    statusBad = true
                                    status = if (check.problem == SignalUrlCheck.Problem.SCHEME) badScheme else badFormat
                                }
                                is SignalUrlCheck.Ok -> {
                                    testing = true
                                    scope.launch {
                                        // Saved only after the server answers hello.
                                        val problem = SignalClient.test(check.url, OkHttpSockets())
                                        testing = false
                                        if (problem == null) {
                                            onSignal(check.url)
                                            statusBad = false
                                            status = saved
                                        } else {
                                            statusBad = true
                                            status = noAnswer
                                        }
                                    }
                                }
                            }
                        },
                        Modifier.fillMaxWidth().testTag("settings-server-save"),
                        enabled = !testing && url.isNotBlank(),
                    )
                    status?.let { Notice(it, danger = statusBad, modifier = Modifier.testTag("settings-server-status")) }
                    if (signal.custom) {
                        TextButton(onClick = { onSignal(null); url = ""; status = null }) {
                            Text(stringResource(R.string.settings_back_official), color = Tokens.accent)
                        }
                    }
                    Text(Protocol.OFFICIAL_SIGNAL_URL, color = Tokens.faint, fontSize = 12.sp, fontFamily = FontFamily.Monospace)
                }
                Card {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                        Text(
                            stringResource(R.string.settings_startup_sound),
                            color = Tokens.text,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.weight(1f),
                        )
                        Switch(
                            checked = coin,
                            onCheckedChange = { coin = it; onStartupSound(it) },
                            colors = SwitchDefaults.colors(checkedThumbColor = Tokens.onAccent, checkedTrackColor = Tokens.accent),
                            modifier = Modifier.testTag("settings-startup-sound"),
                        )
                    }
                    Text(stringResource(R.string.settings_startup_sound_hint), color = Tokens.muted, fontSize = 14.sp)
                }
                Card {
                    Text(stringResource(R.string.settings_permissions), color = Tokens.text, fontWeight = FontWeight.SemiBold)
                    PermissionRow(stringResource(R.string.settings_perm_camera), Perms.CAMERA)
                    PermissionRow(stringResource(R.string.settings_perm_mic), Perms.MIC)
                    if (Perms.BLUETOOTH != null) PermissionRow(stringResource(R.string.settings_perm_bt), Perms.BLUETOOTH)
                    SecondaryButton(stringResource(R.string.perm_open_settings), { Perms.openAppSettings(context) }, Modifier.fillMaxWidth())
                }
                Text(stringResource(R.string.settings_about, BuildConfig.VERSION_NAME), color = Tokens.faint, fontSize = 13.sp)
                AppVersion(Modifier.fillMaxWidth())
                Spacer(Modifier.size(24.dp))
            }
        }
    }
}

@Composable
private fun PermissionRow(label: String, permission: String) {
    val granted by rememberGranted(permission)
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        Icon(
            if (granted) Icons.Filled.CheckCircle else Icons.Filled.RemoveCircleOutline,
            contentDescription = null,
            tint = if (granted) Tokens.voice else Tokens.faint,
            modifier = Modifier.size(20.dp),
        )
        Text(label, color = Tokens.text2, modifier = Modifier.padding(start = 10.dp).weight(1f), fontSize = 14.sp)
        Text(
            stringResource(if (granted) R.string.settings_perm_on else R.string.settings_perm_off),
            color = if (granted) Tokens.voice else Tokens.faint,
            fontSize = 13.sp,
        )
    }
}

/** A saved name must follow the rules; an empty one lets the host pick a guest name. */
private fun nameUsable(name: String): Boolean =
    org.golink.player.core.PlayerName.normalize(name).isEmpty() || org.golink.player.core.PlayerName.isValid(name)
