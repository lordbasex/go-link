// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat

/** Runtime permissions the app asks for, each after a short explanation. */
object Perms {
    const val CAMERA = Manifest.permission.CAMERA
    const val MIC = Manifest.permission.RECORD_AUDIO

    /** Bluetooth headsets on Android 12+; older versions need no runtime prompt. */
    val BLUETOOTH: String? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Manifest.permission.BLUETOOTH_CONNECT else null

    fun granted(context: Context, permission: String?): Boolean =
        permission == null || ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    /** The app's page in the system settings, to allow a permission denied for good. */
    fun openAppSettings(context: Context) {
        context.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}

/**
 * Whether a permission is granted, checked again whenever the app comes
 * back (the person may have allowed it in the system settings).
 */
@Composable
fun rememberGranted(permission: String?): MutableState<Boolean> {
    val context = LocalContext.current
    val state = remember(permission) { mutableStateOf(Perms.granted(context, permission)) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { state.value = Perms.granted(context, permission) }
    return state
}

/**
 * The explanation shown before the system's permission prompt: what the
 * permission is for and what still works without it.
 */
@Composable
fun PermissionExplainer(
    icon: ImageVector,
    title: String,
    text: String,
    allow: String,
    notNow: String,
    onAllow: () -> Unit,
    onNotNow: () -> Unit,
    modifier: Modifier = Modifier,
    note: String? = null,
) {
    Column(
        modifier = modifier.widthIn(max = 460.dp).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Box(
            Modifier.size(84.dp).background(Tokens.accentTint, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = Tokens.accent, modifier = Modifier.size(40.dp))
        }
        Text(title, color = Tokens.text, fontSize = 22.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Text(text, color = Tokens.muted, fontSize = 15.sp, textAlign = TextAlign.Center)
        if (note != null) Notice(note, danger = true)
        PrimaryButton(allow, onAllow, Modifier.fillMaxWidth())
        SecondaryButton(notNow, onNotNow, Modifier.fillMaxWidth())
    }
}
