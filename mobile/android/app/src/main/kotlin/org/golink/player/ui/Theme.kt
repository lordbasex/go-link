// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.golink.player.R

/** The website's design tokens (frontend/packages/shared/src/tokens.css), dark theme. */
object Tokens {
    val bg = Color(0xFF0E1016)
    val video = Color(0xFF05060A)
    val surface = Color(0xFF161A23)
    val surface2 = Color(0xFF1B2030)
    val sunken = Color(0xFF131720)
    val border = Color(0xFF262C3A)
    val borderStrong = Color(0xFF3A4256)
    val text = Color(0xFFE9ECF2)
    val text2 = Color(0xFFC4CAD6)
    val muted = Color(0xFFA3ABBD)
    val faint = Color(0xFF8C95A8)
    val accent = Color(0xFFF2A33A)
    val onAccent = Color(0xFF1A1206)
    val voice = Color(0xFF4FC3D9)
    val dangerBg = Color(0xFF2A1519)
    val dangerBorder = Color(0xFF5A2A33)
    val dangerText = Color(0xFFF4A9B6)
    val accentTint = Color(0xFF2A1D0C)
    val accentTintBorder = Color(0xFF6B4A1C)
    val rec = Color(0xFFE0627A)
    val players = listOf(Color(0xFFF2A33A), Color(0xFF4FC3D9), Color(0xFFE0627A), Color(0xFF9D8CF0))

    fun player(port: Int): Color = players.getOrElse(port - 1) { muted }
}

@Composable
fun GoLinkTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Tokens.accent,
            onPrimary = Tokens.onAccent,
            secondary = Tokens.voice,
            background = Tokens.bg,
            onBackground = Tokens.text,
            surface = Tokens.surface,
            onSurface = Tokens.text,
            surfaceVariant = Tokens.surface2,
            onSurfaceVariant = Tokens.muted,
            outline = Tokens.borderStrong,
            outlineVariant = Tokens.border,
            error = Tokens.dangerText,
            surfaceContainer = Tokens.surface,
            surfaceContainerHigh = Tokens.surface2,
            surfaceContainerLow = Tokens.sunken,
        ),
        content = content,
    )
}

@Composable
fun Logo(size: Dp = 40.dp) {
    Image(painterResource(R.drawable.ic_logo), contentDescription = null, modifier = Modifier.size(size))
}

/** The go-link wordmark: the logo and the name, as in the website's header. */
@Composable
fun Brand(subtitle: String? = null) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Logo(36.dp)
        Spacer(Modifier.width(10.dp))
        Column {
            Text("go-link", color = Tokens.text, fontWeight = FontWeight.Bold, fontSize = 20.sp)
            if (subtitle != null) Text(subtitle, color = Tokens.muted, fontSize = 12.sp)
        }
    }
}

/** Primary capsule button (the website's button-primary). */
@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, icon: ImageVector? = null) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.heightIn(min = 48.dp),
        shape = RoundedCornerShape(50),
        colors = ButtonDefaults.buttonColors(containerColor = Tokens.accent, contentColor = Tokens.onAccent),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 10.dp),
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
        }
        Text(text, fontWeight = FontWeight.SemiBold)
    }
}

/** Secondary capsule button. */
@Composable
fun SecondaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, icon: ImageVector? = null) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.heightIn(min = 48.dp),
        shape = RoundedCornerShape(50),
        border = BorderStroke(1.dp, Tokens.borderStrong),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = Tokens.text),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 10.dp),
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
        }
        Text(text)
    }
}

/** A card like the website's .card. */
@Composable
fun Card(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = Tokens.surface,
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, Tokens.border),
    ) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { content() }
    }
}

/** A notice box (danger or accent tint). */
@Composable
fun Notice(text: String, danger: Boolean = false, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = if (danger) Tokens.dangerBg else Tokens.accentTint,
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, if (danger) Tokens.dangerBorder else Tokens.accentTintBorder),
    ) {
        Text(text, color = if (danger) Tokens.dangerText else Tokens.text, modifier = Modifier.padding(12.dp), fontSize = 14.sp)
    }
}
