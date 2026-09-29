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
import org.golink.player.core.PadRect
import org.golink.player.core.PadTarget
import org.golink.player.core.TouchPadLogic
import org.golink.player.core.TouchPadTracker
import org.golink.player.core.startOf
import kotlin.math.min

/**
 * State of the on-screen gamepad (the website's TouchPad): several
 * fingers at once, and a finger can slide from one button to the next, as
 * on an arcade panel. Each drawn control registers its bounds under its
 * own owner key (refreshed on every layout by onGloballyPositioned), and
 * removing a control only removes its own entry: the old layout's buttons
 * going away on a rotation never unregister the new ones. [releaseAll]
 * (called on every layout change) lets go of all held buttons and sends 0.
 */
class TouchPadState(private val onChange: (Int) -> Unit, private val view: View) {
    var held by mutableIntStateOf(0)
        private set

    /**
     * Buttons lit without a finger: a real controller's, when the pad is
     * only a see-through display of it (or on the controller test screen).
     */
    var extra by mutableIntStateOf(0)

    /** The uptime (ms) of the latest touch event, for the controller test's latency. */
    var lastEventMs = 0L

    /** What the pad draws as pressed. */
    val lit: Int get() = held or extra
    var fourWay: Boolean
        get() = tracker.fourWay
        set(v) {
            tracker.fourWay = v
        }
    private val tracker = TouchPadTracker<PointerId>()
    private val buttons = HashMap<Any, PadTarget>() // owner -> bit and bounds in root
    private val dpads = HashMap<Any, PadRect>()

    fun place(owner: Any, bit: Int, bounds: Rect) {
        buttons[owner] = PadTarget(bit, bounds.toPad())
    }

    fun placeDpad(owner: Any, bounds: Rect) {
        dpads[owner] = bounds.toPad()
    }

    fun remove(owner: Any) {
        buttons.remove(owner)
        dpads.remove(owner)
    }

    private fun dpad(): PadRect? = dpads.values.lastOrNull()

    fun down(id: PointerId, at: Offset) {
        tracker.down(id, at.x, at.y, dpad(), buttons.values.toList())
        publish()
    }

    fun move(id: PointerId, at: Offset) {
        if (tracker.move(id, at.x, at.y, dpad(), buttons.values.toList())) publish()
    }

    fun up(id: PointerId) {
        tracker.up(id)
        publish()
    }

    fun releaseAll() {
        tracker.releaseAll()
        publish()
    }

    private fun publish() {
        val bits = tracker.bits
        // A short buzz on each new press.
        if (bits and held.inv() != 0) view.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
        if (bits != held) {
            held = bits
            onChange(bits)
        }
    }
}

private fun Rect.toPad() = PadRect(left, top, right, bottom)

@Composable
fun rememberTouchPad(onChange: (Int) -> Unit): TouchPadState {
    val view = LocalView.current
    val state = remember { TouchPadState(onChange, view) }
    DisposableEffect(state) { onDispose { state.releaseAll() } }
    return state
}

/** Registers a pad control's bounds under its own key, and removes only that entry when it leaves. */
@Composable
private fun Modifier.padTarget(state: TouchPadState, bit: Int = 0, dpad: Boolean = false): Modifier {
    val owner = remember { Any() }
    DisposableEffect(state, owner) { onDispose { state.remove(owner) } }
    return onGloballyPositioned {
        if (dpad) state.placeDpad(owner, it.boundsInRoot()) else state.place(owner, bit, it.boundsInRoot())
    }
}

private class OffsetRef {
    var value = Offset.Zero
}

/** A part of the pad that takes fingers (the pad is split in two in landscape). */
@Composable
fun PadSurface(state: TouchPadState, modifier: Modifier = Modifier, enabled: Boolean = true, content: @Composable () -> Unit) {
    val origin = remember { OffsetRef() }
    Box(
        modifier
            .onGloballyPositioned { origin.value = it.positionInRoot() }
            .then(if (!enabled) Modifier else Modifier.pointerInput(state) {
                // Fingers that went down on this surface. When the surface
                // leaves (the layout swapped on a rotation) this coroutine
                // is cancelled without any "up": let go of them here, or
                // their buttons would stay held on the device.
                val mine = HashSet<PointerId>()
                try {
                    awaitPointerEventScope {
                        while (true) {
                            val event = awaitPointerEvent()
                            for (change in event.changes) {
                                state.lastEventMs = change.uptimeMillis
                                val at = origin.value + change.position
                                when {
                                    change.pressed && !change.previousPressed -> {
                                        mine.add(change.id)
                                        state.down(change.id, at)
                                    }
                                    change.pressed -> if (change.id in mine) state.move(change.id, at)
                                    !change.pressed && change.previousPressed -> if (mine.remove(change.id)) state.up(change.id)
                                }
                                if (event.type != PointerEventType.Move || change.pressed) change.consume()
                            }
                        }
                    }
                } finally {
                    mine.forEach { state.up(it) }
                }
            }),
    ) { content() }
}

/** The D-pad: a cross with the held directions lit. */
@Composable
fun DPad(state: TouchPadState, size: Dp, modifier: Modifier = Modifier) {
    val held = state.lit
    Box(
        modifier
            .size(size)
            .testTag("pad-dpad")
            .padTarget(state, dpad = true),
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
    val on = state.lit and bit != 0
    Box(
        Modifier
            .size(size)
            .testTag("pad-button-$label")
            .padTarget(state, bit)
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
    val on = state.lit and bit != 0
    Surface(
        modifier = Modifier
            .heightIn(min = 36.dp)
            .widthIn(min = 56.dp)
            .then(if (tag.isEmpty()) Modifier else Modifier.testTag(tag))
            .padTarget(state, bit),
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
