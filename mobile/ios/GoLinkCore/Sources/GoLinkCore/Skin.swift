// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import CoreGraphics
import Foundation

/**
 * A skin for the on-screen gamepad: a console shell drawn around the
 * picture. A skin is only data (a JSON file, format in docs/skins/README.md), so
 * a new one is a new file, never new code: the app draws every skin with
 * the same shell painter and places the controls with SkinLayout. The
 * built-in skins ship as JSON in the app's resources; every player has
 * one (Smoke until they choose).
 */
public struct PadSkin: Equatable, Sendable, Identifiable {
    public static let format = 1
    /** An id no skin may take: the plain pad older builds offered ("Classic"), now read as the default skin. */
    public static let classicId = "classic"
    /** The skin a player gets until they choose one. */
    public static let defaultId = "smoke"
    public static let prefKey = "go-link.pad-skin"

    public enum Controls: String, Sendable {
        /** Dark buttons with light labels. */
        case dark
        /** Light buttons with dark labels. */
        case light
    }

    public enum Shape: String, Sendable {
        /** A rounded rectangle molded into the shell. */
        case rect
        /** A speaker grill: rows of small holes. */
        case grill
    }

    /** A soft shape in the shell, in 0-1 of the shell's width and height. */
    public struct Decor: Equatable, Sendable {
        public var shape: Shape
        public var x, y, w, h: Double
        /** Corner radius in points. */
        public var radius: Double
        public var fill: UInt32
        public var opacity: Double
        /** Opacity of the thin white outline (0 = none). */
        public var stroke: Double
    }

    public var id: String
    /** Display names by language ("en" is required, others optional). */
    public var names: [String: String]
    public var author: String
    /** The shell's color in the middle and at the edges, and the rim around it. */
    public var center: UInt32
    public var edge: UInt32
    public var rim: UInt32
    /** Top highlight strength, 0-1. */
    public var gloss: Double
    /** Plastic grain strength, 0-1. */
    public var grain: Double
    public var controls: Controls
    public var bezel: UInt32
    /** Small text under the picture; empty for none. */
    public var label: String
    /** A soft ring behind the D-pad and behind the action buttons. */
    public var rings: Bool
    /** A screw in each corner. */
    public var screws: Bool
    public var landscape: [Decor]
    public var portrait: [Decor]
    /**
     * Pictures drawn as the shell's background (file names next to the
     * skin file, PNG or JPEG), filling the screen; decor, rings, screws,
     * gloss and rim are still drawn over them when the file lists them.
     */
    public var backgroundPortrait: String?
    public var backgroundLandscape: String?
    /** The folder the skin was read from (its background pictures are there); nil for a bare file. */
    public var folder: URL?
    /** The room's menu capsule. */
    public var menuStyle = MenuStyle()
    /** The controls' own colors; nil uses the `controls` tone's. */
    public var palette: Palette?
    /** The controls' shapes and depth (style.controls): button shape, ring, labels, dome, well, D-pad. */
    public var design = ControlDesign()

    /** The shape of the action buttons (the face and its ring follow it). */
    public enum ButtonShape: String, Sendable, CaseIterable {
        case circle, rounded, hexagon, diamond
    }

    /** What the action buttons say. */
    public enum ButtonLabels: String, Sendable, CaseIterable {
        case numbers, letters, none
    }

    /** The D-pad's marks. */
    public enum DpadMarks: String, Sendable, CaseIterable {
        case arrows, lines, dots, none
    }

    /**
     * A hollow molded into the plastic around every control (the app draws
     * it, so it always fits the control): `size` is how far it reaches past
     * the control (0-0.5 of its size), `depth` how dark its inner shadow is.
     */
    public struct Well: Equatable, Sendable {
        public var size: Double = 0.14
        public var depth: Double = 0.6
        public var color: UInt32 = 0x000000
        public init() {}
    }

    /** How the controls are shaped, beyond their colors. Every value has a default: an old skin looks the same. */
    public struct ControlDesign: Equatable, Sendable {
        public var shape: ButtonShape = .circle
        /** The ring's width in 0-0.25 of the button (6/64 by default, like Kenney's). */
        public var ring: Double = 6.0 / 64
        public var labels: ButtonLabels = .numbers
        /** A convex highlight on the faces, 0 (flat) to 1. */
        public var dome: Double = 0
        public var well: Well?
        /** The D-pad's arm width in 0.25-0.6 of its size, and its corners in 0-0.5 of the arm. */
        public var dpadArm: Double = 50.0 / 128
        public var dpadRadius: Double = 6.0 / 50
        public var dpadMarks: DpadMarks = .arrows
        public init() {}

        /** Button 1-6 as the skin labels it. */
        public func label(_ number: Int) -> String {
            switch labels {
            case .numbers: return String(number)
            case .letters: return String(UnicodeScalar(UInt8(64 + max(1, min(number, 26)))))
            case .none: return ""
            }
        }
    }

    /** Colors of the menu capsule, its round buttons and its handle. */
    public struct MenuStyle: Equatable, Sendable {
        public var fill: UInt32 = 0x08090E
        public var fillOpacity = 0.55
        public var border: UInt32 = 0xFFFFFF
        public var borderOpacity = 0.14
        public var button: UInt32 = 0x161A23
        public var icon: UInt32 = 0xC4CAD6
        public var active: UInt32 = 0xF2A33A
        public var activeButton: UInt32 = 0x2A1D0C
        public var handle: UInt32 = 0xFFFFFF
        public init() {}
    }

    /**
     * Colors of the D-pad, the round buttons and the Coin/start capsules. A
     * held control sinks (smaller, darker, a shorter shadow); `lit` tints
     * it too, only when the skin asks for it.
     */
    public struct Palette: Equatable, Sendable {
        public var ringTop, ringBottom, face, outline, mark, label: UInt32
        public var lit: UInt32?
        public var litLabel: UInt32
    }

    /** Where every part goes in each orientation; nil uses SkinLayout's automatic placement. */
    public var landscapePlacement: Placement?
    public var portraitPlacement: Placement?

    /** A box in the placement's canvas units, like an absolutely positioned div. */
    public struct Box: Equatable, Sendable {
        public var x, y, w, h: Double
        public init(x: Double, y: Double, w: Double, h: Double) {
            self.x = x; self.y = y; self.w = w; self.h = h
        }
    }

    /**
     * Where the parts go, in the units of `canvas`: the playable area (the
     * safe area) of the phone the skin was drawn for. On another screen the
     * boxes' positions stretch with it while the controls keep their shape
     * (circles stay round), and the game is fitted inside `screen`, whole.
     */
    public struct Placement: Equatable, Sendable {
        public var canvas: CGSize
        public var screen: Box
        public var dpad: Box
        public var buttons: Box
        public var coin: Box
        public var starts: Box
        public var header: Box
        /** The room's menu: a pill centered in its box. */
        public var menu: Box
        public var menuVertical: Bool
        /** Folds away after 3 s (meant for a menu over the picture). */
        public var menuHides: Bool
        /** The menu's round buttons, in canvas units (the room's own are 44). */
        public var menuButton: Double
        /** Coin and start capsules, in canvas units. */
        public var pill: CGSize
        public var label: Box?
    }

    /** The name in this language, or the English one. */
    public func name(_ lang: String) -> String { names[lang] ?? names["en"] ?? id }
}

public enum SkinError: Error, Equatable {
    case notJson
    case format(Int)
    case missing(String)
    case badValue(String)
}

extension PadSkin {
    /**
     * Reads one skin file. Unknown keys are ignored (newer files still
     * load); a wrong type or value refuses the whole file, so a broken
     * skin never half-draws. Numbers are clamped to their range.
     */
    public static func parse(_ data: Data) throws -> PadSkin {
        guard let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { throw SkinError.notJson }
        guard let format = root["format"] as? Int else { throw SkinError.missing("format") }
        guard format == Self.format else { throw SkinError.format(format) }
        guard let id = root["id"] as? String else { throw SkinError.missing("id") }
        guard isValidId(id), id != classicId else { throw SkinError.badValue("id") }
        guard let names = root["name"] as? [String: String], let en = names["en"], !en.isEmpty else { throw SkinError.missing("name.en") }
        guard let shell = root["shell"] as? [String: Any] else { throw SkinError.missing("shell") }
        let controls: Controls
        if let c = root["controls"] {
            guard let s = c as? String, let v = Controls(rawValue: s) else { throw SkinError.badValue("controls") }
            controls = v
        } else {
            controls = .dark
        }
        let screen = root["screen"] as? [String: Any] ?? [:]
        let decor = root["decor"] as? [String: Any] ?? [:]
        return PadSkin(
            id: id,
            names: names.mapValues { String($0.prefix(40)) },
            author: String((root["author"] as? String ?? "").prefix(60)),
            center: try color(shell, "center"),
            edge: try color(shell, "edge"),
            rim: try color(shell, "rim"),
            gloss: unit(shell["gloss"], 0.3),
            grain: unit(shell["grain"], 0.06),
            controls: controls,
            bezel: try color(screen, "bezel", default: 0x07080C),
            label: String((screen["label"] as? String ?? "").prefix(40)),
            rings: root["rings"] as? Bool ?? true,
            screws: root["screws"] as? Bool ?? true,
            landscape: try decors(decor["landscape"]),
            portrait: try decors(decor["portrait"]),
            backgroundPortrait: try picture((root["background"] as? [String: Any])?["portrait"]),
            backgroundLandscape: try picture((root["background"] as? [String: Any])?["landscape"]),
            menuStyle: try menuStyle((root["style"] as? [String: Any])?["menu"]),
            palette: try palette((root["style"] as? [String: Any])?["controls"], controls),
            design: try design((root["style"] as? [String: Any])?["controls"]),
            landscapePlacement: try placement((root["layout"] as? [String: Any])?["landscape"]),
            portraitPlacement: try placement((root["layout"] as? [String: Any])?["portrait"])
        )
    }

    private static func pillSize(_ v: Any?) throws -> CGSize {
        guard let v else { return SkinLayout.pill }
        guard let o = v as? [String: Any], let w = o["w"] as? Double, let h = o["h"] as? Double else { throw SkinError.badValue("layout.pill") }
        return CGSize(width: min(max(w, 44), 160), height: min(max(h, 28), 80))
    }

    /** A picture's file name: a plain name next to the skin file, never a path. */
    public static func isPictureName(_ name: String) -> Bool {
        let lower = name.lowercased()
        return !name.isEmpty && name.count <= 80 && !name.contains("/") && !name.contains("\\") && !name.hasPrefix(".")
            && (lower.hasSuffix(".png") || lower.hasSuffix(".jpg") || lower.hasSuffix(".jpeg"))
    }

    private static func picture(_ v: Any?) throws -> String? {
        guard let v else { return nil }
        guard let name = v as? String, isPictureName(name) else { throw SkinError.badValue("background") }
        return name
    }

    private static func design(_ v: Any?) throws -> ControlDesign {
        var d = ControlDesign()
        guard let o = v as? [String: Any] else { return d }
        func choice<T: RawRepresentable>(_ key: String, _ fallback: T) throws -> T where T.RawValue == String {
            guard let raw = o[key] else { return fallback }
            guard let s = raw as? String, let v = T(rawValue: s) else { throw SkinError.badValue("style.controls.\(key)") }
            return v
        }
        d.shape = try choice("shape", d.shape)
        d.labels = try choice("labels", d.labels)
        if let r = o["ring"] as? Double { d.ring = min(max(r, 0), 0.25) }
        d.dome = unit(o["dome"], d.dome)
        if let w = o["well"] {
            guard let wo = w as? [String: Any] else { throw SkinError.badValue("style.controls.well") }
            var well = Well()
            if let size = wo["size"] as? Double { well.size = min(max(size, 0), 0.5) }
            well.depth = unit(wo["depth"], well.depth)
            well.color = try color(wo, "color", default: well.color)
            d.well = well
        }
        if let pad = o["dpad"] {
            guard let po = pad as? [String: Any] else { throw SkinError.badValue("style.controls.dpad") }
            if let arm = po["arm"] as? Double { d.dpadArm = min(max(arm, 0.25), 0.6) }
            if let radius = po["radius"] as? Double { d.dpadRadius = min(max(radius, 0), 0.5) }
            if let raw = po["marks"] {
                guard let s = raw as? String, let m = DpadMarks(rawValue: s) else { throw SkinError.badValue("style.controls.dpad.marks") }
                d.dpadMarks = m
            }
        }
        return d
    }

    /** The tone's colors (after Kenney's Mobile Controls). */
    public static func tone(_ c: Controls) -> Palette {
        switch c {
        case .dark:
            return Palette(ringTop: 0x333341, ringBottom: 0x1E1E23, face: 0x222229, outline: 0x323240, mark: 0x4A4A5C, label: 0xF3F0FF, lit: nil, litLabel: 0xF3F0FF)
        case .light:
            return Palette(ringTop: 0xFFFFFF, ringBottom: 0xD8E6E9, face: 0xE5EEF0, outline: 0xCEDDE0, mark: 0xFFFFFF, label: 0x2A2A33, lit: nil, litLabel: 0x2A2A33)
        }
    }

    /** The colors the controls are drawn with. */
    public var colors: Palette { palette ?? Self.tone(controls) }

    private static func menuStyle(_ v: Any?) throws -> MenuStyle {
        var m = MenuStyle()
        guard let v else { return m }
        guard let o = v as? [String: Any] else { throw SkinError.badValue("style.menu") }
        m.fill = try color(o, "fill", default: m.fill)
        m.fillOpacity = unit(o["fillOpacity"], m.fillOpacity)
        m.border = try color(o, "border", default: m.border)
        m.borderOpacity = unit(o["borderOpacity"], m.borderOpacity)
        m.button = try color(o, "button", default: m.button)
        m.icon = try color(o, "icon", default: m.icon)
        m.active = try color(o, "active", default: m.active)
        m.activeButton = try color(o, "activeButton", default: m.activeButton)
        m.handle = try color(o, "handle", default: m.handle)
        return m
    }

    /** Any color left out keeps the tone's. */
    private static func palette(_ v: Any?, _ controls: Controls) throws -> Palette? {
        guard let v else { return nil }
        guard let o = v as? [String: Any] else { throw SkinError.badValue("style.controls") }
        let t = tone(controls)
        return Palette(
            ringTop: try color(o, "ringTop", default: t.ringTop), ringBottom: try color(o, "ringBottom", default: t.ringBottom),
            face: try color(o, "face", default: t.face), outline: try color(o, "outline", default: t.outline),
            mark: try color(o, "mark", default: t.mark), label: try color(o, "label", default: t.label),
            lit: o["lit"] == nil ? nil : try color(o, "lit"), litLabel: try color(o, "litLabel", default: o["label"] == nil ? t.litLabel : try color(o, "label"))
        )
    }

    private static func box(_ obj: [String: Any], _ key: String, required: Bool = true) throws -> Box? {
        guard let raw = obj[key] else {
            if required { throw SkinError.missing("layout.\(key)") }
            return nil
        }
        guard let b = raw as? [String: Any], let x = b["x"] as? Double, let y = b["y"] as? Double,
              let w = b["w"] as? Double, let h = b["h"] as? Double, w > 0, h > 0 else {
            throw SkinError.badValue("layout.\(key)")
        }
        return Box(x: x, y: y, w: w, h: h)
    }

    private static func placement(_ v: Any?) throws -> Placement? {
        guard let v else { return nil }
        guard let p = v as? [String: Any] else { throw SkinError.badValue("layout") }
        guard let c = p["canvas"] as? [String: Any], let cw = c["w"] as? Double, let ch = c["h"] as? Double,
              cw >= 100, ch >= 100, cw <= 4000, ch <= 4000 else { throw SkinError.badValue("layout.canvas") }
        let menu = p["menu"] as? [String: Any] ?? [:]
        let direction = menu["direction"] as? String ?? "row"
        guard direction == "row" || direction == "column" else { throw SkinError.badValue("layout.menu.direction") }
        return Placement(
            canvas: CGSize(width: cw, height: ch),
            screen: try box(p, "screen")!,
            dpad: try box(p, "dpad")!,
            buttons: try box(p, "buttons")!,
            coin: try box(p, "coin")!,
            starts: try box(p, "starts")!,
            header: try box(p, "header")!,
            menu: try box(p, "menu")!,
            menuVertical: direction == "column",
            menuHides: menu["hide"] as? Bool ?? false,
            menuButton: min(max(menu["size"] as? Double ?? 36, 28), 60),
            pill: try pillSize(p["pill"]),
            label: try box(p, "label", required: false)
        )
    }

    /** Lowercase letters, digits and dashes, 1-40 characters. */
    public static func isValidId(_ id: String) -> Bool {
        !id.isEmpty && id.count <= 40 && id.allSatisfy { ($0 >= "a" && $0 <= "z") || ($0 >= "0" && $0 <= "9") || $0 == "-" }
    }

    /** "#rrggbb" (or "rrggbb") as 0xRRGGBB. */
    public static func hex(_ s: String) -> UInt32? {
        let t = s.hasPrefix("#") ? String(s.dropFirst()) : s
        guard t.count == 6, t.allSatisfy(\.isHexDigit) else { return nil }
        return UInt32(t, radix: 16)
    }

    private static func color(_ obj: [String: Any], _ key: String, default value: UInt32? = nil) throws -> UInt32 {
        guard let raw = obj[key] else {
            if let value { return value }
            throw SkinError.missing(key)
        }
        guard let s = raw as? String, let c = hex(s) else { throw SkinError.badValue(key) }
        return c
    }

    private static func unit(_ v: Any?, _ fallback: Double) -> Double {
        guard let n = v as? Double else { return fallback }
        return min(max(n, 0), 1)
    }

    private static func decors(_ v: Any?) throws -> [Decor] {
        guard let v else { return [] }
        guard let list = v as? [[String: Any]] else { throw SkinError.badValue("decor") }
        // A skin is decoration, not a drawing program: a few shapes are enough.
        return try list.prefix(24).map { d in
            guard let s = d["shape"] as? String, let shape = Shape(rawValue: s) else { throw SkinError.badValue("decor.shape") }
            guard let x = d["x"] as? Double, let y = d["y"] as? Double, let w = d["w"] as? Double, let h = d["h"] as? Double else {
                throw SkinError.missing("decor.x/y/w/h")
            }
            return Decor(
                shape: shape,
                x: min(max(x, 0), 1), y: min(max(y, 0), 1),
                w: min(max(w, 0), 1), h: min(max(h, 0), 1),
                radius: min(max(d["radius"] as? Double ?? 8, 0), 60),
                fill: try color(d, "fill", default: 0xFFFFFF),
                opacity: unit(d["opacity"], 0.08),
                stroke: unit(d["stroke"], 0.16)
            )
        }
    }
}

/**
 * The skins this app can draw: the built-in files plus any installed
 * later, in the order given; a file that fails to read is skipped and a
 * repeated id keeps the first one.
 */
public struct SkinCatalog: Sendable {
    public private(set) var skins: [PadSkin] = []
    public private(set) var skipped: [String] = []

    /** A skin file and, for a skin in its own folder, that folder (for its pictures). */
    public struct File: Sendable {
        public var name: String
        public var data: Data
        public var folder: URL?
        public init(name: String, data: Data, folder: URL? = nil) {
            self.name = name; self.data = data; self.folder = folder
        }
    }

    public init(files: [(name: String, data: Data)]) {
        self.init(files: files.map { File(name: $0.name, data: $0.data) })
    }

    public init(files: [File]) {
        for f in files {
            guard var skin = try? PadSkin.parse(f.data) else {
                skipped.append(f.name)
                continue
            }
            skin.folder = f.folder
            // Pictures need the folder they live in.
            if f.folder == nil { skin.backgroundPortrait = nil; skin.backgroundLandscape = nil }
            if skins.contains(where: { $0.id == skin.id }) { continue }
            skins.append(skin)
        }
    }

    public func skin(_ id: String) -> PadSkin? { skins.first { $0.id == id } }

    /**
     * The saved choice if it still exists, else the default skin (Smoke),
     * else the first one; nil only without any skin (the plain pad then).
     */
    public func selected(_ store: KeyValueStore) -> PadSkin? {
        store.get(PadSkin.prefKey).flatMap(skin) ?? skin(PadSkin.defaultId) ?? skins.first
    }
}

/**
 * Where a skin puts the picture and the controls on a screen of this size.
 * The picture is always whole (never cropped) and as large as the controls
 * allow; the thumbs get the D-pad on the left and the action buttons in an
 * arc on the right; Coin and the start buttons sit under them.
 */
public struct SkinLayout: Equatable, Sendable {
    /** The whole picture at its display aspect (Picture › Size › Whole). */
    public var screen: CGRect
    /** The skin's screen frame (inside its bezel), which Fill covers; the same as `screen` on the automatic layout. */
    public var frame: CGRect = .zero
    public var dpad: CGRect
    public var faces: [CGRect]
    public var coin: CGRect
    public var starts: [CGRect]
    /** Where the room's name and the leave button go (portrait: a row above the picture). */
    public var header: CGRect
    public var leftRing: CGRect
    public var rightRing: CGRect
    /** Where the skin's label is centered; nil for none. */
    public var label: CGPoint?
    /** The room's menu: its pill is centered in this box. */
    public var menu: CGRect
    public var menuVertical: Bool
    public var menuHides: Bool
    /** The menu's round buttons. */
    public var menuButton: CGFloat = 36
    /** How much the pad's controls are scaled from the skin's own canvas (1 on the automatic layout). */
    public var scale: CGFloat = 1

    public static let pill = CGSize(width: 58, height: 34)

    /**
     * `size` is the whole screen (the shell fills it), `insets` its safe
     * area; `aspect` is the game's width / height; `buttons` 1-6 and
     * `starts` 1-4 are the room's action and start buttons.
     */
    public static func compute(
        size: CGSize, insets: (top: CGFloat, left: CGFloat, bottom: CGFloat, right: CGFloat),
        landscape: Bool, aspect: CGFloat, buttons: Int, starts: Int, placement: PadSkin.Placement? = nil
    ) -> SkinLayout {
        let a = min(max(aspect, 0.5), 2.5)
        let n = min(max(buttons, 1), 6)
        let s = min(max(starts, 1), 4)
        if let p = placement {
            return placed(p, size, insets, landscape, a, n, s)
        }
        return landscape
            ? landscapeLayout(size, insets, a, n, s)
            : portraitLayout(size, insets, a, n, s)
    }

    /** Arc offsets in units of the button spacing, in the order of the buttons (1 first). */
    public static func arc(_ n: Int) -> [CGPoint] {
        switch n {
        case 1: return [CGPoint(x: 0, y: 0)]
        case 2: return [CGPoint(x: -0.55, y: 0.45), CGPoint(x: 0.55, y: -0.45)]
        case 3: return [CGPoint(x: -1.05, y: 0.1), CGPoint(x: 0, y: -0.17), CGPoint(x: 1.05, y: 0.1)]
        case 4: return [CGPoint(x: -0.95, y: 0), CGPoint(x: 0, y: 0.95), CGPoint(x: 0, y: -0.95), CGPoint(x: 0.95, y: 0)]
        default:
            let six = [CGPoint(x: -1.05, y: -0.35), CGPoint(x: 0, y: -0.62), CGPoint(x: 1.05, y: -0.35),
                       CGPoint(x: -1.05, y: 0.72), CGPoint(x: 0, y: 0.45), CGPoint(x: 1.05, y: 0.72)]
            return Array(six.prefix(n))
        }
    }

    /** The arc's width and height for button size 1 (spacing is 1.08 of the size). */
    private static func arcSpan(_ n: Int) -> CGSize {
        let pts = arc(n)
        let g: CGFloat = 1.08
        let xs = pts.map(\.x), ys = pts.map(\.y)
        return CGSize(width: (xs.max()! - xs.min()!) * g + 1, height: (ys.max()! - ys.min()!) * g + 1)
    }

    private static func faceRects(_ n: Int, center: CGPoint, d: CGFloat) -> [CGRect] {
        let pts = arc(n)
        let g = d * 1.08
        // Center the arc's box on the zone (the six-button arc is taller below).
        let ys = pts.map(\.y)
        let mid = (ys.max()! + ys.min()!) / 2
        return pts.map { p in
            CGRect(x: center.x + p.x * g - d / 2, y: center.y + (p.y - mid) * g - d / 2, width: d, height: d)
        }
    }

    /** Pills in rows of `perRow`, centered on `center.x`, the first row's top at `top`. */
    private static func pills(_ count: Int, centerX: CGFloat, top: CGFloat, perRow: Int, gap: CGFloat) -> [CGRect] {
        let p = pill
        return (0..<count).map { i in
            let row = i / perRow
            let inRow = min(perRow, count - row * perRow)
            let col = i % perRow
            let width = CGFloat(inRow) * p.width + CGFloat(inRow - 1) * gap
            return CGRect(x: centerX - width / 2 + CGFloat(col) * (p.width + gap), y: top + CGFloat(row) * (p.height + gap), width: p.width, height: p.height)
        }
    }

    /**
     * The playable area: the safe area, reaching a little into the rounded
     * corners' side insets in landscape (the controls sit beside the
     * camera cutout, never under it).
     */
    public static func playArea(_ size: CGSize, _ ins: (top: CGFloat, left: CGFloat, bottom: CGFloat, right: CGFloat), landscape: Bool) -> CGRect {
        let top = max(ins.top, 8), bottom = max(ins.bottom, 8)
        let left = landscape ? max(ins.left * 0.45, 8) : ins.left
        let right = landscape ? max(ins.right * 0.45, 8) : ins.right
        return CGRect(x: left, y: top, width: size.width - left - right, height: size.height - top - bottom)
    }

    /** A skin's own placement, mapped from its canvas to this screen's playable area. */
    private static func placed(_ p: PadSkin.Placement, _ size: CGSize, _ ins: (top: CGFloat, left: CGFloat, bottom: CGFloat, right: CGFloat), _ landscape: Bool, _ a: CGFloat, _ n: Int, _ s: Int) -> SkinLayout {
        let area = playArea(size, ins, landscape: landscape)
        let sx = area.width / p.canvas.width, sy = area.height / p.canvas.height
        // Controls keep their shape: they scale by the smaller factor, a bit less on big tablets.
        let k = min(sx, sy, 1.5)
        /** A box stretched to this screen (a region). */
        func region(_ b: PadSkin.Box) -> CGRect {
            CGRect(x: area.minX + b.x * sx, y: area.minY + b.y * sy, width: b.w * sx, height: b.h * sy)
        }
        /** A box's center on this screen, with its size scaled evenly (a control). */
        func control(_ b: PadSkin.Box) -> CGRect {
            let c = CGPoint(x: area.minX + (b.x + b.w / 2) * sx, y: area.minY + (b.y + b.h / 2) * sy)
            return CGRect(x: c.x - b.w * k / 2, y: c.y - b.h * k / 2, width: b.w * k, height: b.h * k)
        }
        // The game, whole (no corner cut), as large as its box allows; the bezel is drawn around it, outside the box.
        let dbox = control(p.dpad)
        let dd = min(dbox.width, dbox.height)
        let dpad = CGRect(x: dbox.midX - dd / 2, y: dbox.midY - dd / 2, width: dd, height: dd)
        let bbox = control(p.buttons)
        let span = arcSpan(n)
        let d = max(36, min(bbox.width / span.width, bbox.height / span.height, 76 * k))
        let faces = faceRects(n, center: CGPoint(x: bbox.midX, y: bbox.midY), d: d)
        let pk = min(max(k, 1), 1.25)
        let pw = p.pill.width * pk, ph = p.pill.height * pk
        let cbox = control(p.coin)
        let coin = CGRect(x: cbox.midX - pw / 2, y: min(max(cbox.midY - ph / 2, area.minY), area.maxY - ph), width: pw, height: ph)
        let sbox = control(p.starts)
        let gap: CGFloat = 8
        // Per row as the designer drew it on the canvas, whatever this screen scales to.
        let perRow = max(1, min(s, Int((p.starts.w + gap) / (p.pill.width + gap))))
        let rows = (s + perRow - 1) / perRow
        let rowsH = CGFloat(rows) * ph + CGFloat(rows - 1) * gap
        // Pills never shrink below a finger's size; a group that grew past the area moves back in.
        let startsTop = min(max(sbox.midY - rowsH / 2, area.minY), area.maxY - rowsH)
        var starts = (0..<s).map { i -> CGRect in
            let row = i / perRow, col = i % perRow
            let inRow = min(perRow, s - row * perRow)
            let width = CGFloat(inRow) * pw + CGFloat(inRow - 1) * gap
            return CGRect(x: sbox.midX - width / 2 + CGFloat(col) * (pw + gap), y: startsTop + CGFloat(row) * (ph + gap), width: pw, height: ph)
        }
        var coinAt = coin
        // On a narrow screen Coin and the starts may meet: the starts move aside, else Coin does.
        if starts.contains(where: { $0.intersects(coinAt) }) {
            let left = starts.map(\.minX).min()!, right = starts.map(\.maxX).max()!
            let shift = coinAt.maxX + gap - left
            if coinAt.midX < (left + right) / 2 && right + shift <= area.maxX {
                starts = starts.map { $0.offsetBy(dx: shift, dy: 0) }
            } else if left - gap - pw >= area.minX {
                coinAt.origin.x = left - gap - pw
            }
        }
        // Controls keep a finger's size, so on a small screen they may reach the picture's box:
        // the box gives way on that side (the least it can), then the game fits in what is left.
        var inner = region(p.screen)
        for c in [dpad, coinAt] + faces + starts {
            let near = c.insetBy(dx: -12.5, dy: -12.5)
            guard near.intersects(inner) else { continue }
            let cuts = [
                (near.maxX - inner.minX, CGRect(x: near.maxX, y: inner.minY, width: inner.maxX - near.maxX, height: inner.height)),
                (inner.maxX - near.minX, CGRect(x: inner.minX, y: inner.minY, width: near.minX - inner.minX, height: inner.height)),
                (near.maxY - inner.minY, CGRect(x: inner.minX, y: near.maxY, width: inner.width, height: inner.maxY - near.maxY)),
                (inner.maxY - near.minY, CGRect(x: inner.minX, y: inner.minY, width: inner.width, height: near.minY - inner.minY)),
            ]
            if let best = cuts.filter({ $0.1.width > 0 && $0.1.height > 0 }).min(by: { $0.0 < $1.0 }) { inner = best.1 }
        }
        var gw = inner.width, gh = gw / a
        if gh > inner.height {
            gh = inner.height
            gw = gh * a
        }
        let screen = CGRect(x: inner.midX - gw / 2, y: inner.midY - gh / 2, width: gw, height: gh)
        // Capsules keep a finger's size on small screens, so they may reach the picture: move them clear of it.
        let clear = screen.insetBy(dx: -12, dy: -12)
        func away(_ group: [CGRect]) -> [CGRect] {
            let box = group.dropFirst().reduce(group[0]) { $0.union($1) }
            guard box.intersects(clear) else { return group }
            let dx = box.midX > screen.midX ? min(clear.maxX - box.minX, area.maxX - box.maxX) : max(clear.minX - box.maxX, area.minX - box.minX)
            return group.map { $0.offsetBy(dx: dx, dy: 0) }
        }
        starts = away(starts)
        if starts.contains(where: { $0.intersects(clear) }) && s > 1 {
            // Still no room beside the picture: one capsule per row, beside it.
            let h = CGFloat(s) * ph + CGFloat(s - 1) * gap
            let x = sbox.midX > screen.midX ? min(clear.maxX, area.maxX - pw) : max(clear.minX - pw, area.minX)
            let top = min(max(sbox.maxY - h, area.minY), area.maxY - h)
            starts = (0..<s).map { CGRect(x: x, y: top + CGFloat($0) * (ph + gap), width: pw, height: ph) }
        }
        coinAt = away([coinAt])[0]
        let faceBox = faces.dropFirst().reduce(faces[0]) { $0.union($1) }
        // The soft ring behind the buttons stays on screen.
        let ringR = max(max(faceBox.width, faceBox.height) / 2 + 6, min(max(faceBox.width, faceBox.height) * 0.62, faceBox.midX - area.minX, area.maxX - faceBox.midX))
        let label = p.label.map { region($0) }
        return SkinLayout(
            screen: screen, frame: inner, dpad: dpad, faces: faces, coin: coinAt, starts: starts,
            header: region(p.header),
            leftRing: dpad.insetBy(dx: -dd * 0.1, dy: -dd * 0.1),
            rightRing: CGRect(x: faceBox.midX - ringR, y: faceBox.midY - ringR, width: ringR * 2, height: ringR * 2),
            label: label.map { CGPoint(x: $0.midX, y: $0.midY) },
            menu: region(p.menu),
            menuVertical: p.menuVertical, menuHides: p.menuHides,
            menuButton: max(28, p.menuButton * min(k, 1.3)),
            scale: k
        )
    }

    private static func landscapeLayout(_ size: CGSize, _ ins: (top: CGFloat, left: CGFloat, bottom: CGFloat, right: CGFloat), _ a: CGFloat, _ n: Int, _ s: Int) -> SkinLayout {
        let W = size.width, H = size.height
        let top = max(ins.top, 10), bottom = H - max(ins.bottom, 10)
        // The controls may reach into the rounded corners' safe area a bit.
        let leftEdge = max(ins.left * 0.45, 12), rightEdge = W - max(ins.right * 0.45, 12)
        let sideMin = max(W * 0.2, 150)
        let bezel: CGFloat = 8
        let gh = max(60, min(bottom - top - 2 * bezel, (W - 2 * sideMin - 2 * bezel) / a))
        let gw = gh * a
        let screen = CGRect(x: (W - gw) / 2, y: top + (bottom - top - gh) / 2, width: gw, height: gh)
        let lz = CGRect(x: leftEdge, y: top, width: screen.minX - bezel - 8 - leftEdge, height: bottom - top)
        let rz = CGRect(x: screen.maxX + bezel + 8, y: top, width: rightEdge - screen.maxX - bezel - 8, height: bottom - top)
        let startRows = s > 2 ? 2 : 1
        let pillsH = CGFloat(startRows) * pill.height + CGFloat(startRows - 1) * 6
        let pillsTop = bottom - pillsH
        let controlsH = pillsTop - 12 - top
        let cy = top + controlsH / 2 + 4
        let dd = max(80, min(lz.width * 0.9, controlsH * 0.62, 170))
        let span = arcSpan(n)
        let d = max(36, min(64, (rz.width - 8) / span.width, controlsH * 0.9 / span.height))
        let dpad = CGRect(x: lz.midX - dd / 2, y: cy - dd / 2, width: dd, height: dd)
        let faces = faceRects(n, center: CGPoint(x: rz.midX, y: cy), d: d)
        let coin = CGRect(x: lz.midX - pill.width / 2, y: pillsTop, width: pill.width, height: pill.height)
        let starts = pills(s, centerX: rz.midX, top: pillsTop, perRow: 2, gap: 8)
        let ringR = max(dd, span.width * d) * 0.58
        return SkinLayout(
            screen: screen, frame: screen, dpad: dpad, faces: faces, coin: coin, starts: starts,
            header: CGRect(x: leftEdge, y: top, width: 44, height: 44),
            leftRing: CGRect(x: dpad.midX - dd * 0.6, y: cy - dd * 0.6, width: dd * 1.2, height: dd * 1.2),
            rightRing: CGRect(x: rz.midX - ringR, y: cy - ringR, width: ringR * 2, height: ringR * 2),
            label: nil,
            menu: CGRect(x: screen.minX, y: screen.minY, width: screen.width, height: 56),
            menuVertical: false, menuHides: true
        )
    }

    private static func portraitLayout(_ size: CGSize, _ ins: (top: CGFloat, left: CGFloat, bottom: CGFloat, right: CGFloat), _ a: CGFloat, _ n: Int, _ s: Int) -> SkinLayout {
        let W = size.width, H = size.height
        let top = max(ins.top, 10), bottom = H - max(ins.bottom, 10)
        let header = CGRect(x: 12, y: top, width: W - 24, height: 44)
        let bezel: CGFloat = 8
        var gw = W - 2 * (bezel + 6)
        var gh = gw / a
        let maxH = (bottom - top) * 0.46
        if gh > maxH {
            gh = maxH
            gw = gh * a
        }
        let screen = CGRect(x: (W - gw) / 2, y: header.maxY + bezel, width: gw, height: gh)
        let pillsTop = bottom - pill.height - 8
        let padTop = screen.maxY + bezel + 22
        let padH = max(120, pillsTop - 14 - padTop)
        let cy = padTop + padH / 2
        let zoneW = W / 2 - 14
        let dd = max(100, min(170, zoneW * 0.9, padH * 0.85))
        let span = arcSpan(n)
        let d = max(40, min(76, (zoneW - 6) / span.width, padH * 0.9 / span.height))
        let lcx = W * 0.26, rcx = W * 0.73
        let dpad = CGRect(x: lcx - dd / 2, y: cy - dd / 2, width: dd, height: dd)
        let faces = faceRects(n, center: CGPoint(x: rcx, y: cy), d: d)
        // Coin first, then the starts, in one row.
        let row = pills(1 + s, centerX: W / 2, top: pillsTop, perRow: 1 + s, gap: s > 2 ? 8 : 18)
        let ringR = max(dd, span.width * d) * 0.58
        return SkinLayout(
            screen: screen, frame: screen, dpad: dpad, faces: faces, coin: row[0], starts: Array(row.dropFirst()),
            header: header,
            leftRing: CGRect(x: lcx - dd * 0.6, y: cy - dd * 0.6, width: dd * 1.2, height: dd * 1.2),
            rightRing: CGRect(x: rcx - ringR, y: cy - ringR, width: ringR * 2, height: ringR * 2),
            label: CGPoint(x: screen.midX, y: screen.maxY + bezel + 9),
            menu: CGRect(x: screen.minX, y: screen.minY, width: screen.width, height: 56),
            menuVertical: false, menuHides: true
        )
    }
}
