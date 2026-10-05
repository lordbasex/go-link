// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.ImageShader
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import org.golink.player.R
import org.golink.player.core.Button
import org.golink.player.core.GameControls
import org.golink.player.core.KeyValueStore
import org.golink.player.core.PadSkin
import org.golink.player.core.SkinCatalog
import org.golink.player.core.SkinInsets
import org.golink.player.core.SkinInstall
import org.golink.player.core.SkinLayout
import org.golink.player.core.SkinRect
import org.golink.player.core.TouchPadLogic
import org.golink.player.core.startOf
import java.io.File
import kotlin.math.max
import kotlin.math.min

/**
 * The gamepad skins (Game settings › Skin), like the iOS app's. Every skin
 * is a JSON file (docs/skins/README.md): the built-in ones ship in the app's
 * assets (the shared docs/skins/builtin, "skin-<id>.json") and more can be put
 * in the app's Skins folder (Android/data/org.golink.player/files/Skins on
 * the phone's storage). The choice is kept in Prefs; Smoke until the
 * player picks one.
 */
class SkinStore(private val context: Context, private val store: KeyValueStore) {
    var catalog by mutableStateOf(SkinCatalog(files()))
        private set
    var selected by mutableStateOf(catalog.selected(store))
        private set
    private val pictures = HashMap<String, ImageBitmap?>()

    val selectedId: String get() = selected?.id ?: ""

    /** The ids of the skins that ship with the app (they cannot be replaced or deleted). */
    val builtInIds: Set<String> by lazy {
        (context.assets.list("") ?: emptyArray())
            .filter { it.startsWith("skin-") && it.endsWith(".json") }
            .mapNotNull { name -> runCatching { PadSkin.parse(context.assets.open(name).use { it.readBytes().decodeToString() }).id }.getOrNull() }
            .toSet()
    }

    /** A skin installed by the player (from the Skins folder), which can be deleted. */
    fun isCustom(id: String): Boolean = id !in builtInIds && catalog.skin(id) != null

    /** The installed skins by id, with the file or folder each came from. */
    private fun installedEntries(): Map<String, File> {
        val out = LinkedHashMap<String, File>()
        installedFolder(context)?.listFiles()?.sortedBy { it.name }?.forEach { f ->
            val file = if (f.isDirectory) File(f, "skin.json") else f.takeIf { it.extension.lowercase() == "json" }
            if (file == null || !file.isFile || file.length() > SkinInstall.MAX_BYTES) return@forEach
            val id = runCatching { PadSkin.parse(file.readText()).id }.getOrNull() ?: return@forEach
            if (id !in out) out[id] = f
        }
        return out
    }

    /** The ids of the installed skins (to tell an install from a replace). */
    fun installedIds(): Set<String> = installedEntries().keys

    /** Checks pasted JSON against the app's skins (see SkinInstall). */
    fun check(text: String): SkinInstall.Check = SkinInstall.check(text, builtInIds, installedIds())

    /**
     * Saves a checked skin as Skins/skin-<id>.json (replacing an installed
     * skin with the same id, wherever it was) and reads the folder again.
     */
    fun install(text: String, skin: PadSkin): Boolean {
        if (skin.id in builtInIds) return false
        val folder = installedFolder(context) ?: return false
        val target = File(folder, SkinInstall.fileName(skin.id))
        installedEntries()[skin.id]?.takeIf { it != target }?.let { if (it.isDirectory) it.deleteRecursively() else it.delete() }
        val ok = runCatching { target.writeText(text.trim()) }.isSuccess
        reload()
        return ok && catalog.skin(skin.id) != null
    }

    /** Deletes an installed skin (its file, or its folder with the pictures); built-in skins stay. */
    fun delete(id: String): Boolean {
        if (id in builtInIds) return false
        val entry = installedEntries()[id] ?: return false
        val ok = if (entry.isDirectory) entry.deleteRecursively() else entry.delete()
        pictures.clear()
        reload()
        return ok
    }

    fun choose(id: String) {
        store.set(PadSkin.PREF_KEY, id)
        selected = catalog.selected(store)
    }

    /** Shows a skin without saving the choice (the debug lab). */
    fun show(id: String) {
        catalog.skin(id)?.let { selected = it }
    }

    /** Reads the folder again (a skin added meanwhile shows up the next time Game settings opens). */
    fun reload() {
        catalog = SkinCatalog(files())
        selected = catalog.selected(store)
    }

    /**
     * The app's own skins first, then the installed ones (an installed file
     * cannot replace a built-in id): a bare "<name>.json", or a folder with
     * "skin.json" and its background pictures.
     */
    private fun files(): List<SkinCatalog.File> {
        val order = listOf("violet", "red", "green", "blue", "smoke", "orange")
        val builtIn = (context.assets.list("") ?: emptyArray())
            .filter { it.startsWith("skin-") && it.endsWith(".json") }
            .sortedBy { name -> order.indexOf(name.removePrefix("skin-").removeSuffix(".json")).let { if (it < 0) 99 else it } }
            .mapNotNull { name -> runCatching { SkinCatalog.File(name, context.assets.open(name).use { it.readBytes().decodeToString() }) }.getOrNull() }
        val installed = installedFolder(context)?.listFiles()?.sortedBy { it.name }?.mapNotNull { f ->
            val file = if (f.isDirectory) File(f, "skin.json") else f.takeIf { it.extension.lowercase() == "json" }
            // A skin file is a few kilobytes; anything much larger is not one.
            if (file == null || !file.isFile || file.length() > 64 * 1024) return@mapNotNull null
            runCatching { SkinCatalog.File(if (f.isDirectory) "${f.name}/skin.json" else f.name, file.readText(), if (f.isDirectory) f.path else null) }.getOrNull()
        } ?: emptyList()
        return builtIn + installed
    }

    /** A skin's background picture for this orientation, read once (at most 8 MB). */
    fun background(skin: PadSkin, landscape: Boolean): ImageBitmap? {
        val folder = skin.folder ?: return null
        val name = (if (landscape) skin.backgroundLandscape else skin.backgroundPortrait) ?: return null
        val file = File(folder, name)
        return pictures.getOrPut(file.path) {
            if (!file.isFile || file.length() > 8 * 1024 * 1024) null else runCatching { BitmapFactory.decodeFile(file.path)?.asImageBitmap() }.getOrNull()
        }
    }

    companion object {
        /** Android/data/org.golink.player/files/Skins, created on first use. */
        fun installedFolder(context: Context): File? =
            context.getExternalFilesDir("Skins")?.also { it.mkdirs() }
    }
}

@Composable
fun rememberSkinStore(store: KeyValueStore): SkinStore {
    val context = LocalContext.current
    return remember(store) { SkinStore(context.applicationContext, store) }
}

/** A skin's menu colors for the dock buttons inside it; null keeps the app's own. */
val LocalDockStyle = compositionLocalOf<PadSkin.MenuStyle?> { null }

private fun rgb(c: Int, alpha: Float = 1f) = Color(0xFF000000.toInt() or c).copy(alpha = alpha)

private fun darker(c: Int, k: Float): Int {
    fun ch(shift: Int) = (((c shr shift) and 0xFF) * k).toInt().coerceIn(0, 255) shl shift
    return ch(16) or ch(8) or ch(0)
}

/** The controls' colors from the skin (its tone, or its own palette). */
private class Kit(skin: PadSkin) {
    private val p = skin.colors
    val ringTop = rgb(p.ringTop)
    val ringBottom = rgb(p.ringBottom)
    val face = rgb(p.face)
    val outline = rgb(p.outline)
    val mark = rgb(p.mark)
    val label = rgb(p.label)

    /** A held control's face: the skin's tint, or the face itself a little darker (it sank). */
    val heldTop = p.lit?.let { rgb(it) } ?: rgb(darker(p.face, 0.74f))
    val heldBottom = p.lit?.let { rgb(darker(it, 0.7f)) } ?: rgb(darker(p.face, 0.9f))
    val litLabel = rgb(p.litLabel)
    val held get() = Brush.verticalGradient(listOf(heldTop, heldBottom))
}

/** A soft drop shadow drawn as a blurred-looking circle or capsule (no rectangular smudge when the control sinks). */
private fun androidx.compose.ui.graphics.drawscope.DrawScope.softShadow(on: Boolean, capsule: Boolean) {
    val w = size.width
    val h = size.height
    val dy = (if (on) 1f else if (capsule) 3f else 5f) * density
    val spread = (if (on) 1.5f else 5f) * density
    val alpha = if (on) 0.3f else 0.4f
    if (!capsule) {
        drawCircle(
            Brush.radialGradient(
                0f to Color.Black.copy(alpha = alpha), (w / 2 - spread) / (w / 2 + spread) to Color.Black.copy(alpha = alpha * 0.8f), 1f to Color.Transparent,
                center = Offset(w / 2, h / 2 + dy), radius = w / 2 + spread,
            ),
            radius = w / 2 + spread, center = Offset(w / 2, h / 2 + dy),
        )
    } else {
        // A few widening layers, lighter outward, like a small blur.
        for (i in 3 downTo 0) {
            val g = spread * i / 4
            drawRoundRect(Color.Black.copy(alpha = alpha / 5), Offset(-g, -g + dy), Size(w + 2 * g, h + 2 * g), CornerRadius(h / 2 + g))
        }
    }
}

// MARK: Shell

/** A small gray noise tile for the plastic's grain, made once. */
private val grainTile: ImageBitmap by lazy {
    val n = 96
    val px = IntArray(n * n)
    var seed = 7L
    for (i in px.indices) {
        seed = (seed * 1_664_525 + 1_013_904_223) and 0xFFFFFFFFL
        val v = (seed shr 24).toInt() and 0xFF
        px[i] = (40 shl 24) or (v shl 16) or (v shl 8) or v
    }
    Bitmap.createBitmap(px, n, n, Bitmap.Config.ARGB_8888).asImageBitmap()
}

/**
 * The console body: the colored plastic (or the skin's own picture), its
 * molded shapes, speaker grill, screws, grain, a top gloss and the rim.
 */
@Composable
private fun SkinShell(skin: PadSkin, landscape: Boolean, layout: SkinLayout, picture: ImageBitmap?, modifier: Modifier) {
    val density = LocalDensity.current.density
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        fun r(rect: SkinRect) = Offset(rect.x.toFloat() * density, rect.y.toFloat() * density) to Size(rect.w.toFloat() * density, rect.h.toFloat() * density)
        if (picture != null) {
            // Fills the screen like CSS background-size: cover.
            val k = max(w / picture.width, h / picture.height)
            val pw = picture.width * k
            val ph = picture.height * k
            drawImage(picture, dstOffset = androidx.compose.ui.unit.IntOffset(((w - pw) / 2).toInt(), ((h - ph) / 2).toInt()), dstSize = IntSize(pw.toInt(), ph.toInt()))
        } else {
            drawRect(
                Brush.radialGradient(
                    0f to rgb(skin.center), 0.55f to rgb(skin.center), 1f to rgb(skin.edge),
                    center = Offset(w / 2, h * 0.45f), radius = max(w, h) * 0.62f,
                ),
            )
        }
        for (d in if (landscape) skin.landscape else skin.portrait) {
            val o = Offset((d.x * w).toFloat(), (d.y * h).toFloat())
            val s = Size((d.w * w).toFloat(), (d.h * h).toFloat())
            val cr = CornerRadius(d.radius.toFloat() * density)
            when (d.shape) {
                PadSkin.Shape.RECT -> {
                    drawRoundRect(rgb(d.fill, d.opacity.toFloat()), o, s, cr)
                    if (d.stroke > 0) drawRoundRect(Color.White.copy(alpha = d.stroke.toFloat()), o, s, cr, style = Stroke(1.2f * density))
                }
                PadSkin.Shape.GRILL -> {
                    val clip = Path().apply { addRoundRect(androidx.compose.ui.geometry.RoundRect(o.x, o.y, o.x + s.width, o.y + s.height, cr)) }
                    clipPath(clip) {
                        val step = 9f * density
                        var y = o.y + step / 2
                        while (y < o.y + s.height) {
                            var x = o.x + step / 2
                            while (x < o.x + s.width) {
                                drawCircle(rgb(d.fill, d.opacity.toFloat()), 1.7f * density, Offset(x, y))
                                x += step
                            }
                            y += step
                        }
                    }
                }
            }
        }
        if (skin.rings) {
            for (ring in listOf(layout.leftRing, layout.rightRing)) {
                val (o, s) = r(ring)
                drawOval(Color.White.copy(alpha = 0.06f), o, s)
                drawOval(Color.White.copy(alpha = 0.22f), o, s, style = Stroke(1.5f * density))
            }
        }
        if (skin.screws) {
            // Inside the screen's rounded corners.
            val m = 30f * density
            for (p in listOf(Offset(m, m), Offset(w - m, m), Offset(m, h - m), Offset(w - m, h - m))) {
                drawCircle(Color.White.copy(alpha = 0.18f), 6f * density, p)
                drawCircle(Color.Black.copy(alpha = 0.25f), 6f * density, p, style = Stroke(1f * density))
                drawLine(Color.Black.copy(alpha = 0.35f), Offset(p.x - 4 * density, p.y), Offset(p.x + 4 * density, p.y), 1.4f * density)
            }
        }
        if (skin.grain > 0) {
            drawRect(ShaderBrush(ImageShader(grainTile, TileMode.Repeated, TileMode.Repeated)), alpha = min(1f, skin.grain.toFloat() * 2.2f))
        }
        drawRect(
            Brush.verticalGradient(
                0f to Color.White.copy(alpha = skin.gloss.toFloat()), 0.12f to Color.White.copy(alpha = skin.gloss.toFloat() / 6),
                0.85f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.3f),
            ),
        )
        drawRoundRect(rgb(skin.rim, 0.9f), Offset(2 * density, 2 * density), Size(w - 4 * density, h - 4 * density), CornerRadius(50 * density), style = Stroke(4 * density))
        drawRoundRect(Color.White.copy(alpha = 0.12f), Offset(9 * density, 9 * density), Size(w - 18 * density, h - 18 * density), CornerRadius(44 * density), style = Stroke(2 * density))
    }
}

// MARK: Controls (after Kenney's Mobile Controls, CC0)

/** A button's outline in the skin's shape, [size] wide, centered on ([cx], [cy]) (the iOS app and the editor draw the same shapes). */
private fun shapePath(kind: PadSkin.ButtonShape, cx: Float, cy: Float, size: Float): Path = Path().apply {
    val r = size / 2
    when (kind) {
        PadSkin.ButtonShape.CIRCLE -> addOval(androidx.compose.ui.geometry.Rect(cx - r, cy - r, cx + r, cy + r))
        PadSkin.ButtonShape.ROUNDED -> addRoundRect(androidx.compose.ui.geometry.RoundRect(cx - r, cy - r, cx + r, cy + r, CornerRadius(size * 0.28f)))
        PadSkin.ButtonShape.HEXAGON -> {
            for (i in 0 until 6) {
                val a = Math.toRadians(-90.0 + 60 * i)
                val x = cx + r * kotlin.math.cos(a).toFloat()
                val y = cy + r * kotlin.math.sin(a).toFloat()
                if (i == 0) moveTo(x, y) else lineTo(x, y)
            }
            close()
        }
        PadSkin.ButtonShape.DIAMOND -> {
            moveTo(cx, cy - r); lineTo(cx + r, cy); lineTo(cx, cy + r); lineTo(cx - r, cy); close()
        }
    }
}

/** The hollow molded into the plastic around a control: darker at the top, a light edge at the bottom. */
private fun androidx.compose.ui.graphics.drawscope.DrawScope.well(path: Path, w: PadSkin.Well, top: Float, bottom: Float) {
    val c = rgb(w.color)
    drawPath(path, Brush.verticalGradient(listOf(c.copy(alpha = (0.55 * w.depth).toFloat()), c.copy(alpha = (0.18 * w.depth).toFloat())), top, bottom))
    drawPath(path, Brush.verticalGradient(listOf(Color.Black.copy(alpha = (0.45 * w.depth).toFloat()), Color.White.copy(alpha = (0.3 * w.depth).toFloat())), top, bottom), style = Stroke(1.5f * density))
}

/** A convex shine over a face: light at the top, a little shade at the bottom; held, it turns over. */
private fun domeBrush(dome: Double, held: Boolean, top: Float, bottom: Float): Brush {
    val d = dome.toFloat()
    return if (held) {
        Brush.verticalGradient(0f to Color.Black.copy(alpha = 0.22f * d), 0.6f to Color.Transparent, 1f to Color.White.copy(alpha = 0.14f * d), startY = top, endY = bottom)
    } else {
        Brush.verticalGradient(0f to Color.White.copy(alpha = 0.5f * d), 0.45f to Color.Transparent, 0.75f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.22f * d), startY = top, endY = bottom)
    }
}

/**
 * An action button in the skin's shape: a ring, a face and its label (a
 * number, a letter or nothing), optionally in a hollow of the plastic and
 * with a convex shine. Held, it sinks like a real button: a little
 * smaller, the face darker with a shadow inside its rim, the drop shadow
 * shorter.
 */
@Composable
private fun SkinFace(state: TouchPadState, skin: PadSkin, bit: Int, label: String, size: Float, modifier: Modifier) {
    val on = state.lit and bit != 0
    val k = remember(skin) { Kit(skin) }
    val d = skin.design
    val text = d.label(label.toIntOrNull() ?: 0)
    Box(
        modifier
            .size(size.dp)
            .testTag("pad-button-$label")
            .padTarget(state, bit),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val s = this.size.width
            val c = this.size.width / 2
            d.well?.let { w ->
                val big = s * (1 + 2 * w.size.toFloat())
                well(shapePath(d.shape, c, c, big), w, c - big / 2, c + big / 2)
            }
            // The drop shadow in the button's own shape, a few soft layers.
            val dy = (if (on) 1f else 5f) * density
            val spread = (if (on) 1.5f else 5f) * density
            for (i in 3 downTo 0) {
                drawPath(shapePath(d.shape, c, c + dy, s + spread * i / 2), Color.Black.copy(alpha = if (on) 0.08f else 0.1f))
            }
        }
        Box(Modifier.fillMaxSize().graphicsLayer { scaleX = if (on) 0.93f else 1f; scaleY = scaleX }, contentAlignment = Alignment.Center) {
            Canvas(Modifier.fillMaxSize()) {
                val s = this.size.width
                val c = s / 2
                val inner = s * (1 - 2 * d.ring.toFloat())
                val face = shapePath(d.shape, c, c, inner)
                drawPath(shapePath(d.shape, c, c, s), Brush.verticalGradient(listOf(k.ringTop, k.ringBottom)))
                drawPath(face, if (on) k.held else Brush.linearGradient(listOf(k.face, k.face)))
                if (d.dome > 0) drawPath(face, domeBrush(d.dome, on, c - inner / 2, c + inner / 2))
                if (on) drawPath(face, Brush.radialGradient(0.75f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.4f), center = Offset(c, c), radius = inner / 2))
                drawPath(face, k.outline, style = Stroke(1.dp.toPx()))
            }
            if (text.isNotEmpty()) {
                Text(
                    text,
                    color = if (on) k.litLabel.copy(alpha = 0.8f) else k.label,
                    fontWeight = FontWeight.Bold,
                    fontSize = (size * 0.36f).sp,
                    fontFamily = FontFamily.SansSerif,
                    modifier = Modifier.offset(y = if (on) 1.dp else 0.dp),
                )
            }
        }
    }
}

/** Coin and the start buttons: a wide rounded button with its name; the skin's hollow and shine apply too. */
@Composable
private fun SkinPill(state: TouchPadState, skin: PadSkin, bit: Int, label: String, rect: SkinRect, mine: Boolean, tag: String) {
    val on = state.lit and bit != 0
    val k = remember(skin) { Kit(skin) }
    val d = skin.design
    Box(
        Modifier
            .offset(rect.x.toFloat().dp, rect.y.toFloat().dp)
            .size(rect.w.toFloat().dp, rect.h.toFloat().dp)
            .testTag(tag)
            .padTarget(state, bit),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize()) {
            d.well?.let { w ->
                val g = this.size.height * w.size.toFloat()
                val path = Path().apply { addRoundRect(androidx.compose.ui.geometry.RoundRect(-g, -g, this@Canvas.size.width + g, this@Canvas.size.height + g, CornerRadius(this@Canvas.size.height / 2 + g))) }
                well(path, w, -g, this.size.height + g)
            }
            softShadow(on, capsule = true)
        }
        Box(Modifier.fillMaxSize().graphicsLayer { scaleX = if (on) 0.95f else 1f; scaleY = scaleX }, contentAlignment = Alignment.Center) {
            Canvas(Modifier.fillMaxSize()) {
                val inset = this.size.height * 5 / 64
                val r = CornerRadius(this.size.height / 2)
                drawRoundRect(Brush.verticalGradient(listOf(k.ringTop, k.ringBottom)), cornerRadius = r)
                val inner = Size(this.size.width - 2 * inset, this.size.height - 2 * inset)
                val ir = CornerRadius(inner.height / 2)
                drawRoundRect(if (on) k.held else Brush.linearGradient(listOf(k.face, k.face)), Offset(inset, inset), inner, ir)
                if (d.dome > 0) drawRoundRect(domeBrush(d.dome, on, inset, inset + inner.height), Offset(inset, inset), inner, ir)
                if (on) {
                    drawRoundRect(Color.Black.copy(alpha = 0.3f), Offset(inset, inset), inner, ir, style = Stroke(inner.height * 0.12f))
                }
                // Your own start keeps the app's accent ring.
                drawRoundRect(if (mine) Tokens.accent else k.outline, Offset(inset, inset), inner, ir, style = Stroke((if (mine) 1.5f else 1f) * density))
            }
            Text(
                label,
                color = if (on) k.litLabel.copy(alpha = 0.8f) else k.label,
                fontWeight = FontWeight.Bold,
                fontSize = (rect.h * 0.36).toFloat().sp,
                letterSpacing = 0.6.sp,
                maxLines = 1,
                modifier = Modifier.offset(y = if (on) 1.dp else 0.dp),
            )
        }
    }
}

/**
 * The D-pad: a dark well (or the skin's hollow) and the cross, with the
 * skin's arm width, corners and marks (arrows, lines, dots or none) and its
 * convex shine. Held, the cross rocks toward the direction like a real one
 * (a small 3D tilt, diagonals too) and the held arm sinks darker.
 */
@Composable
private fun SkinDPad(state: TouchPadState, skin: PadSkin, rect: SkinRect) {
    val held = state.lit
    val k = remember(skin) { Kit(skin) }
    val d = skin.design
    val tx = (if (held and Button.RIGHT != 0) 1 else 0) - (if (held and Button.LEFT != 0) 1 else 0)
    val ty = (if (held and Button.DOWN != 0) 1 else 0) - (if (held and Button.UP != 0) 1 else 0)
    Box(
        Modifier
            .offset(rect.x.toFloat().dp, rect.y.toFloat().dp)
            .size(rect.w.toFloat().dp)
            .testTag("pad-dpad")
            .padTarget(state, dpad = true),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val w = d.well
            if (w != null) {
                well(Path().apply { addOval(androidx.compose.ui.geometry.Rect(Offset.Zero, this@Canvas.size)) }, w, 0f, this.size.height)
            } else {
                drawCircle(Color.Black.copy(alpha = 0.2f))
                drawCircle(Color.White.copy(alpha = 0.12f), style = Stroke(2.dp.toPx()))
            }
        }
        Canvas(
            Modifier
                .size((rect.w * 0.86).toFloat().dp)
                .graphicsLayer {
                    // The pressed side goes down into the shell.
                    rotationX = ty * 9f
                    rotationY = -tx * 9f
                    cameraDistance = 10f * density
                },
        ) {
            // Kenney's 128-unit D-pad, scaled, with the skin's arm width and corners.
            val u = this.size.width / 128
            val arm = (d.dpadArm * 128).toFloat()
            val lo = 64 - arm / 2
            val hi = 64 + arm / 2
            val e = 6f
            val corner = CornerRadius(d.dpadRadius.toFloat() * arm * u)
            fun o(x: Float, y: Float) = Offset(x * u, y * u)
            fun s(w: Float, h: Float) = Size(w * u, h * u)
            val ring = Brush.verticalGradient(listOf(k.ringTop, k.ringBottom))
            val sh = if (tx == 0 && ty == 0) 5 * density else 3 * density
            drawRoundRect(Color.Black.copy(alpha = 0.3f), o(lo, 0f) + Offset(0f, sh), s(arm, 128f), corner)
            drawRoundRect(Color.Black.copy(alpha = 0.3f), o(0f, lo) + Offset(0f, sh), s(128f, arm), corner)
            drawRoundRect(ring, o(lo, 0f), s(arm, 128f), corner)
            drawRoundRect(ring, o(0f, lo), s(128f, arm), corner)
            val a = lo + e
            val b = hi - e
            val f = 128 - e
            val face = Path().apply {
                val pts = listOf(e to a, a to a, a to e, b to e, b to a, f to a, f to b, b to b, b to f, a to f, a to b, e to b)
                moveTo(pts[0].first * u, pts[0].second * u)
                pts.drop(1).forEach { lineTo(it.first * u, it.second * u) }
                close()
            }
            drawPath(face, k.face)
            val side = arm - 2 * e
            listOf(
                Button.UP to (o(a, e) to s(side, lo)), Button.DOWN to (o(a, b) to s(side, 128 - hi)),
                Button.LEFT to (o(e, a) to s(lo, side)), Button.RIGHT to (o(b, a) to s(128 - hi, side)),
            ).forEach { (bit, r) -> if (held and bit != 0) drawRect(k.held, r.first, r.second) }
            if (d.dome > 0) drawPath(face, domeBrush(d.dome, false, 0f, this.size.height))
            drawPath(face, k.outline, style = Stroke(1.dp.toPx()))
            val hw = minOf(5f, arm / 2 - e - 2)
            fun poly(vararg p: Pair<Float, Float>) {
                val path = Path().apply {
                    moveTo(p[0].first * u, p[0].second * u)
                    p.drop(1).forEach { lineTo(it.first * u, it.second * u) }
                    close()
                }
                drawPath(path, k.mark)
            }
            when (d.dpadMarks) {
                PadSkin.DpadMarks.ARROWS -> {
                    drawCircle(k.mark, 3 * u, o(64f, 64f))
                    poly(64f to 19f, 64f + hw to 27f, 64f - hw to 27f)
                    poly(64f to 109f, 64f + hw to 101f, 64f - hw to 101f)
                    poly(19f to 64f, 27f to 64f - hw, 27f to 64f + hw)
                    poly(109f to 64f, 101f to 64f - hw, 101f to 64f + hw)
                }
                PadSkin.DpadMarks.LINES -> {
                    for ((p1, p2) in listOf((64f to 16f) to (64f to 34f), (64f to 94f) to (64f to 112f), (16f to 64f) to (34f to 64f), (94f to 64f) to (112f to 64f))) {
                        drawLine(k.mark, o(p1.first, p1.second), o(p2.first, p2.second), 4 * u, cap = androidx.compose.ui.graphics.StrokeCap.Round)
                    }
                }
                PadSkin.DpadMarks.DOTS -> {
                    for ((x, y) in listOf(64f to 64f, 64f to 24f, 64f to 104f, 24f to 64f, 104f to 64f)) drawCircle(k.mark, 3.5f * u, o(x, y))
                }
                PadSkin.DpadMarks.NONE -> Unit
            }
        }
    }
}

// MARK: Layout

private fun Modifier.at(r: SkinRect) = offset(r.x.toFloat().dp, r.y.toFloat().dp).size(r.w.toFloat().dp, r.h.toFloat().dp)

/**
 * The room with a skin: the shell fills the screen, the picture sits in
 * its bezel (whole, never cropped), and every part goes where the skin
 * file puts it for this orientation (SkinLayout): the D-pad, the action
 * buttons, Coin and the starts, the room's name and the menu capsule. A
 * menu the skin marks "hide" folds into a handle after 3 s without
 * touching the picture; a tap on the picture or the handle brings it
 * back, the pad's own buttons never do. Fingers land on touch zones over
 * the controls only, so the picture keeps its taps (the PIN, swap offers).
 */
@Composable
fun SkinConsole(
    skin: PadSkin,
    picture: ImageBitmap?,
    landscape: Boolean,
    pad: TouchPadState,
    controls: GameControls,
    starts: Int,
    myPorts: List<Int>,
    aspect: Double,
    displayOnly: Boolean,
    /** Keeps the menu shown (a sheet is open). */
    keepDock: Boolean,
    header: @Composable (compact: Boolean) -> Unit,
    screen: @Composable (Modifier) -> Unit,
    dock: @Composable (vertical: Boolean) -> Unit,
    /** Each start pill's button: the panel's 1P-4P in a room, the player's own Start in the controller test. */
    startBit: (Int) -> Int = ::startOf,
    /** Each start pill's label, or null for "1P".."4P". */
    startLabels: List<String>? = null,
) {
    val density = LocalDensity.current
    val dir = LocalLayoutDirection.current
    val ins = WindowInsets.safeDrawing
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val insets = with(density) {
            SkinInsets(
                top = ins.getTop(this).toDp().value.toDouble(),
                left = ins.getLeft(this, dir).toDp().value.toDouble(),
                bottom = ins.getBottom(this).toDp().value.toDouble(),
                right = ins.getRight(this, dir).toDp().value.toDouble(),
            )
        }
        val bits = TouchPadLogic.actionButtons(controls.buttons)
        val l = SkinLayout.compute(
            maxWidth.value.toDouble(), maxHeight.value.toDouble(), insets, landscape, aspect, bits.size, starts,
            if (landscape) skin.landscapePlacement else skin.portraitPlacement,
        )
        var wake by remember { mutableIntStateOf(0) }
        var shown by remember { mutableStateOf(true) }
        LaunchedEffect(wake, keepDock, l.menuHides, landscape) {
            shown = true
            if (l.menuHides && !keepDock) {
                delay(3000)
                shown = false
            }
        }
        SkinShell(skin, landscape, l, picture, Modifier.fillMaxSize())
        // The controls, drawn as the skin places them.
        Box(Modifier.fillMaxSize().graphicsLayer { alpha = if (displayOnly) 0.55f else 1f }) {
            SkinDPad(pad, skin, l.dpad)
            bits.zip(l.faces).forEachIndexed { i, (bit, r) ->
                SkinFace(pad, skin, bit, "${i + 1}", r.w.toFloat(), Modifier.offset(r.x.toFloat().dp, r.y.toFloat().dp))
            }
            SkinPill(pad, skin, Button.COIN, stringResource(R.string.room_coin), l.coin, mine = false, tag = "pad-coin")
            l.starts.forEachIndexed { i, r ->
                val port = i + 1
                SkinPill(pad, skin, startBit(port), startLabels?.getOrNull(i) ?: stringResource(R.string.room_start_player, port), r, mine = port in myPorts, tag = "pad-start-$port")
            }
        }
        // Touch zones over the controls only; a finger that started in one keeps sliding across every control.
        val faceBox = l.faces.drop(1).fold(l.faces.first()) { a, r -> a.union(r) }
        (listOf(l.dpad, faceBox, l.coin) + l.starts).forEach { zone ->
            PadSurface(pad, Modifier.at(zone.inset(-8.0, -8.0)), enabled = !displayOnly) { Box(Modifier.fillMaxSize()) }
        }
        // The bezel and the picture.
        val bezel = l.screen.inset(-8.0, -8.0)
        Box(
            Modifier.at(bezel)
                .shadow(13.dp, RoundedCornerShape(18.dp))
                .background(rgb(skin.bezel), RoundedCornerShape(18.dp))
                .border(1.dp, Color.White.copy(alpha = 0.07f), RoundedCornerShape(18.dp)),
        )
        Box(
            Modifier.at(l.screen)
                // Square corners: the whole game shows, no corner is cut.
                .clipToBounds()
                .pointerInput(l.menuHides) {
                    // Watches taps on the picture without taking them from its overlays.
                    if (l.menuHides) awaitEachGesture {
                        awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                        wake++
                    }
                },
        ) { screen(Modifier.fillMaxSize()) }
        if (l.labelX != null && l.labelY != null && skin.label.isNotEmpty()) {
            Box(Modifier.at(SkinRect(l.labelX!! - 150, l.labelY!! - 8, 300.0, 16.0)), contentAlignment = Alignment.Center) {
                Text(skin.label, color = Color.White.copy(alpha = 0.45f), fontSize = 10.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace, letterSpacing = 3.sp, maxLines = 1)
            }
        }
        Box(Modifier.at(l.header), contentAlignment = Alignment.CenterStart) { header(landscape) }
        Box(Modifier.at(l.menu), contentAlignment = if (l.menuHides && !shown) (if (l.menuVertical) Alignment.Center else Alignment.TopCenter) else Alignment.Center) {
            if (shown || !l.menuHides) {
                MenuCapsule(skin.menuStyle, l, dock)
            } else {
                val label = stringResource(R.string.room_show_menu)
                Box(
                    Modifier
                        .size(if (l.menuVertical) 48.dp else 88.dp, if (l.menuVertical) 88.dp else 48.dp)
                        .testTag("dock-handle")
                        .semantics { contentDescription = label }
                        .clickable { wake++ },
                    contentAlignment = if (l.menuVertical) Alignment.Center else Alignment.TopCenter,
                ) {
                    Box(
                        Modifier.padding(top = if (l.menuVertical) 0.dp else 6.dp)
                            .size(if (l.menuVertical) 6.dp else 46.dp, if (l.menuVertical) 46.dp else 6.dp)
                            .background(rgb(skin.menuStyle.handle, 0.4f), RoundedCornerShape(3.dp)),
                    )
                }
            }
        }
    }
}

/** The menu capsule, colored by the skin, scaled to its button size and down to fit its box. */
@Composable
private fun MenuCapsule(m: PadSkin.MenuStyle, l: SkinLayout, dock: @Composable (vertical: Boolean) -> Unit) {
    val density = LocalDensity.current.density
    var measured by remember { mutableStateOf(IntSize.Zero) }
    // The app's dock buttons are 48 dp.
    val want = (l.menuButton / 48.0).toFloat()
    val fit = if (measured.width > 0) {
        min((l.menu.w * density / measured.width).toFloat(), (l.menu.h * density / measured.height).toFloat())
    } else {
        1f
    }
    val k = min(want, fit)
    val shape = RoundedCornerShape(50)
    Box(
        Modifier
            .wrapContentSize(unbounded = true)
            .onSizeChanged { measured = it }
            .graphicsLayer { scaleX = k; scaleY = k }
            .background(rgb(m.fill, m.fillOpacity.toFloat()), shape)
            .border(1.dp, rgb(m.border, m.borderOpacity.toFloat()), shape)
            .padding(6.dp),
    ) {
        androidx.compose.runtime.CompositionLocalProvider(LocalDockStyle provides m) {
            if (l.menuVertical) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) { dock(true) }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) { dock(false) }
            }
        }
    }
}

/** The menu colors as the dock button's container and content colors. */
internal fun dockColors(m: PadSkin.MenuStyle, on: Boolean): Pair<Color, Color> =
    if (on) rgb(m.activeButton) to rgb(m.active) else rgb(m.button) to rgb(m.icon)

/**
 * The room's buttons in a see-through capsule over the picture (cinema
 * mode) that folds into a small handle after 3 s (never while a sheet is
 * open); a tap on the picture ([wake] changes) or on the handle brings it
 * back. It shrinks to fit [maxHeight] on a short screen.
 */
@Composable
fun FloatingCapsule(keep: Boolean, wake: Int, maxHeight: androidx.compose.ui.unit.Dp, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    var shown by remember { mutableStateOf(true) }
    var tap by remember { mutableIntStateOf(0) }
    LaunchedEffect(wake, tap, keep) {
        shown = true
        if (!keep) {
            delay(3000)
            shown = false
        }
    }
    val density = LocalDensity.current.density
    var measured by remember { mutableStateOf(IntSize.Zero) }
    val k = if (measured.height > 0) min(1f, maxHeight.value * density / measured.height) else 1f
    Box(modifier, contentAlignment = Alignment.Center) {
        if (shown) {
            Column(
                Modifier
                    .wrapContentSize(unbounded = true)
                    .onSizeChanged { measured = it }
                    .graphicsLayer { scaleX = k; scaleY = k }
                    .background(Color(0x8C05060A), RoundedCornerShape(50))
                    .border(1.dp, Color.White.copy(alpha = 0.14f), RoundedCornerShape(50))
                    .padding(6.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) { content() }
        } else {
            val label = stringResource(R.string.room_show_menu)
            Box(
                Modifier
                    .size(48.dp, 88.dp)
                    .testTag("dock-handle")
                    .semantics { contentDescription = label }
                    .clickable { tap++ },
                contentAlignment = Alignment.Center,
            ) {
                Box(Modifier.size(6.dp, 46.dp).background(Color.White.copy(alpha = 0.4f), RoundedCornerShape(3.dp)))
            }
        }
    }
}
