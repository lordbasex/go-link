// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import CoreGraphics
import Foundation

/**
 * How this phone draws the game: a choice of each player, never sent to
 * the device or to the other players (the website's picture settings,
 * frontend/apps/web/src/picture/settings.ts, with the same keys and
 * values). The Android app keeps the same in :core Picture.kt.
 */
public enum PictureStyle: String, CaseIterable, Sendable {
    case smooth, sharp, crt, edges

    /** The value the shaders get (u_style). */
    public var code: Float {
        switch self {
        case .smooth: return 0
        case .sharp: return 1
        case .crt: return 2
        case .edges: return 3
        }
    }
}

/** What fills the sides of the picture. */
public enum PictureBands: String, CaseIterable, Sendable {
    case black, ambient, frame

    /** The value the shaders get (u_bands). */
    public var code: Float {
        switch self {
        case .black: return 0
        case .ambient: return 1
        case .frame: return 2
        }
    }
}

public struct PictureSettings: Equatable, Sendable {
    public static let styleKey = "go-link.picture-style"
    public static let bandsKey = "go-link.picture-bands"
    /** The defaults, in one place so they are easy to change. */
    public static let defaultStyle = PictureStyle.smooth
    public static let defaultBands = PictureBands.ambient
    public static let defaults = PictureSettings(style: defaultStyle, bands: defaultBands)

    public var style: PictureStyle
    public var bands: PictureBands

    public init(style: PictureStyle, bands: PictureBands) {
        self.style = style
        self.bands = bands
    }

    /** Stored values; anything unknown is the default. */
    public static func parse(style: String?, bands: String?) -> PictureSettings {
        PictureSettings(
            style: style.flatMap(PictureStyle.init(rawValue:)) ?? defaultStyle,
            bands: bands.flatMap(PictureBands.init(rawValue:)) ?? defaultBands
        )
    }

    /** The viewer's own choice, as far as it goes (unknown values are dropped). */
    public struct Saved: Equatable, Sendable {
        public var style: PictureStyle?
        public var bands: PictureBands?

        public init(style: PictureStyle? = nil, bands: PictureBands? = nil) {
            self.style = style
            self.bands = bands
        }

        public var isEmpty: Bool { style == nil && bands == nil }
    }

    public static func readSaved(_ store: KeyValueStore) -> Saved {
        Saved(style: store.get(styleKey).flatMap(PictureStyle.init(rawValue:)), bands: store.get(bandsKey).flatMap(PictureBands.init(rawValue:)))
    }

    /** Who wins (the website's resolvePicture): the viewer's own choice, then the room's default, then the app's. */
    public static func resolve(_ saved: Saved, room: PictureSettings?) -> PictureSettings {
        let base = room ?? defaults
        return PictureSettings(style: saved.style ?? base.style, bands: saved.bands ?? base.bands)
    }

    /** What this viewer sees in a room with that default (nil: the app's). */
    public static func read(_ store: KeyValueStore, room: PictureSettings? = nil) -> PictureSettings {
        resolve(readSaved(store), room: room)
    }

    /** Keeps the viewer's choice (both values, like the website). */
    public func write(_ store: KeyValueStore) {
        store.set(Self.styleKey, style.rawValue)
        store.set(Self.bandsKey, bands.rawValue)
    }

    /** Forgets the viewer's choice: the room's default, or the app's, applies again. */
    public static func clear(_ store: KeyValueStore) {
        store.set(styleKey, nil)
        store.set(bandsKey, nil)
    }

    /**
     * Whether Game settings offers "Use the room's default": the room has
     * one, and the viewer's own choice shows something else.
     */
    public static func offersRoomDefault(_ saved: Saved, room: PictureSettings?) -> Bool {
        guard let room, !saved.isEmpty else { return false }
        return resolve(saved, room: room) != room
    }
}

/**
 * Where the picture goes inside the area the renderer draws (a port of
 * the website's layout.ts): the largest rectangle with the game's display
 * aspect that fits, centered. It never crops.
 */
public enum PictureLayout {
    public struct Rect: Equatable, Sendable {
        public var x: Double
        public var y: Double
        public var w: Double
        public var h: Double

        public init(x: Double, y: Double, w: Double, h: Double) {
            self.x = x
            self.y = y
            self.w = w
            self.h = h
        }
    }

    /** Largest enlargement of the smooth edges texture, per axis. */
    public static let maxPrescale = 8

    /** The largest rectangle of the given aspect (width / height) inside w x h, centered. */
    public static func fitRect(_ w: Double, _ h: Double, aspect: Double, inset: Double = 0) -> Rect {
        let aw = max(0, w - 2 * inset)
        let ah = max(0, h - 2 * inset)
        guard aw > 0, ah > 0, aspect > 0, aspect.isFinite else { return Rect(x: w / 2, y: h / 2, w: 0, h: 0) }
        var pw = aw
        var ph = aw / aspect
        if ph > ah {
            ph = ah
            pw = ah * aspect
        }
        return Rect(x: (w - pw) / 2, y: (h - ph) / 2, w: pw, h: ph)
    }

    /** The Frame sides' bezel, in drawable pixels: thin, always visible. */
    public static func frameInset(_ w: Double, _ h: Double, scale: Double) -> Double {
        (min(max(min(w, h) * 0.035, 8 * scale), 36 * scale)).rounded()
    }

    /** Output pixels per source pixel, per axis. */
    public static func scaleOf(_ rect: Rect, srcW: Double, srcH: Double) -> (x: Double, y: Double) {
        (srcW > 0 ? rect.w / srcW : 1, srcH > 0 ? rect.h / srcH : 1)
    }

    /** The smooth edges texture's integer enlargement along one axis. */
    public static func prescale(_ rectLength: Double, _ srcLength: Double) -> Int {
        guard srcLength > 0, rectLength.isFinite else { return 1 }
        return min(maxPrescale, max(1, Int((rectLength / srcLength).rounded(.up))))
    }

    /** The comparison line stays a little inside the picture. */
    public static func clampSplit(_ v: Double) -> Double {
        min(0.98, max(0.02, v.isFinite ? v : 0.5))
    }
}
