// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import CoreGraphics
import Foundation

/**
 * Checks a skin pasted as text before it is installed: the file must parse
 * (with the line and column of a JSON mistake), its id must not be a
 * built-in skin's, and its layout is run on phones and tablets in both
 * orientations with the same rules as the skin tests (nothing off screen,
 * on the picture, overlapping or smaller than a finger). Layout problems
 * and missing background pictures are warnings: the skin still installs.
 */
public enum SkinCheck {
    /** Why a pasted skin cannot be installed. */
    public enum Failure: Equatable, Sendable {
        case empty
        case tooLarge
        /** Not JSON; the place of the mistake when the parser says it. */
        case notJson(line: Int?, column: Int?)
        case format(Int)
        case missing(String)
        case badValue(String)
        /** The id belongs to a skin that comes with the app. */
        case builtInId(String)
    }

    /** A part of the pad a warning is about. */
    public enum Part: Equatable, Sendable {
        case dpad, coin, button(Int), start(Int), menu
    }

    public enum Problem: Equatable, Sendable {
        case offScreen
        case onPicture
        case overlaps(Part)
        case tooSmall
    }

    public enum Warning: Equatable, Sendable {
        case layout(landscape: Bool, part: Part, problem: Problem)
        /** Background pictures the pasted file names (a pasted file brings no pictures). */
        case missingPictures([String])
    }

    public struct Ready: Sendable {
        public var skin: PadSkin
        /** The file as pasted (installed as is). */
        public var data: Data
        public var warnings: [Warning]
        /** An installed custom skin already has this id: installing replaces it. */
        public var replaces: Bool
    }

    public enum Outcome: Sendable {
        case failed(Failure)
        case ready(Ready)
    }

    /** The largest skin file accepted (the app reads at most this). */
    public static let maxBytes = 64 * 1024

    public static func check(_ text: String, builtIns: Set<String>, installed: Set<String>) -> Outcome {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return .failed(.empty) }
        var data = Data(trimmed.utf8)
        guard data.count <= maxBytes else { return .failed(.tooLarge) }
        do {
            _ = try JSONSerialization.jsonObject(with: data)
        } catch {
            // Notes and the keyboard turn " into “ ”: straight quotes again, if that is all.
            let straight = straightQuotes(trimmed)
            if straight != trimmed, (try? JSONSerialization.jsonObject(with: Data(straight.utf8))) != nil {
                data = Data(straight.utf8)
            } else {
                let place = jsonErrorPlace(error, in: trimmed)
                return .failed(.notJson(line: place?.line, column: place?.column))
            }
        }
        let skin: PadSkin
        do {
            skin = try PadSkin.parse(data)
        } catch let e as SkinError {
            switch e {
            case .notJson: return .failed(.notJson(line: nil, column: nil))
            case .format(let v): return .failed(.format(v))
            case .missing(let key): return .failed(.missing(key))
            case .badValue(let key): return .failed(.badValue(key))
            }
        } catch {
            return .failed(.notJson(line: nil, column: nil))
        }
        guard !builtIns.contains(skin.id) else { return .failed(.builtInId(skin.id)) }
        var warnings = layoutWarnings(skin)
        let pictures = [skin.backgroundPortrait, skin.backgroundLandscape].compactMap { $0 }
        if !pictures.isEmpty { warnings.append(.missingPictures(Array(Set(pictures)).sorted())) }
        return .ready(Ready(skin: skin, data: data, warnings: warnings, replaces: installed.contains(skin.id)))
    }

    /**
     * The screens a skin is checked on, phones and tablets with their safe
     * areas (top, left, bottom, right): docs/skins/screens.json, portrait and
     * landscape (SkinInstallTests checks the two match).
     */
    static let screens: [(CGSize, (CGFloat, CGFloat, CGFloat, CGFloat))] = [
        (CGSize(width: 375, height: 667), (20, 0, 0, 0)), // iPhone SE (2nd, 3rd gen.)
        (CGSize(width: 667, height: 375), (0, 0, 0, 0)), // iPhone SE (2nd, 3rd gen.)
        (CGSize(width: 375, height: 812), (50, 0, 34, 0)), // iPhone 12 mini · 13 mini
        (CGSize(width: 812, height: 375), (0, 50, 21, 50)), // iPhone 12 mini · 13 mini
        (CGSize(width: 375, height: 812), (44, 0, 34, 0)), // iPhone 11 Pro
        (CGSize(width: 812, height: 375), (0, 44, 21, 44)), // iPhone 11 Pro
        (CGSize(width: 414, height: 896), (48, 0, 34, 0)), // iPhone 11
        (CGSize(width: 896, height: 414), (0, 48, 21, 48)), // iPhone 11
        (CGSize(width: 414, height: 896), (44, 0, 34, 0)), // iPhone 11 Pro Max
        (CGSize(width: 896, height: 414), (0, 44, 21, 44)), // iPhone 11 Pro Max
        (CGSize(width: 390, height: 844), (47, 0, 34, 0)), // iPhone 12 · 12 Pro · 13 · 13 Pro · 14 · 16e
        (CGSize(width: 844, height: 390), (0, 47, 21, 47)), // iPhone 12 · 12 Pro · 13 · 13 Pro · 14 · 16e
        (CGSize(width: 428, height: 926), (47, 0, 34, 0)), // iPhone 12 Pro Max · 13 Pro Max · 14 Plus
        (CGSize(width: 926, height: 428), (0, 47, 21, 47)), // iPhone 12 Pro Max · 13 Pro Max · 14 Plus
        (CGSize(width: 393, height: 852), (59, 0, 34, 0)), // iPhone 14 Pro · 15 · 15 Pro · 16
        (CGSize(width: 852, height: 393), (0, 59, 21, 59)), // iPhone 14 Pro · 15 · 15 Pro · 16
        (CGSize(width: 430, height: 932), (59, 0, 34, 0)), // iPhone 14 Pro Max · 15 Plus · 15 Pro Max · 16 Plus
        (CGSize(width: 932, height: 430), (0, 59, 21, 59)), // iPhone 14 Pro Max · 15 Plus · 15 Pro Max · 16 Plus
        (CGSize(width: 402, height: 874), (62, 0, 34, 0)), // iPhone 16 Pro · 17 · 17 Pro
        (CGSize(width: 874, height: 402), (0, 62, 21, 62)), // iPhone 16 Pro · 17 · 17 Pro
        (CGSize(width: 440, height: 956), (62, 0, 34, 0)), // iPhone 16 Pro Max · 17 Pro Max
        (CGSize(width: 956, height: 440), (0, 62, 21, 62)), // iPhone 16 Pro Max · 17 Pro Max
        (CGSize(width: 420, height: 912), (68, 0, 34, 0)), // iPhone Air
        (CGSize(width: 912, height: 420), (0, 68, 21, 68)), // iPhone Air
        (CGSize(width: 820, height: 1180), (24, 0, 20, 0)), // iPad
        (CGSize(width: 1180, height: 820), (24, 0, 20, 0)), // iPad
        (CGSize(width: 360, height: 640), (24, 0, 0, 0)), // Android 360 × 640 (16:9)
        (CGSize(width: 640, height: 360), (0, 0, 0, 0)), // Android 360 × 640 (16:9)
        (CGSize(width: 360, height: 760), (24, 0, 48, 0)), // Android 360 × 760
        (CGSize(width: 760, height: 360), (24, 0, 0, 48)), // Android 360 × 760
        (CGSize(width: 393, height: 851), (24, 0, 48, 0)), // Android 393 × 851
        (CGSize(width: 851, height: 393), (24, 0, 0, 48)), // Android 393 × 851
        (CGSize(width: 412, height: 915), (24, 0, 48, 0)), // Android 412 × 915
        (CGSize(width: 915, height: 412), (24, 0, 0, 48)), // Android 412 × 915
        (CGSize(width: 411, height: 731), (24, 0, 48, 0)), // Android 411 × 731 (16:9)
        (CGSize(width: 731, height: 411), (24, 0, 0, 48)), // Android 411 × 731 (16:9)
        (CGSize(width: 448, height: 997), (24, 0, 48, 0)), // Android 448 × 997
        (CGSize(width: 997, height: 448), (24, 0, 0, 48)), // Android 448 × 997
        (CGSize(width: 461, height: 998), (24, 0, 48, 0)), // Android 461 × 998
        (CGSize(width: 998, height: 461), (24, 0, 0, 48)), // Android 461 × 998
        (CGSize(width: 690, height: 829), (24, 0, 48, 0)), // Android foldable 690 × 829
        (CGSize(width: 829, height: 690), (24, 0, 0, 48)), // Android foldable 690 × 829
        (CGSize(width: 800, height: 1280), (24, 0, 48, 0)), // Android tablet 800 × 1280
        (CGSize(width: 1280, height: 800), (24, 0, 48, 0)), // Android tablet 800 × 1280
    ]

    /**
     * The skin's own layout (a skin without one uses the automatic layout,
     * which is always fine) on every screen, game shape and button count;
     * each distinct problem is reported once.
     */
    static func layoutWarnings(_ skin: PadSkin) -> [Warning] {
        var found: [Warning] = []
        func add(_ w: Warning) { if !found.contains(w) { found.append(w) } }
        for (size, ins) in screens {
            let landscape = size.width > size.height
            guard let placement = landscape ? skin.landscapePlacement : skin.portraitPlacement else { continue }
            for aspect in [4.0 / 3, 3.0 / 4, 384.0 / 224] as [CGFloat] {
                for buttons in [2, 4, 6] {
                    for starts in [1, 2, 4] {
                        let l = SkinLayout.compute(size: size, insets: ins, landscape: landscape, aspect: aspect, buttons: buttons, starts: starts, placement: placement)
                        var parts: [(Part, CGRect)] = [(.dpad, l.dpad), (.coin, l.coin)]
                        parts += l.faces.enumerated().map { (.button($0.offset + 1), $0.element) }
                        parts += l.starts.enumerated().map { (.start($0.offset + 1), $0.element) }
                        let bounds = CGRect(origin: .zero, size: size)
                        for (part, r) in parts {
                            if !bounds.insetBy(dx: -0.5, dy: -0.5).contains(r) { add(.layout(landscape: landscape, part: part, problem: .offScreen)) }
                            if r.intersects(l.screen.insetBy(dx: -4, dy: -4)) || r.intersects(l.frame) { add(.layout(landscape: landscape, part: part, problem: .onPicture)) }
                            if min(r.width, r.height) < 34 { add(.layout(landscape: landscape, part: part, problem: .tooSmall)) }
                        }
                        for i in parts.indices {
                            for j in parts.indices where j > i && parts[i].1.intersects(parts[j].1) {
                                add(.layout(landscape: landscape, part: parts[i].0, problem: .overlaps(parts[j].0)))
                            }
                        }
                        if !l.menuHides && l.menu.intersects(l.screen) {
                            add(.layout(landscape: landscape, part: .menu, problem: .onPicture))
                        }
                    }
                }
            }
        }
        // A handful is enough to fix a skin; hundreds would only bury them.
        return Array(found.prefix(8))
    }

    /** Typographic quotes (“ ” „ ‘ ’) as straight ones. */
    static func straightQuotes(_ text: String) -> String {
        text.replacingOccurrences(of: "[\u{201C}\u{201D}\u{201E}]", with: "\"", options: .regularExpression)
            .replacingOccurrences(of: "[\u{2018}\u{2019}]", with: "'", options: .regularExpression)
    }

    /** Where Foundation's JSON parser says the mistake is (line and column, 1-based). */
    static func jsonErrorPlace(_ error: Error, in text: String) -> (line: Int, column: Int)? {
        let info = (error as NSError).userInfo
        let text2 = [info[NSDebugDescriptionErrorKey] as? String, (info[NSUnderlyingErrorKey] as? NSError)?.userInfo[NSDebugDescriptionErrorKey] as? String]
            .compactMap { $0 }.joined(separator: " ")
        if let m = text2.range(of: #"line (\d+), column (\d+)"#, options: .regularExpression) {
            let nums = text2[m].split(whereSeparator: { !$0.isNumber }).compactMap { Int($0) }
            if nums.count == 2 { return (nums[0], nums[1]) }
        }
        if let m = text2.range(of: #"character (\d+)"#, options: .regularExpression),
           let offset = Int(text2[m].filter(\.isNumber)) {
            var line = 1
            var column = 1
            for (i, ch) in text.utf16.enumerated() {
                if i >= offset { break }
                if ch == 10 { line += 1; column = 1 } else { column += 1 }
            }
            return (line, column)
        }
        return nil
    }
}

/**
 * Installed skins in a folder (the app's Documents/Skins): a pasted skin is
 * saved as "skin-<id>.json"; removing a skin removes every file or folder
 * that holds that id.
 */
public enum SkinInstaller {
    public static func fileName(_ id: String) -> String { "skin-\(id).json" }

    /** The skin ids installed in `dir` (bare files and folders with a skin.json). */
    public static func installedIds(in dir: URL) -> Set<String> {
        Set(entries(in: dir).map(\.id))
    }

    /** Saves the file; an installed skin with the same id is replaced. */
    @discardableResult
    public static func install(_ data: Data, id: String, into dir: URL) throws -> URL {
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        for e in entries(in: dir) where e.id == id { try? FileManager.default.removeItem(at: e.url) }
        let url = dir.appendingPathComponent(fileName(id))
        try data.write(to: url, options: .atomic)
        return url
    }

    /** Removes the installed skin with this id (its file, or its folder with the pictures). */
    public static func remove(id: String, from dir: URL) throws {
        for e in entries(in: dir) where e.id == id { try FileManager.default.removeItem(at: e.url) }
    }

    private static func entries(in dir: URL) -> [(id: String, url: URL)] {
        let fm = FileManager.default
        guard let items = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.isDirectoryKey]) else { return [] }
        return items.compactMap { item in
            let isDir = (try? item.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true
            let file = isDir ? item.appendingPathComponent("skin.json") : item
            guard isDir || item.pathExtension.lowercased() == "json",
                  let data = try? Data(contentsOf: file), data.count <= SkinCheck.maxBytes,
                  let skin = try? PadSkin.parse(data) else { return nil }
            return (skin.id, item)
        }
    }
}
