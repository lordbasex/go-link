// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import CoreGraphics
import XCTest
@testable import GoLinkCore

final class SkinTests: XCTestCase {
    /** The apps' built-in skin files (docs/skins/builtin, shared with Android). */
    private func builtIn() throws -> [(name: String, data: Data)] {
        var root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        while !FileManager.default.fileExists(atPath: root.appendingPathComponent("docs/skins/builtin").path) {
            root = root.deletingLastPathComponent()
        }
        let dir = root.appendingPathComponent("docs/skins/builtin")
        let files = try FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        return try files.map { ($0.lastPathComponent, try Data(contentsOf: $0)) }
    }

    func testEveryBuiltInSkinLoads() throws {
        let files = try builtIn()
        XCTAssertGreaterThanOrEqual(files.count, 6)
        let catalog = SkinCatalog(files: files)
        XCTAssertEqual(catalog.skipped, [])
        XCTAssertEqual(catalog.skins.count, files.count)
        for (f, skin) in zip(files, catalog.skins) {
            XCTAssertEqual(f.name, "skin-\(skin.id).json")
            for lang in ["en", "es", "pt"] { XCTAssertNotNil(skin.names[lang], "\(skin.id) \(lang)") }
            XCTAssertFalse(skin.landscape.isEmpty)
            XCTAssertFalse(skin.portrait.isEmpty)
        }
    }

    private func json(_ s: String) -> Data { Data(s.utf8) }

    private let minimal = ##"{"format":1,"id":"mine","name":{"en":"Mine"},"shell":{"center":"#112233","edge":"#000000","rim":"#ffffff"}}"##

    func testMinimalSkinTakesDefaults() throws {
        let s = try PadSkin.parse(json(minimal))
        XCTAssertEqual(s.id, "mine")
        XCTAssertEqual(s.center, 0x112233)
        XCTAssertEqual(s.controls, .dark)
        XCTAssertEqual(s.bezel, 0x07080C)
        XCTAssertTrue(s.rings)
        XCTAssertEqual(s.landscape, [])
        XCTAssertEqual(s.name("es"), "Mine")
    }

    func testRefusesBrokenFiles() {
        XCTAssertThrowsError(try PadSkin.parse(json("nope"))) { XCTAssertEqual($0 as? SkinError, .notJson) }
        XCTAssertThrowsError(try PadSkin.parse(json(minimal.replacingOccurrences(of: #""format":1"#, with: #""format":2"#)))) {
            XCTAssertEqual($0 as? SkinError, .format(2))
        }
        XCTAssertThrowsError(try PadSkin.parse(json(minimal.replacingOccurrences(of: "mine", with: "classic"))))
        XCTAssertThrowsError(try PadSkin.parse(json(minimal.replacingOccurrences(of: "mine", with: "Bad Id"))))
        XCTAssertThrowsError(try PadSkin.parse(json(minimal.replacingOccurrences(of: "#112233", with: "blue"))))
        let badControls = minimal.replacingOccurrences(of: #""format":1"#, with: #""format":1,"controls":"neon""#)
        XCTAssertThrowsError(try PadSkin.parse(json(badControls))) { XCTAssertEqual($0 as? SkinError, .badValue("controls")) }
        let badShape = minimal.replacingOccurrences(of: #""format":1"#, with: #""format":1,"decor":{"portrait":[{"shape":"star","x":0,"y":0,"w":1,"h":1}]}"#)
        XCTAssertThrowsError(try PadSkin.parse(json(badShape)))
    }

    func testStyleColorsFallBackToTheTone() throws {
        let s = try PadSkin.parse(json(minimal.replacingOccurrences(
            of: #""format":1"#,
            with: ##""format":1,"controls":"light","style":{"menu":{"fill":"#ff0000","fillOpacity":0.9},"controls":{"lit":"#00ff00"}}"##
        )))
        XCTAssertEqual(s.menuStyle.fill, 0xFF0000)
        XCTAssertEqual(s.menuStyle.fillOpacity, 0.9)
        XCTAssertEqual(s.menuStyle.icon, PadSkin.MenuStyle().icon)
        XCTAssertEqual(s.colors.lit, 0x00FF00)
        XCTAssertNil(PadSkin.tone(.dark).lit, "a held control only sinks unless the skin asks for a tint")
        XCTAssertNil(PadSkin.tone(.light).lit)
        XCTAssertEqual(s.colors.face, PadSkin.tone(.light).face)
        XCTAssertNil(try PadSkin.parse(json(minimal)).palette)
        XCTAssertThrowsError(try PadSkin.parse(json(minimal.replacingOccurrences(of: #""format":1"#, with: ##""format":1,"style":{"menu":{"fill":"red"}}"##))))
    }

    func testBackgroundPicturesStayNextToTheFile() throws {
        let withPictures = minimal.replacingOccurrences(of: #""format":1"#, with: #""format":1,"background":{"portrait":"p.png","landscape":"l.jpg"}"#)
        let s = try PadSkin.parse(json(withPictures))
        XCTAssertEqual(s.backgroundPortrait, "p.png")
        XCTAssertEqual(s.backgroundLandscape, "l.jpg")
        for bad in ["../x.png", "/etc/x.png", "a/b.png", ".hidden.png", "x.svg", "x.gif", ""] {
            XCTAssertThrowsError(try PadSkin.parse(json(withPictures.replacingOccurrences(of: "p.png", with: bad))), bad)
        }
        let folder = URL(fileURLWithPath: "/tmp/skins/mine")
        let inFolder = SkinCatalog(files: [SkinCatalog.File(name: "skin.json", data: json(withPictures), folder: folder)])
        XCTAssertEqual(inFolder.skins.first?.folder, folder)
        XCTAssertEqual(inFolder.skins.first?.backgroundPortrait, "p.png")
        let bare = SkinCatalog(files: [SkinCatalog.File(name: "mine.json", data: json(withPictures))])
        XCTAssertNil(bare.skins.first?.backgroundPortrait, "a bare file has no folder for its pictures")
    }

    /** The picture fills its box: the whole game, as large as the box allows. */
    func testPictureIsAsLargeAsItsBox() throws {
        let skin = try PadSkin.parse(builtIn()[0].data)
        let portrait = SkinLayout.compute(size: CGSize(width: 402, height: 874), insets: (62, 0, 34, 0), landscape: false, aspect: 4.0 / 3, buttons: 6, starts: 2, placement: skin.portraitPlacement)
        XCTAssertEqual(portrait.screen.width, 402, accuracy: 0.5, "edge to edge in portrait")
        let landscape = SkinLayout.compute(size: CGSize(width: 874, height: 402), insets: (0, 62, 21, 62), landscape: true, aspect: 4.0 / 3, buttons: 6, starts: 2, placement: skin.landscapePlacement)
        XCTAssertEqual(landscape.screen.height, 402 - 8 - 21, accuracy: 0.5, "the whole height in landscape")
    }

    func testControlDesignDefaultsAndValues() throws {
        let plain = try PadSkin.parse(json(minimal))
        XCTAssertEqual(plain.design, PadSkin.ControlDesign(), "an old skin keeps round, flat buttons and the arrow D-pad")
        XCTAssertNil(plain.design.well)
        let s = try PadSkin.parse(json(minimal.replacingOccurrences(
            of: #""format":1"#,
            with: ##""format":1,"style":{"controls":{"shape":"hexagon","ring":0.9,"labels":"letters","dome":0.7,"well":{"size":0.2,"depth":2,"color":"#101010"},"dpad":{"arm":0.3,"radius":0.25,"marks":"lines"}}}"##
        )))
        XCTAssertEqual(s.design.shape, .hexagon)
        XCTAssertEqual(s.design.ring, 0.25, "clamped")
        XCTAssertEqual(s.design.labels, .letters)
        XCTAssertEqual(s.design.label(1), "A")
        XCTAssertEqual(s.design.label(6), "F")
        XCTAssertEqual(s.design.dome, 0.7)
        XCTAssertEqual(s.design.well?.size, 0.2)
        XCTAssertEqual(s.design.well?.depth, 1, "clamped")
        XCTAssertEqual(s.design.well?.color, 0x101010)
        XCTAssertEqual(s.design.dpadArm, 0.3)
        XCTAssertEqual(s.design.dpadRadius, 0.25)
        XCTAssertEqual(s.design.dpadMarks, .lines)
        for bad in [#""shape":"star""#, #""labels":"roman""#, #""well":true"#, #""dpad":{"marks":"stars"}"#] {
            XCTAssertThrowsError(try PadSkin.parse(json(minimal.replacingOccurrences(of: #""format":1"#, with: #""format":1,"style":{"controls":{"# + bad + "}}"))), bad)
        }
    }

    func testClampsNumbersAndIgnoresUnknownKeys() throws {
        let s = try PadSkin.parse(json(minimal.replacingOccurrences(
            of: #""format":1"#,
            with: #""format":1,"future":{"x":1},"decor":{"landscape":[{"shape":"rect","x":-1,"y":2,"w":0.5,"h":0.5,"radius":999,"opacity":5}]}"#
        )))
        let d = try XCTUnwrap(s.landscape.first)
        XCTAssertEqual(d.x, 0)
        XCTAssertEqual(d.y, 1)
        XCTAssertEqual(d.radius, 60)
        XCTAssertEqual(d.opacity, 1)
    }

    func testCatalogSkipsBadFilesAndRepeatedIds() throws {
        let c = SkinCatalog(files: [("a.json", json(minimal)), ("b.json", json("{}")), ("c.json", json(minimal))])
        XCTAssertEqual(c.skins.map(\.id), ["mine"])
        XCTAssertEqual(c.skipped, ["b.json"])
        let store = MemoryStore()
        XCTAssertEqual(c.selected(store)?.id, "mine", "without Smoke, the first skin")
        store.set(PadSkin.prefKey, "mine")
        XCTAssertEqual(c.selected(store)?.id, "mine")
        store.set(PadSkin.prefKey, "gone")
        XCTAssertEqual(c.selected(store)?.id, "mine", "a removed skin falls back to the default")
        XCTAssertNil(SkinCatalog(files: [(name: String, data: Data)]()).selected(store), "no skins at all: the plain pad")
        let builtIn = SkinCatalog(files: try builtIn())
        store.set(PadSkin.prefKey, nil)
        XCTAssertEqual(builtIn.selected(store)?.id, PadSkin.defaultId, "Smoke until the player chooses")
        store.set(PadSkin.prefKey, PadSkin.classicId)
        XCTAssertEqual(builtIn.selected(store)?.id, PadSkin.defaultId, "the old Classic choice becomes Smoke")
    }

    /** The automatic placement and the built-in skins' own. */
    private func placements(_ landscape: Bool) -> [PadSkin.Placement?] {
        let skin = try? PadSkin.parse(builtIn()[0].data)
        return [nil, landscape ? skin?.landscapePlacement : skin?.portraitPlacement]
    }

    func testBuiltInSkinsPlaceEveryPart() throws {
        for f in try builtIn() {
            let s = try PadSkin.parse(f.data)
            XCTAssertNotNil(s.portraitPlacement, f.name)
            XCTAssertNotNil(s.landscapePlacement, f.name)
            XCTAssertEqual(s.portraitPlacement?.menuHides, false, "under the picture, the menu stays")
            XCTAssertEqual(s.landscapePlacement?.menuHides, true, "over the picture, it folds away")
        }
    }

    func testPlacementNeedsEveryPart() {
        let base = ##"{"format":1,"id":"p","name":{"en":"P"},"shell":{"center":"#112233","edge":"#000000","rim":"#ffffff"},"layout":{"portrait":{"canvas":{"w":400,"h":800},"screen":{"x":0,"y":0,"w":400,"h":300},"dpad":{"x":0,"y":400,"w":150,"h":150},"buttons":{"x":200,"y":400,"w":180,"h":180},"coin":{"x":0,"y":700,"w":58,"h":34},"starts":{"x":100,"y":700,"w":200,"h":34},"header":{"x":0,"y":0,"w":44,"h":44},"menu":{"x":0,"y":320,"w":400,"h":50,"direction":"column"}}}}"##
        let ok = try? PadSkin.parse(json(base))
        XCTAssertEqual(ok?.portraitPlacement?.menuVertical, true)
        XCTAssertEqual(ok?.portraitPlacement?.menuHides, false)
        XCTAssertNil(ok?.landscapePlacement, "a missing orientation uses the automatic placement")
        XCTAssertThrowsError(try PadSkin.parse(json(base.replacingOccurrences(of: #""coin":{"x":0,"y":700,"w":58,"h":34},"#, with: ""))))
        XCTAssertThrowsError(try PadSkin.parse(json(base.replacingOccurrences(of: #""direction":"column""#, with: #""direction":"diagonal""#))))
        XCTAssertThrowsError(try PadSkin.parse(json(base.replacingOccurrences(of: #""w":400,"h":800"#, with: #""w":0,"h":800"#))))
    }

    /** Phones and tablets, both orientations: everything on screen, nothing overlapping, the picture whole. */
    func testLayoutFitsAndNeverOverlaps() {
        let screens: [(CGSize, (CGFloat, CGFloat, CGFloat, CGFloat))] = [
            (CGSize(width: 402, height: 874), (62, 0, 34, 0)),
            (CGSize(width: 874, height: 402), (0, 62, 21, 62)),
            (CGSize(width: 375, height: 667), (20, 0, 0, 0)),
            (CGSize(width: 667, height: 375), (0, 0, 0, 0)),
            (CGSize(width: 440, height: 956), (62, 0, 34, 0)),
            (CGSize(width: 820, height: 1180), (24, 0, 20, 0)),
            // Small Android-sized screens (the Android app runs the same math).
            (CGSize(width: 360, height: 640), (24, 0, 0, 0)),
            (CGSize(width: 640, height: 360), (0, 0, 0, 0)),
            (CGSize(width: 1180, height: 820), (24, 0, 20, 0)),
        ]
        for (size, ins) in screens {
            let landscape = size.width > size.height
            for aspect in [4.0 / 3, 3.0 / 4, 384.0 / 224] as [CGFloat] {
                for buttons in 1...6 {
                    for starts in 1...4 {
                      for placement in placements(landscape) {
                        let l = SkinLayout.compute(size: size, insets: ins, landscape: landscape, aspect: aspect, buttons: buttons, starts: starts, placement: placement)
                        let what = "\(placement == nil ? "auto" : "skin") \(size) \(aspect) \(buttons)b \(starts)s"
                        XCTAssertEqual(l.screen.width / l.screen.height, aspect, accuracy: 1e-6, what)
                        XCTAssertEqual(l.faces.count, buttons)
                        XCTAssertEqual(l.starts.count, starts)
                        let controls = [l.dpad, l.coin] + l.faces + l.starts
                        let bounds = CGRect(origin: .zero, size: size)
                        for c in controls + [l.screen] { XCTAssertTrue(bounds.contains(c), "\(what) \(c) off screen") }
                        XCTAssertTrue(bounds.contains(l.frame), what)
                        XCTAssertTrue(l.frame.insetBy(dx: -0.001, dy: -0.001).contains(l.screen), "\(what): the whole picture sits inside the frame")
                        for c in controls {
                            XCTAssertFalse(c.intersects(l.screen.insetBy(dx: -4, dy: -4)), "\(what) \(c) on the picture")
                            XCTAssertFalse(c.intersects(l.frame), "\(what) \(c) on the frame")
                            XCTAssertGreaterThanOrEqual(min(c.width, c.height), 34, what)
                        }
                        for i in controls.indices {
                            for j in controls.indices where j > i {
                                XCTAssertFalse(controls[i].intersects(controls[j]), "\(what) \(controls[i]) \(controls[j])")
                            }
                        }
                        if placement != nil && !l.menuHides {
                            // A menu that stays must not cover the game or the controls.
                            XCTAssertFalse(l.menu.intersects(l.screen), what)
                            for c in controls { XCTAssertFalse(l.menu.intersects(c), "\(what) menu over \(c)") }
                        }
                      }
                    }
                }
            }
        }
    }
}
