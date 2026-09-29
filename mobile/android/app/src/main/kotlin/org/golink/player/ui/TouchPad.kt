// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.ui

import android.view.HapticFeedbackConstants
import android.view.View
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.PointerId
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.golink.player.R
import org.golink.player.core.Button
import org.golink.player.core.GameControls
import org.golink.player.core.TouchPadLogic
import org.golink.player.core.startOf
import kotlin.math.min

/**
 * State of the on-screen gamepad (the website's TouchPad): several
 * fingers at once, and a finger can slide from one button to the next, as
 * on an arcade panel. Regions register their bounds; the pad surfaces
 * hit-test every finger against them.
 */
class TouchPadState(private val onChange: (Int) -> Unit, private val view: View) {
    var held by mutableIntStateOf(0)
        private set
    var fourWay = false
    private val buttons = HashMap<Int, Rect>() // bit -> bounds in root
    private var dpad: Rect? = null
    private val fingers = HashMap<PointerId, Int>()
    private val dpadFingers = HashMap<PointerId, Int>()

    fun register(bit: Int, bounds: Rect) {
        buttons[bit] = bounds
    }

    fun unregister(bit: Int) {
        buttons.remove(bit)
    }

    fun registerDpad(bounds: Rect) {
        dpad = bounds
    }

    fun down(id: PointerId, at: Offset) {
        val d = dpad
        if (d != null && d.contains(at)) {
            dpadFingers[id] = dpadBits(d, at)
        } else {
            fingers[id] = hit(at)
        }
        publish()
    }

    fun move(id: PointerId, at: Offset) {
        val d = dpad
        if (id in dpadFingers && d != null) {
            dpadFingers[id] = dpadBits(d, at)
        } else if (id in fingers) {
            fingers[id] = hit(at)
        } else {
            return
        }
        publish()
    }

    fun up(id: PointerId) {
        if (dpadFingers.remove(id) != null || fingers.remove(id) != null) publish()
    }

    fun releaseAll() {
        fingers.clear()
        dpadFingers.clear()
        publish()
    }

    private fun hit(at: Offset): Int = buttons.entries.firstOrNull { it.value.contains(at) }?.key ?: 0

    private fun dpadBits(d: Rect, at: Offset): Int {
        val radius = d.width / 2
        return TouchPadLogic.dpadBits(((at.x - d.center.x) / radius).toDouble(), ((at.y - d.center.y) / radius).toDouble(), fourWay)
    }

    private fun publish() {
        var bits = 0
        dpadFingers.values.forEach { bits = bits or it }
        fingers.values.forEach { bits = bits or it }
        // A short buzz on each new press.
        if (bits and held.inv() != 0) view.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
        if (bits != held) {
            held = bits
            onChange(bits)
        }
    }
}

@Composable
fun rememberTouchPad(onChange: (Int) -> Unit): TouchPadState {
    val view = LocalView.current
    val state = remember { TouchPadState(onChange, view) }
    DisposableEffect(state) { onDispose { state.releaseAll() } }
    return state
}

private class OffsetRef {
    var value = Offset.Zero
}

/** A part of the pad that takes fingers (the pad is split in two in landscape). */
@Composable
fun PadSurface(state: TouchPadState, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val origin = remember { OffsetRef() }
    Box(
        modifier
            .onGloballyPositioned { origin.value = it.positionInRoot() }
            .pointerInput(state) {
                awaitPointerEventScope {
                    while (true) {
                        val event = awaitPointerEvent()
                        for (change in event.changes) {
                            val at = origin.value + change.position
                            when {
                                change.pressed && !change.previousPressed -> state.down(change.id, at)
                                change.pressed -> state.move(change.id, at)
                                !change.pressed && change.previousPressed -> state.up(change.id)
                            }
                            if (event.type != PointerEventType.Move || change.pressed) change.consume()
                        }
                    }
                }
            },
    ) { content() }
}

/** The D-pad: a cross with the held directions lit. */
@Composable
fun DPad(state: TouchPadState, size: Dp, modifier: Modifier = Modifier) {
    val held = state.held
    Box(
        modifier
            .size(size)
            .testTag("pad-dpad")
            .onGloballyPositioned { state.registerDpad(it.boundsInRoot()) },
    ) {
        Canvas(Modifier.size(size)) {
            val s = this.size.width
            val arm = s / 3
            val base = Color(0x33E9ECF2)
            val ring = Color(0x66E9ECF2)
            drawCircle(Color(0x22000000), radius = s / 2)
            drawCircle(ring, radius = s / 2, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 2f))
            val cross = Path().apply {
                moveTo(arm, 0f + s * 0.06f); lineTo(2 * arm, s * 0.06f); lineTo(2 * arm, arm); lineTo(s - s * 0.06f, arm)
                lineTo(s - s * 0.06f, 2 * arm); lineTo(2 * arm, 2 * arm); lineTo(2 * arm, s - s * 0.06f); lineTo(arm, s - s * 0.06f)
                lineTo(arm, 2 * arm); lineTo(s * 0.06f, 2 * arm); lineTo(s * 0.06f, arm); lineTo(arm, arm); close()
            }
            drawPath(cross, base)
            fun arrow(bit: Int, tip: Offset, a: Offset, b: Offset) {
                val p = Path().apply { moveTo(tip.x, tip.y); lineTo(a.x, a.y); lineTo(b.x, b.y); close() }
                drawPath(p, if (held and bit != 0) Tokens.accent else Color(0x99E9ECF2))
            }
            val c = s / 2
            val t = s * 0.08f
            arrow(Button.UP, Offset(c, s * 0.12f), Offset(c - t, s * 0.12f + t * 1.4f), Offset(c + t, s * 0.12f + t * 1.4f))
            arrow(Button.DOWN, Offset(c, s * 0.88f), Offset(c - t, s * 0.88f - t * 1.4f), Offset(c + t, s * 0.88f - t * 1.4f))
            arrow(Button.LEFT, Offset(s * 0.12f, c), Offset(s * 0.12f + t * 1.4f, c - t), Offset(s * 0.12f + t * 1.4f, c + t))
            arrow(Button.RIGHT, Offset(s * 0.88f, c), Offset(s * 0.88f - t * 1.4f, c - t), Offset(s * 0.88f - t * 1.4f, c + t))
        }
    }
}

/** A round action button (1 to 6), with a metal ring like the website's. */
@Composable
fun ActionButton(state: TouchPadState, bit: Int, label: String, size: Dp) {
    val on = state.held and bit != 0
    DisposableEffect(bit) { onDispose { state.unregister(bit) } }
    Box(
        Modifier
            .size(size)
            .testTag("pad-button-$label")
            .onGloballyPositioned { state.register(bit, it.boundsInRoot()) }
            .background(
                Brush.radialGradient(
                    if (on) listOf(Tokens.accent, Color(0xFFB8741F)) else listOf(Color(0x40E9ECF2), Color(0x1AE9ECF2)),
                ),
                CircleShape,
            )
            .border(2.dp, Brush.linearGradient(listOf(Color(0xFFD9DEE8), Color(0xFF5D667A))), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = if (on) Tokens.onAccent else Tokens.text, fontWeight = FontWeight.Bold, fontSize = 18.sp)
    }
}

/** A small capsule (Coin, 1P, 2P...). */
@Composable
fun PillButton(state: TouchPadState, bit: Int, label: String, mine: Boolean = false, tag: String = "") {
    val on = state.held and bit != 0
    DisposableEffect(bit) { onDispose { state.unregister(bit) } }
    Surface(
        modifier = Modifier
            .heightIn(min = 36.dp)
            .widthIn(min = 56.dp)
            .then(if (tag.isEmpty()) Modifier else Modifier.testTag(tag))
            .onGloballyPositioned { state.register(bit, it.boundsInRoot()) },
        shape = RoundedCornerShape(50),
        color = if (on) Tokens.accent else Color(0x33E9ECF2),
        border = BorderStroke(1.dp, if (mine) Tokens.accent else Color(0x66E9ECF2)),
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)) {
            Text(label, color = if (on) Tokens.onAccent else Tokens.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

/** The game's action buttons in a grid: 1-3 in one row, 4 in two, 5-6 in two rows of three. */
@Composable
fun ActionButtons(state: TouchPadState, controls: GameControls, maxSize: Dp) {
    val bits = TouchPadLogic.actionButtons(controls.buttons)
    if (bits.isEmpty()) return
    val cols = when {
        bits.size <= 3 -> bits.size
        bits.size == 4 -> 2
        else -> 3
    }
    val rows = bits.chunked(cols)
    BoxWithConstraints {
        val gap = 12.dp
        val byWidth = (this.maxWidth - gap * (cols - 1)) / cols
        val size = min(byWidth.value, maxSize.value).dp
        Column(verticalArrangement = Arrangement.spacedBy(gap), horizontalAlignment = Alignment.CenterHorizontally) {
            rows.forEachIndexed { r, row ->
                Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                    row.forEachIndexed { c, bit -> ActionButton(state, bit, "${r * cols + c + 1}", size) }
                }
            }
        }
    }
}

/** Coin and the start buttons of each player (1P, 2P...). */
@Composable
fun StartRow(state: TouchPadState, starts: Int, myPorts: List<Int>, withCoin: Boolean = true) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        if (withCoin) PillButton(state, Button.COIN, stringResource(R.string.room_coin), tag = "pad-coin")
        for (port in 1..starts.coerceIn(1, 4)) {
            PillButton(state, startOf(port), stringResource(R.string.room_start_player, port), mine = port in myPorts, tag = "pad-start-$port")
        }
    }
}

/** Square box helper for the D-pad area. */
@Composable
fun SquareBox(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(modifier.aspectRatio(1f), contentAlignment = Alignment.Center) { content() }
}
