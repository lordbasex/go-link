// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlin.math.max
import kotlin.math.min

/**
 * A skin for the on-screen gamepad: a console shell drawn around the
 * picture (the iOS app's GoLinkCore Skin.swift, same format and math). A
 * skin is only data (a JSON file, format in docs/skins/README.md), so a new one
 * is a new file, never new code. The built-in skins are the shared files
 * in docs/skins/builtin; every player has one (Smoke until they choose).
 */
data class PadSkin(
    val id: String,
    /** Display names by language ("en" is always there). */
    val names: Map<String, String>,
    val author: String,
    val center: Int,
    val edge: Int,
    val rim: Int,
    /** Top highlight strength, 0-1. */
    val gloss: Double,
    /** Plastic grain strength, 0-1. */
    val grain: Double,
    val controls: Controls,
    val bezel: Int,
    /** Small text drawn where the layout's label box is; empty for none. */
    val label: String,
    val rings: Boolean,
    val screws: Boolean,
    val landscape: List<Decor>,
    val portrait: List<Decor>,
    val backgroundPortrait: String? = null,
    val backgroundLandscape: String? = null,
    /** The folder the skin was read from (its pictures are there); null for a bare file. */
    val folder: String? = null,
    val menuStyle: MenuStyle = MenuStyle(),
    /** The controls' own colors; null uses the tone's. */
    val palette: Palette? = null,
    /** The controls' shapes and depth (style.controls): button shape, ring, labels, dome, well, D-pad. */
    val design: ControlDesign = ControlDesign(),
    val landscapePlacement: Placement? = null,
    val portraitPlacement: Placement? = null,
) {
    enum class Controls { DARK, LIGHT }

    /** The shape of the action buttons (the face and its ring follow it). */
    enum class ButtonShape(val key: String) { CIRCLE("circle"), ROUNDED("rounded"), HEXAGON("hexagon"), DIAMOND("diamond") }

    /** What the action buttons say. */
    enum class ButtonLabels(val key: String) { NUMBERS("numbers"), LETTERS("letters"), NONE("none") }

    /** The D-pad's marks. */
    enum class DpadMarks(val key: String) { ARROWS("arrows"), LINES("lines"), DOTS("dots"), NONE("none") }

    /**
     * A hollow molded into the plastic around every control (the app draws
     * it, so it always fits the control): [size] is how far it reaches past
     * the control (0-0.5 of its size), [depth] how dark its inner shadow is.
     */
    data class Well(val size: Double = 0.14, val depth: Double = 0.6, val color: Int = 0x000000)

    /** How the controls are shaped, beyond their colors. Every value has a default: an old skin looks the same. */
    data class ControlDesign(
        val shape: ButtonShape = ButtonShape.CIRCLE,
        /** The ring's width in 0-0.25 of the button (6/64 by default, like Kenney's). */
        val ring: Double = 6.0 / 64,
        val labels: ButtonLabels = ButtonLabels.NUMBERS,
        /** A convex highlight on the faces, 0 (flat) to 1. */
        val dome: Double = 0.0,
        val well: Well? = null,
        /** The D-pad's arm width in 0.25-0.6 of its size, and its corners in 0-0.5 of the arm. */
        val dpadArm: Double = 50.0 / 128,
        val dpadRadius: Double = 6.0 / 50,
        val dpadMarks: DpadMarks = DpadMarks.ARROWS,
    ) {
        /** Button 1-6 as the skin labels it. */
        fun label(number: Int): String = when (labels) {
            ButtonLabels.NUMBERS -> number.toString()
            ButtonLabels.LETTERS -> ('A' + (number.coerceIn(1, 26) - 1)).toString()
            ButtonLabels.NONE -> ""
        }
    }

    enum class Shape { RECT, GRILL }

    /** A soft shape in the shell, in 0-1 of the shell's width and height. */
    data class Decor(
        val shape: Shape,
        val x: Double, val y: Double, val w: Double, val h: Double,
        /** Corner radius in dp. */
        val radius: Double,
        val fill: Int,
        val opacity: Double,
        /** Opacity of the thin white outline (0 = none). */
        val stroke: Double,
    )

    /** Colors of the menu capsule, its round buttons and its handle. */
    data class MenuStyle(
        val fill: Int = 0x08090E,
        val fillOpacity: Double = 0.55,
        val border: Int = 0xFFFFFF,
        val borderOpacity: Double = 0.14,
        val button: Int = 0x161A23,
        val icon: Int = 0xC4CAD6,
        val active: Int = 0xF2A33A,
        val activeButton: Int = 0x2A1D0C,
        val handle: Int = 0xFFFFFF,
    )

    /**
     * Colors of the D-pad, the round buttons and the Coin/start capsules. A
     * held control sinks (smaller, darker, a shorter shadow); [lit] tints
     * it too, only when the skin asks for it.
     */
    data class Palette(
        val ringTop: Int, val ringBottom: Int, val face: Int, val outline: Int,
        val mark: Int, val label: Int, val lit: Int?, val litLabel: Int,
    )

    /** A box in the placement's canvas units, like an absolutely positioned div. */
    data class Box(val x: Double, val y: Double, val w: Double, val h: Double)

    /**
     * Where the parts go, in the units of [canvasW] x [canvasH]: the
     * playable area of the phone the skin was drawn for. See docs/skins/README.md.
     */
    data class Placement(
        val canvasW: Double,
        val canvasH: Double,
        val screen: Box,
        val dpad: Box,
        val buttons: Box,
        val coin: Box,
        val starts: Box,
        val header: Box,
        val menu: Box,
        val menuVertical: Boolean,
        val menuHides: Boolean,
        /** The menu's round buttons, in canvas units. */
        val menuButton: Double,
        val pillW: Double,
        val pillH: Double,
        val label: Box?,
    )

    /** The name in this language, or the English one. */
    fun name(lang: String): String = names[lang] ?: names["en"] ?: id

    /** The colors the controls are drawn with. */
    val colors: Palette get() = palette ?: tone(controls)

    companion object {
        const val FORMAT = 1
        /** An id no skin may take: the plain pad older builds offered ("Classic"), now read as the default skin. */
        const val CLASSIC_ID = "classic"
        /** The skin a player gets until they choose one. */
        const val DEFAULT_ID = "smoke"
        const val PREF_KEY = "go-link.pad-skin"

        /** The tone's colors (after Kenney's Mobile Controls). */
        fun tone(c: Controls): Palette = when (c) {
            Controls.DARK -> Palette(0x333341, 0x1E1E23, 0x222229, 0x323240, 0x4A4A5C, 0xF3F0FF, null, 0xF3F0FF)
            Controls.LIGHT -> Palette(0xFFFFFF, 0xD8E6E9, 0xE5EEF0, 0xCEDDE0, 0xFFFFFF, 0x2A2A33, null, 0x2A2A33)
        }

        /** Lowercase letters, digits and dashes, 1-40 characters. */
        fun isValidId(id: String): Boolean =
            id.isNotEmpty() && id.length <= 40 && id.all { it in 'a'..'z' || it in '0'..'9' || it == '-' }

        /** "#rrggbb" (or "rrggbb") as 0xRRGGBB. */
        fun hex(s: String): Int? {
            val t = s.removePrefix("#")
            if (t.length != 6 || !t.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }) return null
            return t.toInt(16)
        }

        /** A picture's file name: a plain name next to the skin file, never a path. */
        fun isPictureName(name: String): Boolean {
            val lower = name.lowercase()
            return name.isNotEmpty() && name.length <= 80 && !name.contains('/') && !name.contains('\\') && !name.startsWith(".") &&
                (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg"))
        }

        /**
         * Reads one skin file. Unknown keys are ignored (newer files still
         * load); a wrong type or value refuses the whole file, so a broken
         * skin never half-draws. Numbers are clamped to their range.
         */
        fun parse(text: String): PadSkin {
            val root = parseObject(text) ?: throw SkinException("not json")
            val format = (root["format"] as? JsonPrimitive)?.intOrNull ?: throw SkinException("missing format")
            if (format != FORMAT) throw SkinException("format $format")
            val id = root.string("id") ?: throw SkinException("missing id")
            if (!isValidId(id) || id == CLASSIC_ID) throw SkinException("bad id")
            val names = (root["name"] as? JsonObject)?.mapNotNull { (k, v) ->
                (v as? JsonPrimitive)?.takeIf { it.isString }?.content?.let { k to it.take(40) }
            }?.toMap() ?: throw SkinException("missing name")
            if (names["en"].isNullOrEmpty()) throw SkinException("missing name.en")
            val shell = root["shell"] as? JsonObject ?: throw SkinException("missing shell")
            val controls = when (val c = root["controls"]) {
                null -> Controls.DARK
                else -> when ((c as? JsonPrimitive)?.takeIf { it.isString }?.content) {
                    "dark" -> Controls.DARK
                    "light" -> Controls.LIGHT
                    else -> throw SkinException("bad controls")
                }
            }
            val screen = root["screen"] as? JsonObject ?: JsonObject(emptyMap())
            val decor = root["decor"] as? JsonObject ?: JsonObject(emptyMap())
            val style = root["style"] as? JsonObject
            val layout = root["layout"] as? JsonObject
            val background = root["background"] as? JsonObject
            return PadSkin(
                id = id,
                names = names,
                author = (root.string("author") ?: "").take(60),
                center = color(shell, "center"),
                edge = color(shell, "edge"),
                rim = color(shell, "rim"),
                gloss = unit(shell["gloss"], 0.3),
                grain = unit(shell["grain"], 0.06),
                controls = controls,
                bezel = color(screen, "bezel", 0x07080C),
                label = (screen.string("label") ?: "").take(40),
                rings = (root["rings"] as? JsonPrimitive)?.booleanOrNull ?: true,
                screws = (root["screws"] as? JsonPrimitive)?.booleanOrNull ?: true,
                landscape = decors(decor["landscape"]),
                portrait = decors(decor["portrait"]),
                backgroundPortrait = picture(background?.get("portrait")),
                backgroundLandscape = picture(background?.get("landscape")),
                menuStyle = menuStyle(style?.get("menu")),
                palette = palette(style?.get("controls"), controls),
                design = design(style?.get("controls")),
                landscapePlacement = placement(layout?.get("landscape")),
                portraitPlacement = placement(layout?.get("portrait")),
            )
        }

        private fun JsonObject.string(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

        private fun num(v: JsonElement?): Double? = (v as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull

        private fun color(o: JsonObject, key: String, default: Int? = null): Int {
            val raw = o[key] ?: return default ?: throw SkinException("missing $key")
            val s = (raw as? JsonPrimitive)?.takeIf { it.isString }?.content ?: throw SkinException("bad $key")
            return hex(s) ?: throw SkinException("bad $key")
        }

        private fun unit(v: JsonElement?, fallback: Double): Double = num(v)?.coerceIn(0.0, 1.0) ?: fallback

        private fun picture(v: JsonElement?): String? {
            v ?: return null
            val name = (v as? JsonPrimitive)?.takeIf { it.isString }?.content
            if (name == null || !isPictureName(name)) throw SkinException("bad background")
            return name
        }

        private fun decors(v: JsonElement?): List<Decor> {
            v ?: return emptyList()
            val list = v as? JsonArray ?: throw SkinException("bad decor")
            // A skin is decoration, not a drawing program: a few shapes are enough.
            return list.take(24).map { e ->
                val d = e as? JsonObject ?: throw SkinException("bad decor")
                val shape = when (d.string("shape")) {
                    "rect" -> Shape.RECT
                    "grill" -> Shape.GRILL
                    else -> throw SkinException("bad decor.shape")
                }
                val x = num(d["x"]); val y = num(d["y"]); val w = num(d["w"]); val h = num(d["h"])
                if (x == null || y == null || w == null || h == null) throw SkinException("missing decor.x/y/w/h")
                Decor(
                    shape, x.coerceIn(0.0, 1.0), y.coerceIn(0.0, 1.0), w.coerceIn(0.0, 1.0), h.coerceIn(0.0, 1.0),
                    radius = (num(d["radius"]) ?: 8.0).coerceIn(0.0, 60.0),
                    fill = color(d, "fill", 0xFFFFFF),
                    opacity = unit(d["opacity"], 0.08),
                    stroke = unit(d["stroke"], 0.16),
                )
            }
        }

        private fun menuStyle(v: JsonElement?): MenuStyle {
            val m = MenuStyle()
            v ?: return m
            val o = v as? JsonObject ?: throw SkinException("bad style.menu")
            return MenuStyle(
                fill = color(o, "fill", m.fill), fillOpacity = unit(o["fillOpacity"], m.fillOpacity),
                border = color(o, "border", m.border), borderOpacity = unit(o["borderOpacity"], m.borderOpacity),
                button = color(o, "button", m.button), icon = color(o, "icon", m.icon),
                active = color(o, "active", m.active), activeButton = color(o, "activeButton", m.activeButton),
                handle = color(o, "handle", m.handle),
            )
        }

        private fun design(v: JsonElement?): ControlDesign {
            val o = v as? JsonObject ?: return ControlDesign()
            fun <T> choice(key: String, values: List<Pair<String, T>>, fallback: T): T {
                val raw = o[key] ?: return fallback
                val s = (raw as? JsonPrimitive)?.takeIf { it.isString }?.content
                return values.firstOrNull { it.first == s }?.second ?: throw SkinException("bad style.controls.$key")
            }
            val d = ControlDesign()
            val well = o["well"]?.let { w ->
                val wo = w as? JsonObject ?: throw SkinException("bad style.controls.well")
                val base = Well()
                Well(
                    size = num(wo["size"])?.coerceIn(0.0, 0.5) ?: base.size,
                    depth = unit(wo["depth"], base.depth),
                    color = color(wo, "color", base.color),
                )
            }
            var arm = d.dpadArm
            var radius = d.dpadRadius
            var marks = d.dpadMarks
            o["dpad"]?.let { p ->
                val po = p as? JsonObject ?: throw SkinException("bad style.controls.dpad")
                num(po["arm"])?.let { arm = it.coerceIn(0.25, 0.6) }
                num(po["radius"])?.let { radius = it.coerceIn(0.0, 0.5) }
                po["marks"]?.let { raw ->
                    val s = (raw as? JsonPrimitive)?.takeIf { it.isString }?.content
                    marks = DpadMarks.entries.firstOrNull { it.key == s } ?: throw SkinException("bad style.controls.dpad.marks")
                }
            }
            return ControlDesign(
                shape = choice("shape", ButtonShape.entries.map { it.key to it }, d.shape),
                ring = num(o["ring"])?.coerceIn(0.0, 0.25) ?: d.ring,
                labels = choice("labels", ButtonLabels.entries.map { it.key to it }, d.labels),
                dome = unit(o["dome"], d.dome),
                well = well,
                dpadArm = arm,
                dpadRadius = radius,
                dpadMarks = marks,
            )
        }

        /** Any color left out keeps the tone's. */
        private fun palette(v: JsonElement?, controls: Controls): Palette? {
            v ?: return null
            val o = v as? JsonObject ?: throw SkinException("bad style.controls")
            val t = tone(controls)
            return Palette(
                color(o, "ringTop", t.ringTop), color(o, "ringBottom", t.ringBottom), color(o, "face", t.face), color(o, "outline", t.outline),
                color(o, "mark", t.mark), color(o, "label", t.label),
                if (o["lit"] == null) null else color(o, "lit"),
                color(o, "litLabel", if (o["label"] == null) t.litLabel else color(o, "label")),
            )
        }

        private fun box(o: JsonObject, key: String, required: Boolean = true): Box? {
            val raw = o[key] ?: if (required) throw SkinException("missing layout.$key") else return null
            val b = raw as? JsonObject ?: throw SkinException("bad layout.$key")
            val x = num(b["x"]); val y = num(b["y"]); val w = num(b["w"]); val h = num(b["h"])
            if (x == null || y == null || w == null || h == null || w <= 0 || h <= 0) throw SkinException("bad layout.$key")
            return Box(x, y, w, h)
        }

        private fun placement(v: JsonElement?): Placement? {
            v ?: return null
            val p = v as? JsonObject ?: throw SkinException("bad layout")
            val c = p["canvas"] as? JsonObject
            val cw = num(c?.get("w")); val ch = num(c?.get("h"))
            if (cw == null || ch == null || cw < 100 || ch < 100 || cw > 4000 || ch > 4000) throw SkinException("bad layout.canvas")
            val menu = p["menu"] as? JsonObject ?: JsonObject(emptyMap())
            val direction = menu.string("direction") ?: "row"
            if (direction != "row" && direction != "column") throw SkinException("bad layout.menu.direction")
            var pillW = SkinLayout.PILL_W
            var pillH = SkinLayout.PILL_H
            p["pill"]?.let {
                val o = it as? JsonObject
                val w = num(o?.get("w")); val h = num(o?.get("h"))
                if (w == null || h == null) throw SkinException("bad layout.pill")
                pillW = w.coerceIn(44.0, 160.0)
                pillH = h.coerceIn(28.0, 80.0)
            }
            return Placement(
                canvasW = cw, canvasH = ch,
                screen = box(p, "screen")!!, dpad = box(p, "dpad")!!, buttons = box(p, "buttons")!!,
                coin = box(p, "coin")!!, starts = box(p, "starts")!!, header = box(p, "header")!!,
                menu = box(p, "menu")!!,
                menuVertical = direction == "column",
                menuHides = (menu["hide"] as? JsonPrimitive)?.booleanOrNull ?: false,
                menuButton = (num(menu["size"]) ?: 36.0).coerceIn(28.0, 60.0),
                pillW = pillW, pillH = pillH,
                label = box(p, "label", required = false),
            )
        }
    }
}

class SkinException(message: String) : Exception(message)

/**
 * The skins this app can draw: the built-in files plus any installed
 * later, in the order given; a file that fails to read is skipped and a
 * repeated id keeps the first one.
 */
class SkinCatalog(files: List<File>) {
    /** A skin file and, for a skin in its own folder, that folder (for its pictures). */
    data class File(val name: String, val text: String, val folder: String? = null)

    val skins: List<PadSkin>
    val skipped: List<String>

    init {
        val out = ArrayList<PadSkin>()
        val bad = ArrayList<String>()
        for (f in files) {
            val parsed = try {
                PadSkin.parse(f.text)
            } catch (_: Exception) {
                bad += f.name
                continue
            }
            // Pictures need the folder they live in.
            val skin = if (f.folder == null) parsed.copy(backgroundPortrait = null, backgroundLandscape = null) else parsed.copy(folder = f.folder)
            if (out.none { it.id == skin.id }) out += skin
        }
        skins = out
        skipped = bad
    }

    fun skin(id: String): PadSkin? = skins.firstOrNull { it.id == id }

    /**
     * The saved choice if it still exists, else the default skin (Smoke),
     * else the first one; null only without any skin (the plain pad then).
     */
    fun selected(store: KeyValueStore): PadSkin? =
        store.get(PadSkin.PREF_KEY)?.let { skin(it) } ?: skin(PadSkin.DEFAULT_ID) ?: skins.firstOrNull()
}

/** A rectangle in dp. */
data class SkinRect(val x: Double, val y: Double, val w: Double, val h: Double) {
    val right get() = x + w
    val bottom get() = y + h
    val midX get() = x + w / 2
    val midY get() = y + h / 2

    fun inset(dx: Double, dy: Double) = SkinRect(x + dx, y + dy, w - 2 * dx, h - 2 * dy)

    fun union(o: SkinRect): SkinRect {
        val l = min(x, o.x); val t = min(y, o.y)
        return SkinRect(l, t, max(right, o.right) - l, max(bottom, o.bottom) - t)
    }

    fun intersects(o: SkinRect) = x < o.right && o.x < right && y < o.bottom && o.y < bottom

    fun contains(o: SkinRect, eps: Double = 1e-6) = o.x >= x - eps && o.y >= y - eps && o.right <= right + eps && o.bottom <= bottom + eps
}

/** The screen's safe area insets, in dp. */
data class SkinInsets(val top: Double = 0.0, val left: Double = 0.0, val bottom: Double = 0.0, val right: Double = 0.0)

/**
 * Where a skin puts the picture and the controls on a screen of this size
 * (the iOS app's SkinLayout, the same numbers). The picture is always
 * whole and as large as the controls allow.
 */
data class SkinLayout(
    val screen: SkinRect,
    val dpad: SkinRect,
    val faces: List<SkinRect>,
    val coin: SkinRect,
    val starts: List<SkinRect>,
    /** Where the room's name and the leave button go. */
    val header: SkinRect,
    val leftRing: SkinRect,
    val rightRing: SkinRect,
    /** Where the skin's label is centered; null for none. */
    val labelX: Double?,
    val labelY: Double?,
    /** The room's menu: its capsule is centered in this box. */
    val menu: SkinRect,
    val menuVertical: Boolean,
    val menuHides: Boolean,
    /** The menu's round buttons. */
    val menuButton: Double = 36.0,
    /** How much the controls are scaled from the skin's canvas (1 on the automatic layout). */
    val scale: Double = 1.0,
) {
    companion object {
        const val PILL_W = 58.0
        const val PILL_H = 34.0

        /**
         * [width] x [height] is the whole screen (the shell fills it),
         * [insets] its safe area; [aspect] is the game's width / height;
         * [buttons] 1-6 and [starts] 1-4 are the room's action and start buttons.
         */
        fun compute(
            width: Double, height: Double, insets: SkinInsets, landscape: Boolean, aspect: Double,
            buttons: Int, starts: Int, placement: PadSkin.Placement? = null,
        ): SkinLayout {
            val a = aspect.coerceIn(0.5, 2.5)
            val n = buttons.coerceIn(1, 6)
            val s = starts.coerceIn(1, 4)
            if (placement != null) return placed(placement, width, height, insets, landscape, a, n, s)
            return if (landscape) landscapeLayout(width, height, insets, a, n, s) else portraitLayout(width, height, insets, a, n, s)
        }

        /** Arc offsets in units of the button spacing, in the order of the buttons (1 first). */
        fun arc(n: Int): List<Pair<Double, Double>> = when (n) {
            1 -> listOf(0.0 to 0.0)
            2 -> listOf(-0.55 to 0.45, 0.55 to -0.45)
            3 -> listOf(-1.05 to 0.1, 0.0 to -0.17, 1.05 to 0.1)
            4 -> listOf(-0.95 to 0.0, 0.0 to 0.95, 0.0 to -0.95, 0.95 to 0.0)
            else -> listOf(-1.05 to -0.35, 0.0 to -0.62, 1.05 to -0.35, -1.05 to 0.72, 0.0 to 0.45, 1.05 to 0.72).take(n)
        }

        /** The arc's width and height for button size 1 (spacing is 1.08 of the size). */
        private fun arcSpan(n: Int): Pair<Double, Double> {
            val pts = arc(n)
            val xs = pts.map { it.first }; val ys = pts.map { it.second }
            return ((xs.max() - xs.min()) * 1.08 + 1) to ((ys.max() - ys.min()) * 1.08 + 1)
        }

        private fun faceRects(n: Int, cx: Double, cy: Double, d: Double): List<SkinRect> {
            val pts = arc(n)
            val g = d * 1.08
            // Center the arc's box on the zone (the six-button arc is taller below).
            val ys = pts.map { it.second }
            val mid = (ys.max() + ys.min()) / 2
            return pts.map { (px, py) -> SkinRect(cx + px * g - d / 2, cy + (py - mid) * g - d / 2, d, d) }
        }

        /** Pills in rows of [perRow], centered on [centerX], the first row's top at [top]. */
        private fun pills(count: Int, centerX: Double, top: Double, perRow: Int, gap: Double, pw: Double = PILL_W, ph: Double = PILL_H): List<SkinRect> =
            (0 until count).map { i ->
                val row = i / perRow
                val inRow = min(perRow, count - row * perRow)
                val col = i % perRow
                val width = inRow * pw + (inRow - 1) * gap
                SkinRect(centerX - width / 2 + col * (pw + gap), top + row * (ph + gap), pw, ph)
            }

        /**
         * The playable area: the safe area, reaching a little into the side
         * insets in landscape (beside the camera cutout, never under it).
         */
        fun playArea(width: Double, height: Double, ins: SkinInsets, landscape: Boolean): SkinRect {
            val top = max(ins.top, 8.0); val bottom = max(ins.bottom, 8.0)
            val left = if (landscape) max(ins.left * 0.45, 8.0) else ins.left
            val right = if (landscape) max(ins.right * 0.45, 8.0) else ins.right
            return SkinRect(left, top, width - left - right, height - top - bottom)
        }

        /** A skin's own placement, mapped from its canvas to this screen's playable area. */
        private fun placed(p: PadSkin.Placement, width: Double, height: Double, ins: SkinInsets, landscape: Boolean, a: Double, n: Int, s: Int): SkinLayout {
            val area = playArea(width, height, ins, landscape)
            val sx = area.w / p.canvasW; val sy = area.h / p.canvasH
            // Controls keep their shape: they scale by the smaller factor, a bit less on big tablets.
            val k = minOf(sx, sy, 1.5)
            fun region(b: PadSkin.Box) = SkinRect(area.x + b.x * sx, area.y + b.y * sy, b.w * sx, b.h * sy)
            fun control(b: PadSkin.Box): SkinRect {
                val cx = area.x + (b.x + b.w / 2) * sx; val cy = area.y + (b.y + b.h / 2) * sy
                return SkinRect(cx - b.w * k / 2, cy - b.h * k / 2, b.w * k, b.h * k)
            }
            // The game, whole (no corner cut), as large as its box allows; the bezel is drawn around it, outside the box.
            val dbox = control(p.dpad)
            val dd = min(dbox.w, dbox.h)
            val dpad = SkinRect(dbox.midX - dd / 2, dbox.midY - dd / 2, dd, dd)
            val bbox = control(p.buttons)
            val (spanW, spanH) = arcSpan(n)
            val d = max(36.0, minOf(bbox.w / spanW, bbox.h / spanH, 76 * k))
            val faces = faceRects(n, bbox.midX, bbox.midY, d)
            val pk = k.coerceIn(1.0, 1.25)
            val pw = p.pillW * pk; val ph = p.pillH * pk
            val cbox = control(p.coin)
            val coin = SkinRect(cbox.midX - pw / 2, (cbox.midY - ph / 2).coerceAtLeast(area.y).coerceAtMost(area.bottom - ph), pw, ph)
            val sbox = control(p.starts)
            val gap = 8.0
            // Per row as the designer drew it on the canvas, whatever this screen scales to.
            val perRow = max(1, min(s, ((p.starts.w + gap) / (p.pillW + gap)).toInt()))
            val rows = (s + perRow - 1) / perRow
            val rowsH = rows * ph + (rows - 1) * gap
            // Pills never shrink below a finger's size; a group that grew past the area moves back in.
            val startsTop = (sbox.midY - rowsH / 2).coerceAtLeast(area.y).coerceAtMost(area.bottom - rowsH)
            var starts = pills(s, sbox.midX, startsTop, perRow, gap, pw, ph)
            var coinAt = coin
            // On a narrow screen Coin and the starts may meet: the starts move aside, else Coin does.
            if (starts.any { it.intersects(coinAt) }) {
                val left = starts.minOf { it.x }; val right = starts.maxOf { it.right }
                val shift = coinAt.right + gap - left
                if (coinAt.midX < left + (right - left) / 2 && right + shift <= area.right) {
                    starts = starts.map { it.copy(x = it.x + shift) }
                } else if (left - gap - pw >= area.x) {
                    coinAt = coinAt.copy(x = left - gap - pw)
                }
            }
            // Controls keep a finger's size, so on a small screen they may reach the picture's box:
            // the box gives way on that side (the least it can), then the game fits in what is left.
            var inner = region(p.screen)
            for (c in listOf(dpad, coinAt) + faces + starts) {
                val near = c.inset(-12.5, -12.5)
                if (!near.intersects(inner)) continue
                val cuts = listOf(
                    (near.right - inner.x) to SkinRect(near.right, inner.y, inner.right - near.right, inner.h),
                    (inner.right - near.x) to SkinRect(inner.x, inner.y, near.x - inner.x, inner.h),
                    (near.bottom - inner.y) to SkinRect(inner.x, near.bottom, inner.w, inner.bottom - near.bottom),
                    (inner.bottom - near.y) to SkinRect(inner.x, inner.y, inner.w, near.y - inner.y),
                )
                cuts.filter { it.second.w > 0 && it.second.h > 0 }.minByOrNull { it.first }?.let { inner = it.second }
            }
            var gw = inner.w; var gh = gw / a
            if (gh > inner.h) { gh = inner.h; gw = gh * a }
            val screen = SkinRect(inner.midX - gw / 2, inner.midY - gh / 2, gw, gh)
            // Capsules keep a finger's size on small screens, so they may reach the picture: move them clear of it.
            val clear = screen.inset(-12.0, -12.0)
            fun away(group: List<SkinRect>): List<SkinRect> {
                val box = group.drop(1).fold(group[0]) { acc, r -> acc.union(r) }
                if (!box.intersects(clear)) return group
                val dx = if (box.midX > screen.midX) min(clear.right - box.x, area.right - box.right) else max(clear.x - box.right, area.x - box.x)
                return group.map { it.copy(x = it.x + dx) }
            }
            starts = away(starts)
            if (s > 1 && starts.any { it.intersects(clear) }) {
                // Still no room beside the picture: one capsule per row, beside it.
                val h = s * ph + (s - 1) * gap
                val x = if (sbox.midX > screen.midX) min(clear.right, area.right - pw) else max(clear.x - pw, area.x)
                val top = (sbox.bottom - h).coerceAtLeast(area.y).coerceAtMost(area.bottom - h)
                starts = (0 until s).map { SkinRect(x, top + it * (ph + gap), pw, ph) }
            }
            coinAt = away(listOf(coinAt))[0]
            val faceBox = faces.drop(1).fold(faces[0]) { acc, r -> acc.union(r) }
            // The soft ring behind the buttons stays on screen.
            val ringR = max(max(faceBox.w, faceBox.h) / 2 + 6, minOf(max(faceBox.w, faceBox.h) * 0.62, faceBox.midX - area.x, area.right - faceBox.midX))
            val label = p.label?.let { region(it) }
            return SkinLayout(
                screen = screen, dpad = dpad, faces = faces, coin = coinAt, starts = starts,
                header = region(p.header),
                leftRing = dpad.inset(-dd * 0.1, -dd * 0.1),
                rightRing = SkinRect(faceBox.midX - ringR, faceBox.midY - ringR, ringR * 2, ringR * 2),
                labelX = label?.midX, labelY = label?.midY,
                menu = region(p.menu),
                menuVertical = p.menuVertical, menuHides = p.menuHides,
                menuButton = max(28.0, p.menuButton * min(k, 1.3)),
                scale = k,
            )
        }

        private fun landscapeLayout(W: Double, H: Double, ins: SkinInsets, a: Double, n: Int, s: Int): SkinLayout {
            val top = max(ins.top, 10.0); val bottom = H - max(ins.bottom, 10.0)
            // The controls may reach into the side insets a bit.
            val leftEdge = max(ins.left * 0.45, 12.0); val rightEdge = W - max(ins.right * 0.45, 12.0)
            val sideMin = max(W * 0.2, 150.0)
            val bezel = 8.0
            val gh = max(60.0, min(bottom - top - 2 * bezel, (W - 2 * sideMin - 2 * bezel) / a))
            val gw = gh * a
            val screen = SkinRect((W - gw) / 2, top + (bottom - top - gh) / 2, gw, gh)
            val lz = SkinRect(leftEdge, top, screen.x - bezel - 8 - leftEdge, bottom - top)
            val rz = SkinRect(screen.right + bezel + 8, top, rightEdge - screen.right - bezel - 8, bottom - top)
            val startRows = if (s > 2) 2 else 1
            val pillsH = startRows * PILL_H + (startRows - 1) * 6
            val pillsTop = bottom - pillsH
            val controlsH = pillsTop - 12 - top
            val cy = top + controlsH / 2 + 4
            val dd = max(80.0, minOf(lz.w * 0.9, controlsH * 0.62, 170.0))
            val (spanW, spanH) = arcSpan(n)
            val d = max(36.0, minOf(64.0, (rz.w - 8) / spanW, controlsH * 0.9 / spanH))
            val dpad = SkinRect(lz.midX - dd / 2, cy - dd / 2, dd, dd)
            val faces = faceRects(n, rz.midX, cy, d)
            val coin = SkinRect(lz.midX - PILL_W / 2, pillsTop, PILL_W, PILL_H)
            val starts = pills(s, rz.midX, pillsTop, 2, 8.0)
            val ringR = max(dd, spanW * d) * 0.58
            return SkinLayout(
                screen = screen, dpad = dpad, faces = faces, coin = coin, starts = starts,
                header = SkinRect(leftEdge, top, 44.0, 44.0),
                leftRing = SkinRect(dpad.midX - dd * 0.6, cy - dd * 0.6, dd * 1.2, dd * 1.2),
                rightRing = SkinRect(rz.midX - ringR, cy - ringR, ringR * 2, ringR * 2),
                labelX = null, labelY = null,
                menu = SkinRect(screen.x, screen.y, screen.w, 56.0),
                menuVertical = false, menuHides = true,
            )
        }

        private fun portraitLayout(W: Double, H: Double, ins: SkinInsets, a: Double, n: Int, s: Int): SkinLayout {
            val top = max(ins.top, 10.0); val bottom = H - max(ins.bottom, 10.0)
            val header = SkinRect(12.0, top, W - 24, 44.0)
            val bezel = 8.0
            var gw = W - 2 * (bezel + 6)
            var gh = gw / a
            val maxH = (bottom - top) * 0.46
            if (gh > maxH) { gh = maxH; gw = gh * a }
            val screen = SkinRect((W - gw) / 2, header.bottom + bezel, gw, gh)
            val pillsTop = bottom - PILL_H - 8
            val padTop = screen.bottom + bezel + 22
            val padH = max(120.0, pillsTop - 14 - padTop)
            val cy = padTop + padH / 2
            val zoneW = W / 2 - 14
            val dd = max(100.0, minOf(170.0, zoneW * 0.9, padH * 0.85))
            val (spanW, spanH) = arcSpan(n)
            val d = max(40.0, minOf(76.0, (zoneW - 6) / spanW, padH * 0.9 / spanH))
            val lcx = W * 0.26; val rcx = W * 0.73
            val dpad = SkinRect(lcx - dd / 2, cy - dd / 2, dd, dd)
            val faces = faceRects(n, rcx, cy, d)
            // Coin first, then the starts, in one row.
            val row = pills(1 + s, W / 2, pillsTop, 1 + s, if (s > 2) 8.0 else 18.0)
            val ringR = max(dd, spanW * d) * 0.58
            return SkinLayout(
                screen = screen, dpad = dpad, faces = faces, coin = row[0], starts = row.drop(1),
                header = header,
                leftRing = SkinRect(lcx - dd * 0.6, cy - dd * 0.6, dd * 1.2, dd * 1.2),
                rightRing = SkinRect(rcx - ringR, cy - ringR, ringR * 2, ringR * 2),
                labelX = screen.midX, labelY = screen.bottom + bezel + 9,
                menu = SkinRect(screen.x, screen.y, screen.w, 56.0),
                menuVertical = false, menuHides = true,
            )
        }
    }
}
