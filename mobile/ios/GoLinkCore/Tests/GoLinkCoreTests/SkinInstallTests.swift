// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import XCTest
@testable import GoLinkCore

final class SkinInstallTests: XCTestCase {
    /** The built-in Smoke skin (docs/skins/builtin), as text. */
    private func smoke() throws -> String {
        var root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        while !FileManager.default.fileExists(atPath: root.appendingPathComponent("docs/skins/builtin").path) {
            root = root.deletingLastPathComponent()
        }
        return try String(contentsOf: root.appendingPathComponent("docs/skins/builtin/skin-smoke.json"), encoding: .utf8)
    }

    private let builtIns: Set<String> = ["violet", "red", "green", "blue", "smoke", "orange"]

    private func ready(_ outcome: SkinCheck.Outcome, file: StaticString = #filePath, line: UInt = #line) throws -> SkinCheck.Ready {
        guard case .ready(let r) = outcome else {
            XCTFail("expected a skin ready to install, got \(outcome)", file: file, line: line)
            throw XCTSkip()
        }
        return r
    }

    private func failure(_ outcome: SkinCheck.Outcome) -> SkinCheck.Failure? {
        if case .failed(let f) = outcome { return f }
        return nil
    }

    func testAValidSkinWithANewIdIsReady() throws {
        let text = try smoke().replacingOccurrences(of: "\"id\": \"smoke\"", with: "\"id\": \"my-smoke\"")
        let r = try ready(SkinCheck.check(text, builtIns: builtIns, installed: []))
        XCTAssertEqual(r.skin.id, "my-smoke")
        XCTAssertFalse(r.replaces)
        // The built-in layout passes every check on every screen.
        XCTAssertEqual(r.warnings.filter { if case .layout = $0 { return true }; return false }, [])
    }

    func testRefusesEmptyBrokenAndIncompleteText() throws {
        XCTAssertEqual(failure(SkinCheck.check("  \n", builtIns: builtIns, installed: [])), .empty)
        let broken = "{\n  \"format\": 1,\n  \"id\": \"x\"\n  \"name\": {}\n}"
        guard case .notJson(let line, _) = failure(SkinCheck.check(broken, builtIns: builtIns, installed: [])) else {
            return XCTFail("broken JSON is not JSON")
        }
        XCTAssertEqual(line, 4, "the mistake is where \"name\" starts without a comma")
        XCTAssertEqual(failure(SkinCheck.check("{\"format\": 1}", builtIns: builtIns, installed: [])), .missing("id"))
        XCTAssertEqual(failure(SkinCheck.check("{\"format\": 2}", builtIns: builtIns, installed: [])), .format(2))
        XCTAssertEqual(failure(SkinCheck.check(String(repeating: " ", count: 10) + "{" + String(repeating: "x", count: 70_000) + "}", builtIns: builtIns, installed: [])), .tooLarge)
    }

    func testTypographicQuotesAreStraightenedWhenThatIsAllThatIsWrong() throws {
        let typed = "{\u{201C}format\u{201D}: 1, \u{201C}id\u{201D}: \u{201C}typed\u{201D}, \u{201C}name\u{201D}: {\u{201C}en\u{201D}: \u{201C}Typed\u{201D}}, \u{201C}shell\u{201D}: {\u{201C}center\u{201D}: \u{201C}#224466\u{201D}, \u{201C}edge\u{201D}: \u{201C}#000000\u{201D}, \u{201C}rim\u{201D}: \u{201C}#ffffff\u{201D}}}"
        let r = try ready(SkinCheck.check(typed, builtIns: builtIns, installed: []))
        XCTAssertEqual(r.skin.id, "typed")
        XCTAssertNotNil(try? JSONSerialization.jsonObject(with: r.data), "the installed file is plain JSON")
    }

    func testRefusesABuiltInIdAndFlagsAReplacement() throws {
        XCTAssertEqual(failure(SkinCheck.check(try smoke(), builtIns: builtIns, installed: [])), .builtInId("smoke"))
        let text = try smoke().replacingOccurrences(of: "\"id\": \"smoke\"", with: "\"id\": \"mine\"")
        XCTAssertTrue(try ready(SkinCheck.check(text, builtIns: builtIns, installed: ["mine"])).replaces)
    }

    func testWarnsAboutMissingPicturesAndABadLayout() throws {
        var text = try smoke().replacingOccurrences(of: "\"id\": \"smoke\"", with: "\"id\": \"pics\"")
        text = text.replacingOccurrences(of: "\"format\": 1,", with: "\"format\": 1,\n  \"background\": { \"portrait\": \"back.png\" },")
        let r = try ready(SkinCheck.check(text, builtIns: builtIns, installed: []))
        XCTAssertTrue(r.warnings.contains(.missingPictures(["back.png"])))
        // Every part in the same spot: they overlap and sit on the picture.
        let messy = """
        {"format":1,"id":"messy","name":{"en":"Messy"},"shell":{"center":"#112233","edge":"#000000","rim":"#ffffff"},
         "layout":{"portrait":{"canvas":{"w":400,"h":800},"screen":{"x":0,"y":0,"w":400,"h":500},"header":{"x":0,"y":0,"w":400,"h":40},
          "menu":{"x":0,"y":500,"w":400,"h":40},"dpad":{"x":10,"y":100,"w":150,"h":150},"buttons":{"x":10,"y":100,"w":150,"h":150},
          "coin":{"x":10,"y":100,"w":60,"h":30},"starts":{"x":10,"y":100,"w":150,"h":30}}}}
        """
        let m = try ready(SkinCheck.check(messy, builtIns: builtIns, installed: []))
        XCTAssertFalse(m.warnings.isEmpty)
        XCTAssertTrue(m.warnings.contains { if case .layout(false, _, .overlaps) = $0 { return true }; return false })
    }

    func testInstallReplaceAndRemove() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("skins-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let text = try smoke().replacingOccurrences(of: "\"id\": \"smoke\"", with: "\"id\": \"mine\"")
        // An older copy of the same skin under another file name is replaced, not doubled.
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try Data(text.utf8).write(to: dir.appendingPathComponent("old-name.json"))
        let url = try SkinInstaller.install(Data(text.utf8), id: "mine", into: dir)
        XCTAssertEqual(url.lastPathComponent, "skin-mine.json")
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: dir.path), ["skin-mine.json"])
        XCTAssertEqual(SkinInstaller.installedIds(in: dir), ["mine"])
        try SkinInstaller.remove(id: "mine", from: dir)
        XCTAssertEqual(SkinInstaller.installedIds(in: dir), [])
    }

    /** The paste check's screens are docs/skins/screens.json's, portrait and landscape, in order. */
    func testChecksOnTheSharedScreens() throws {
        var root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        while !FileManager.default.fileExists(atPath: root.appendingPathComponent("docs/skins/screens.json").path) {
            root = root.deletingLastPathComponent()
        }
        let data = try Data(contentsOf: root.appendingPathComponent("docs/skins/screens.json"))
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let screens = try XCTUnwrap(json["screens"] as? [[String: Any]])
        var want: [String] = []
        for s in screens {
            for o in ["portrait", "landscape"] {
                let x = try XCTUnwrap(s[o] as? [String: Any])
                let i = try XCTUnwrap(x["ins"] as? [String: Double])
                want.append("\(x["w"]!) \(x["h"]!) \(i["t"]!) \(i["l"]!) \(i["b"]!) \(i["r"]!)")
            }
        }
        func n(_ v: CGFloat) -> String { String(Int(v)) }
        let have = SkinCheck.screens.map { "\(n($0.0.width)) \(n($0.0.height)) \(n($0.1.0)) \(n($0.1.1)) \(n($0.1.2)) \(n($0.1.3))" }
        let wantInts = want.map { $0.split(separator: " ").map { String(Int(Double($0)!)) }.joined(separator: " ") }
        XCTAssertEqual(have, wantInts)
    }
}
