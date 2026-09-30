// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.ui

import android.content.res.Configuration
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.golink.player.R
import org.golink.player.core.Button
import org.golink.player.core.GameControls
import org.golink.player.core.LatencyMeter
import org.golink.player.core.ScreenRate
import org.golink.player.input.ControllerKind
import org.golink.player.input.ControllerTester
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * "Test controller": no room and no network. A test card (the PM5544
 * look of the device's test pattern room) with a controller diagram that
 * lights up for the on-screen pad and for any real controller, the
 * controller's name and connection, the input latency (from the input
 * event to the next frame the phone draws) and the screen's measured
 * refresh rate, kept at the phone's highest while the screen is open.
 */
@Composable
fun TestControllerScreen(tester: ControllerTester, onBack: () -> Unit) {
    val landscape = LocalConfiguration.current.orientation == Configuration.ORIENTATION_LANDSCAPE
    val controllerBits by tester.buttons.collectAsState()
    val connected by tester.connected.collectAsState()
    val lastDevice by tester.lastDevice.collectAsState()
    lateinit var padRef: TouchPadState
    val pad = rememberTouchPad { tester.touched(padRef.lastEventMs) }
    padRef = pad
    pad.extra = controllerBits
    DisposableEffect(Unit) {
        tester.reset()
        onDispose { tester.reset() }
    }
    DisposableEffect(landscape) { onDispose { pad.releaseAll() } }

    // Latency: each input change is measured at the next frame.
    val meter = remember { LatencyMeter() }
    // The highest refresh rate while testing, and the measured one for the readout.
    val screenHz by rememberHighRefreshRate()
    var readout by remember { mutableStateOf(Triple<Double?, Double?, Double?>(null, null, null)) }
    LaunchedEffect(Unit) {
        while (true) {
            withFrameNanos { frameNanos ->
                val at = tester.takePending()
                if (at >= 0) {
                    meter.add(frameNanos / 1_000_000.0 - at)
                    readout = Triple(meter.last, meter.min, meter.average)
                }
            }
        }
    }

    val controls = GameControls(players = 1, buttons = 6, control = "joy8way")
    val using = connected.firstOrNull { it.id == lastDevice } ?: connected.firstOrNull()
    val info: @Composable (Modifier) -> Unit = { m ->
        Surface(m, color = Color(0x9E05060A), shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, Color(0x594FC3D9))) {
            Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                val name = using?.let {
                    // Only a link Android can confirm is named; otherwise just the controller.
                    when (it.kind) {
                        ControllerKind.BLUETOOTH -> "${it.name} · ${stringResource(R.string.tester_kind_bluetooth)}"
                        ControllerKind.USB -> "${it.name} · ${stringResource(R.string.tester_kind_usb)}"
                        ControllerKind.UNKNOWN -> it.name
                    }
                } ?: stringResource(R.string.tester_no_controller)
                Text(name, color = Tokens.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.testTag("tester-controller"))
                if (connected.size > 1) Text(stringResource(R.string.tester_more, connected.size - 1), color = Tokens.muted, fontSize = 12.sp)
                fun ms(v: Double?) = v?.let { "${it.roundToInt()} ms" } ?: "–"
                val (last, lo, avg) = readout
                val latency = stringResource(R.string.tester_latency, ms(last), ms(lo), ms(avg))
                Text(
                    latency,
                    color = Tokens.voice,
                    fontSize = 12.sp,
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier.testTag("tester-latency").semantics { liveRegion = LiveRegionMode.Polite },
                )
                Text(
                    stringResource(R.string.tester_screen, ScreenRate.label(screenHz), ScreenRate.frameMs(screenHz)),
                    color = Tokens.voice,
                    fontSize = 12.sp,
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier.testTag("tester-screen-rate"),
                )
            }
        }
    }
    // The readouts sit next to the card, never over it: the circle stays whole.
    val card: @Composable (Modifier) -> Unit = { m ->
        val desc = stringResource(R.string.tester_card)
        TestCard(m.semantics { contentDescription = desc })
    }

    Column(Modifier.fillMaxSize().safeDrawingPadding().testTag("test-controller-screen")) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack, modifier = Modifier.size(48.dp).testTag("tester-back")) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.back), tint = Tokens.text)
            }
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.tester_title), color = Tokens.text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                if (!landscape) Text(stringResource(R.string.tester_subtitle), color = Tokens.muted, fontSize = 12.sp)
            }
        }
        if (landscape) {
            Row(Modifier.fillMaxSize()) {
                PadSurface(pad, Modifier.fillMaxHeight().weight(0.26f)) {
                    Column(Modifier.fillMaxSize().padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.SpaceEvenly) {
                        DPad(pad, 140.dp)
                        PillButton(pad, Button.COIN, stringResource(R.string.room_coin), tag = "pad-coin")
                    }
                }
                Column(Modifier.fillMaxHeight().weight(0.48f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                        card(Modifier.aspectRatio(4f / 3f))
                    }
                    info(Modifier.fillMaxWidth().padding(top = 6.dp, bottom = 4.dp))
                }
                PadSurface(pad, Modifier.fillMaxHeight().weight(0.26f)) {
                    Column(Modifier.fillMaxSize().padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.SpaceEvenly) {
                        ActionButtons(pad, controls, 56.dp)
                        PillButton(pad, Button.START, stringResource(R.string.tester_start), tag = "pad-start")
                    }
                }
            }
        } else {
            card(Modifier.fillMaxWidth().aspectRatio(4f / 3f))
            info(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp))
            PadSurface(pad, Modifier.fillMaxWidth().weight(1f)) {
                Column(Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 8.dp)) {
                    Row(
                        Modifier.fillMaxWidth().weight(1f),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        DPad(pad, 150.dp)
                        Box(Modifier.widthIn(max = 200.dp)) { ActionButtons(pad, controls, 60.dp) }
                    }
                    Row(
                        Modifier.fillMaxWidth().padding(bottom = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally),
                    ) {
                        PillButton(pad, Button.COIN, stringResource(R.string.room_coin), tag = "pad-coin")
                        PillButton(pad, Button.START, stringResource(R.string.tester_start), tag = "pad-start")
                    }
                    Text(stringResource(R.string.tester_offline), color = Tokens.faint, fontSize = 12.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
                }
            }
        }
    }
}

/**
 * A test card in the spirit of PM5544 (the device's test pattern room):
 * a grey grid, a big circle, color bars and a grey scale across it.
 */
@Composable
fun TestCard(modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        drawRect(Color(0xFF6E6E6E))
        val cell = min(w, h) / 10f
        val line = Color(0xFFE8E8E8)
        var x = (w % cell) / 2f
        while (x <= w) {
            drawLine(line, Offset(x, 0f), Offset(x, h), strokeWidth = 1.5f)
            x += cell
        }
        var y = (h % cell) / 2f
        while (y <= h) {
            drawLine(line, Offset(0f, y), Offset(w, y), strokeWidth = 1.5f)
            y += cell
        }
        val c = Offset(w / 2f, h / 2f)
        val r = min(w, h) * 0.44f
        val circle = Path().apply { addOval(androidx.compose.ui.geometry.Rect(c, r)) }
        clipPath(circle) {
            val top = c.y - r
            val band = r * 2 / 6f
            // Black band with a white box, like the card's clock box.
            drawRect(Color.Black, Offset(c.x - r, top), Size(2 * r, band))
            drawRect(Color.White, Offset(c.x - r * 0.3f, top + band * 0.25f), Size(r * 0.6f, band * 0.6f))
            // Color bars.
            val bars = listOf(0xFFBFBF00, 0xFF00BFBF, 0xFF00BF00, 0xFFBF00BF, 0xFFBF0000, 0xFF0000BF).map { Color(it) }
            val bw = 2 * r / bars.size
            bars.forEachIndexed { i, col -> drawRect(col, Offset(c.x - r + i * bw, top + band), Size(bw + 1, band * 2)) }
            // Grey scale.
            val steps = 6
            val sw = 2 * r / steps
            for (i in 0 until steps) {
                val v = i / (steps - 1f)
                drawRect(Color(v, v, v), Offset(c.x - r + i * sw, top + band * 3), Size(sw + 1, band))
            }
            // Fine lines, then black.
            drawRect(Color(0xFF202020), Offset(c.x - r, top + band * 4), Size(2 * r, band))
            var fx = c.x - r
            var i = 0
            while (fx < c.x + r) {
                if (i % 2 == 0) drawRect(Color.White, Offset(fx, top + band * 4 + band * 0.2f), Size(3f, band * 0.6f))
                fx += 6f
                i++
            }
            drawRect(Color.Black, Offset(c.x - r, top + band * 5), Size(2 * r, band))
        }
        drawCircle(Color.White, r, c, style = Stroke(width = 3f))
        drawLine(Color.White, Offset(c.x, c.y - r), Offset(c.x, c.y + r), strokeWidth = 1.5f)
    }
}

