// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.golink.player.R
import org.golink.player.core.NameCheck
import org.golink.player.core.PlayerName

private val invalidRed = Color(0xFFE0627A)

/** The hint under a name field, in the reader's language. */
@Composable
fun nameHint(check: NameCheck): String = stringResource(
    when (check) {
        NameCheck.INVALID -> R.string.alias_hint_invalid
        NameCheck.EMPTY, NameCheck.TOO_SHORT -> R.string.alias_hint_short
        NameCheck.TOO_LONG -> R.string.alias_hint_long
        NameCheck.OK -> R.string.alias_hint_ok
    },
)

/**
 * A name field with the device's rules (PlayerName): a capsule whose
 * border is grey while empty, orange when the name can be used and red
 * with symbols or emoji, the hint on the left and the n/20 counter on the
 * right. Typing is not cut: the person sees why a name does not work.
 */
@Composable
fun NameField(
    value: String,
    onValue: (String) -> Unit,
    modifier: Modifier = Modifier,
    tag: String = "alias-field",
    hintTag: String = "alias-hint",
    label: String? = null,
    onDone: () -> Unit = {},
) {
    val check = PlayerName.check(value)
    val border = when {
        check == NameCheck.INVALID || check == NameCheck.TOO_LONG -> invalidRed
        check == NameCheck.OK -> Tokens.accent
        else -> Color(0xFF2A3040)
    }
    val bad = check == NameCheck.INVALID || check == NameCheck.TOO_LONG
    val hint = nameHint(check)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (label != null) Text(label, color = Tokens.text2, fontSize = 14.sp)
        BasicTextField(
            value = value,
            // A generous cap only against pasting a book: the counter shows the rule.
            onValueChange = { onValue(it.take(64)) },
            singleLine = true,
            textStyle = TextStyle(color = Tokens.text, fontSize = 18.sp, fontWeight = FontWeight.Medium),
            cursorBrush = SolidColor(Tokens.accent),
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { onDone() }),
            modifier = Modifier
                .fillMaxWidth()
                .height(54.dp)
                .testTag(tag)
                .semantics {
                    if (label != null) contentDescription = label
                    if (bad) error(hint)
                },
            decorationBox = { inner ->
                Box(
                    Modifier
                        .fillMaxSize()
                        .background(Tokens.sunken, RoundedCornerShape(50))
                        .border(1.5.dp, border, RoundedCornerShape(50))
                        .padding(horizontal = 20.dp),
                    contentAlignment = Alignment.CenterStart,
                ) { inner() }
            },
        )
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Text(
                hint,
                color = if (bad) Tokens.dangerText else Tokens.muted,
                fontSize = 13.sp,
                modifier = Modifier.weight(1f).testTag(hintTag),
            )
            Spacer(Modifier.size(12.dp))
            Text(
                "${PlayerName.length(value)}/${PlayerName.MAX}",
                color = if (PlayerName.length(value) > PlayerName.MAX) Tokens.dangerText else Tokens.faint,
                fontSize = 13.sp,
            )
        }
    }
}

/**
 * The alias step (design "Tu alias antes de entrar"): after the code and
 * the PIN, before the room, the name the others will see. It starts with
 * the saved name; Enter is on only for a name the device accepts.
 */
@Composable
fun AliasScreen(saved: String, onEnter: (String) -> Unit, onBack: () -> Unit) {
    var name by rememberSaveable { mutableStateOf(saved) }
    val ok = PlayerName.isValid(name)
    val enter = { if (ok) onEnter(PlayerName.normalize(name)) }
    Surface(Modifier.fillMaxSize().testTag("alias-screen"), color = Tokens.bg) {
        Column(
            Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(Modifier.widthIn(max = 480.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                TextButton(onClick = onBack, modifier = Modifier.testTag("alias-back")) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = Tokens.muted, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(6.dp))
                    Text(stringResource(R.string.back), color = Tokens.muted, fontSize = 15.sp)
                }
                Box(
                    Modifier.size(64.dp).background(Tokens.surface2, RoundedCornerShape(18.dp)).border(1.dp, Tokens.borderStrong, RoundedCornerShape(18.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.Person, contentDescription = null, tint = Tokens.accent, modifier = Modifier.size(32.dp))
                }
                Text(stringResource(R.string.alias_title), color = Tokens.text, fontSize = 32.sp, fontWeight = FontWeight.Bold, lineHeight = 36.sp)
                Text(stringResource(R.string.alias_subtitle), color = Tokens.text2, fontSize = 16.sp, lineHeight = 24.sp)
                NameField(name, { name = it }, label = stringResource(R.string.alias_label), onDone = enter)
                Spacer(Modifier.height(24.dp))
                Text(
                    stringResource(R.string.alias_remember),
                    color = Tokens.faint,
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    onClick = enter,
                    enabled = ok,
                    shape = RoundedCornerShape(50),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Tokens.accent,
                        contentColor = Tokens.onAccent,
                        disabledContainerColor = Tokens.borderStrong,
                        disabledContentColor = Tokens.faint,
                    ),
                    border = null as BorderStroke?,
                    modifier = Modifier.fillMaxWidth().height(54.dp).testTag("alias-enter"),
                ) {
                    Text(stringResource(R.string.alias_enter), fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}
