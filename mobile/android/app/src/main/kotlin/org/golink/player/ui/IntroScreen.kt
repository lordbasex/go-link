// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.golink.player.R
import org.golink.player.audio.CoinSound
import org.golink.player.core.PixelText
import kotlin.math.PI
import kotlin.math.hypot
import kotlin.math.roundToInt
import kotlin.math.sin

/** The intro's times, in seconds (the same on the website and iOS). */
private object IntroTime {
    const val POP = 0.7f
    const val NAME = 0.6f
    const val RISE_NAME = 0.5f
    const val COIN = 1.1f
    const val RISE_COIN = 0.4f
    const val BLINK = 1.5f
    const val GLOW_PERIOD = 1.6f
    const val END = 2.0f
    const val FADE = 0.3f
    const val REDUCED_FADE = 0.4f
}

private val INSERT_COIN = PixelText.rows("INSERT COIN")

/**
 * "INSERT COIN": the startup intro on a cold start. The icon pops in with
 * a soft glow, "go-link" rises, then "INSERT COIN" rises with the coin
 * sound and blinks. A tap anywhere skips it; it ends by itself at 2 s.
 * With animations removed (reduced motion) everything just fades in.
 */
@Composable
fun IntroScreen(sound: Boolean, reducedMotion: Boolean, slow: Float = 1f, onDone: () -> Unit) {
    val context = LocalContext.current
    val done by rememberUpdatedState(onDone)
    val coin = remember { if (sound) CoinSound(context.applicationContext) else null }
    DisposableEffect(coin) { onDispose { coin?.release() } }
    var t by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(Unit) {
        val start = withFrameMillis { it }
        var played = false
        while (true) {
            val now = withFrameMillis { it }
            t = (now - start) / 1000f / slow.coerceAtLeast(0.1f)
            if (!played && t >= IntroTime.COIN) {
                played = true
                coin?.play()
            }
            if (t >= IntroTime.END + IntroTime.FADE) break
        }
        done()
    }
    val fadeOut = 1f - ((t - IntroTime.END) / IntroTime.FADE).coerceIn(0f, 1f)
    Box(
        Modifier
            .fillMaxSize()
            .testTag("intro")
            .alpha(fadeOut)
            .drawBehind {
                val center = Offset(size.width * 0.5f, size.height * 0.42f)
                val far = hypot(size.width * 0.5f, size.height * 0.58f)
                drawRect(Color(0xFF05060A))
                drawRect(
                    Brush.radialGradient(
                        0f to Color(0xFF1B2030),
                        0.7f to Color(0xFF05060A),
                        center = center,
                        radius = far,
                    ),
                )
            }
            .pointerInput(Unit) {
                awaitEachGesture {
                    awaitFirstDown()
                    done()
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(26.dp)) {
            if (reducedMotion) {
                val a = (t / IntroTime.REDUCED_FADE).coerceIn(0f, 1f)
                Logo(Modifier.alpha(a), glow = 0f)
                Name(Modifier.alpha(a))
                Coin(Modifier.alpha(a))
            } else {
                val pop = (t / IntroTime.POP).coerceIn(0f, 1f)
                val scale = if (pop < 0.6f) {
                    0.3f + (1.12f - 0.3f) * easeOut(pop / 0.6f)
                } else {
                    1.12f + (1f - 1.12f) * easeInOut((pop - 0.6f) / 0.4f)
                }
                val glow = if (t < IntroTime.POP) {
                    0f
                } else {
                    val phase = ((t - IntroTime.POP) % IntroTime.GLOW_PERIOD) / IntroTime.GLOW_PERIOD
                    sin(PI * phase).toFloat().let { it * it }
                }
                Logo(
                    Modifier.graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                        alpha = (pop / 0.6f).coerceIn(0f, 1f)
                    },
                    glow = glow,
                )
                Name(rise(t, IntroTime.NAME, IntroTime.RISE_NAME))
                val blinkOff = t >= IntroTime.BLINK && ((t - IntroTime.BLINK) % 1f) >= 0.5f
                Coin(rise(t, IntroTime.COIN, IntroTime.RISE_COIN).alpha(if (blinkOff) 0f else 1f))
            }
        }
    }
}

@Composable
private fun rise(t: Float, at: Float, length: Float): Modifier {
    val p = easeOut(((t - at) / length).coerceIn(0f, 1f))
    val shift = with(LocalDensity.current) { 16.dp.toPx() }
    return Modifier.graphicsLayer {
        translationY = shift * (1f - p)
        alpha = p
    }
}

@Composable
private fun Logo(modifier: Modifier, glow: Float) {
    Box(
        modifier
            .size(132.dp)
            .drawBehind {
                if (glow > 0f) {
                    val r = size.minDimension / 2f + 60.dp.toPx()
                    drawCircle(
                        Brush.radialGradient(
                            0f to Tokens.accent.copy(alpha = 0.45f * glow),
                            0.45f to Tokens.accent.copy(alpha = 0.3f * glow),
                            1f to Color.Transparent,
                            center = center,
                            radius = r,
                        ),
                        radius = r,
                    )
                }
            },
    ) {
        Image(painterResource(R.drawable.ic_logo), contentDescription = null, modifier = Modifier.fillMaxSize())
    }
}

@Composable
private fun Name(modifier: Modifier) {
    Text(
        buildAnnotatedString {
            append("go")
            withStyle(SpanStyle(color = Tokens.accent)) { append("-") }
            append("link")
        },
        modifier = modifier,
        color = Tokens.text,
        fontSize = 44.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.4.sp,
    )
}

/** "INSERT COIN" in pixels (no font file); read as one label. */
@Composable
private fun Coin(modifier: Modifier) {
    val density = LocalDensity.current
    // Whole screen pixels per dot, so neighbouring dots never leave a seam.
    val dot = with(density) { 3.dp.toPx() }.roundToInt().coerceAtLeast(1)
    val cols = INSERT_COIN[0].size
    Canvas(
        modifier
            .size(with(density) { (dot * cols).toDp() }, with(density) { (dot * PixelText.HEIGHT).toDp() })
            .semantics { contentDescription = "INSERT COIN" },
    ) {
        val p = dot.toFloat()
        INSERT_COIN.forEachIndexed { y, row ->
            row.forEachIndexed { x, on ->
                // A hair larger than a dot: covers any sub-pixel offset of the canvas.
                if (on) drawRect(Tokens.accent, Offset(x * p, y * p), Size(p + 0.5f, p + 0.5f))
            }
        }
    }
}

private fun easeOut(p: Float): Float = 1f - (1f - p) * (1f - p) * (1f - p)

private fun easeInOut(p: Float): Float = if (p < 0.5f) 4f * p * p * p else 1f - (-2f * p + 2f).let { it * it * it } / 2f
