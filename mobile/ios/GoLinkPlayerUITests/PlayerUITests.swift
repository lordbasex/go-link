// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import XCTest

/**
 * Drives go-link Player in the simulator. testScreens saves screenshots of
 * the main screens (GL_SHOTS: folder, GL_LANG: en/es/pt). testLiveJoin
 * joins a real room when GL_INVITE (https://go-link.org/g/<invite>) and
 * GL_PIN are given, and is skipped otherwise. testPadAcrossRotations
 * rotates the debug pad lab and presses the on-screen pad. Pass them to xcodebuild as
 * TEST_RUNNER_GL_* environment variables.
 */
final class PlayerUITests: XCTestCase {
    private var env: [String: String] { ProcessInfo.processInfo.environment }
    private var lang: String { env["GL_LANG"] ?? "en" }

    override func setUp() {
        continueAfterFailure = false
    }

    private func launch(_ extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        // -noIntro: no startup intro over the screens under test.
        app.launchArguments = ["-noIntro", "-AppleLanguages", "(\(lang))", "-AppleLocale", lang == "en" ? "en_US" : (lang == "es" ? "es_ES" : "pt_BR")] + extra
        app.launch()
        return app
    }

    private func shot(_ name: String) {
        let png = XCUIScreen.main.screenshot().pngRepresentation
        let attachment = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let dir = env["GL_SHOTS"] {
            try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
            try? png.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(lang)-\(name).png"))
        }
    }

    func testScreens() {
        let app = launch(["-resetState"])
        XCTAssertTrue(app.buttons["home-scan"].waitForExistence(timeout: 10))
        shot("1-home")

        app.buttons["home-scan"].tap()
        XCTAssertTrue(app.buttons["perm-allow"].waitForExistence(timeout: 5) || app.staticTexts["scan-status"].exists)
        shot("2-scanner-permission")
        app.buttons["back"].tap()

        app.buttons["home-code"].tap()
        let code = app.textFields["join-code"]
        XCTAssertTrue(code.waitForExistence(timeout: 5))
        code.tap()
        code.typeText("915355636")
        // The digits show grouped while they are typed.
        XCTAssertEqual(code.value as? String, "915 355 636")
        shot("3-code-entry")
        let pin = app.textFields["join-pin"]
        pin.tap()
        pin.typeText("482913")
        app.buttons["join-button"].tap() // terms not accepted yet: asks for them
        shot("4-pin")
        app.buttons["back"].tap()

        app.buttons["home-settings"].tap()
        XCTAssertTrue(app.textFields["settings-server"].waitForExistence(timeout: 5))
        app.textFields["settings-server"].tap()
        app.textFields["settings-server"].typeText("ws://signal.example.org/ws\n")
        shot("5-settings")
    }

    /**
     * The on-screen pad keeps working after every rotation (debug pad lab,
     * no room needed): each button sends its own bit and then 0, in
     * portrait (Game Boy) and in both landscape sides (Switch).
     */
    func testPadAcrossRotations() {
        let app = launch(["-padLab"])
        defer { XCUIDevice.shared.orientation = .portrait }
        let layout = app.staticTexts["pad-layout"]
        let log = app.staticTexts["pad-log"]
        XCTAssertTrue(layout.waitForExistence(timeout: 10))

        func expectPress(_ id: String, _ bits: Int, at offset: CGVector? = nil, _ where_: String) {
            app.buttons["pad-clear"].tap()
            XCTAssertEqual(log.label, "", "log not cleared (\(where_))")
            let el = app.otherElements[id]
            XCTAssertTrue(el.waitForExistence(timeout: 5), "\(id) missing (\(where_))")
            if let offset {
                el.coordinate(withNormalizedOffset: offset).press(forDuration: 0.3)
            } else {
                el.press(forDuration: 0.3)
            }
            let want = "\(bits) 0"
            let done = NSPredicate(format: "label == %@", want)
            let ok = XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: done, object: log)], timeout: 3) == .completed
            XCTAssertTrue(ok, "\(id) in \(where_): sent [\(log.label)], want [\(want)]")
        }

        let steps: [(UIDeviceOrientation, String)] = [
            (.portrait, "portrait"), (.landscapeLeft, "landscape"), (.portrait, "portrait"),
            (.landscapeRight, "landscape"), (.landscapeLeft, "landscape"), (.portrait, "portrait"),
        ]
        for (i, (orientation, name)) in steps.enumerated() {
            XCUIDevice.shared.orientation = orientation
            let turned = NSPredicate(format: "label == %@", name)
            XCTAssertEqual(XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: turned, object: layout)], timeout: 5), .completed, "never turned \(name)")
            sleep(1) // let the rotation animation finish
            let where_ = "step \(i) \(name)"
            shot("pad-\(i)-\(name)")
            expectPress("pad-button-1", 1 << 4, where_)
            expectPress("pad-button-6", 1 << 9, where_)
            expectPress("pad-coin", 1 << 11, where_)
            expectPress("pad-start-1", 1 << 18, where_)
            expectPress("pad-start-2", 1 << 19, where_)
            expectPress("pad-dpad", 1 << 3, at: CGVector(dx: 0.92, dy: 0.5), where_)
            expectPress("pad-dpad", 1 << 0, at: CGVector(dx: 0.5, dy: 0.08), where_)
        }
    }

    func testLiveJoin() throws {
        guard let invite = env["GL_INVITE"], let pinText = env["GL_PIN"] else { throw XCTSkip("no invitation given") }
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let app = launch(["-invite", invite, "-silentOutput"])
        let pin = app.textFields["join-pin"]
        XCTAssertTrue(pin.waitForExistence(timeout: 10))
        if !pin.hasFocus { pin.tap() }
        pin.typeText(pinText)
        let terms = app.buttons["terms-check"]
        if !terms.isSelected { terms.tap() }
        shot("live-1-pin")
        app.buttons["join-button"].tap()

        // The name step comes once the PIN is accepted.
        let aliasEnter = app.buttons["alias-enter"]
        XCTAssertTrue(aliasEnter.waitForExistence(timeout: 40), "no name step")
        let aliasField = app.textFields["alias-field"]
        if !aliasEnter.isEnabled {
            aliasField.tap()
            aliasField.typeText("iPhone")
        }
        shot("live-1b-alias")
        aliasEnter.tap()

        // Streaming: the seat line appears and the progress goes away.
        let seat = app.staticTexts["room-seat"]
        XCTAssertTrue(seat.waitForExistence(timeout: 40), "never got a seat")
        let progress = app.staticTexts["room-progress"]
        let gone = NSPredicate(format: "exists == false")
        expectation(for: gone, evaluatedWith: progress)
        waitForExpectations(timeout: 30)
        // No microphone prompt just for joining and listening.
        XCTAssertFalse(springboard.alerts.firstMatch.waitForExistence(timeout: 3), "a system alert appeared while joining")
        sleep(3)
        shot("live-2-room-portrait")

        // The on-screen pad: coin, start, a button, the D-pad.
        app.otherElements["pad-coin"].press(forDuration: 0.3)
        app.otherElements["pad-start-1"].press(forDuration: 0.3)
        app.otherElements["pad-button-1"].press(forDuration: 0.5)
        let dpad = app.otherElements["pad-dpad"]
        dpad.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).press(forDuration: 0.5)

        // Chat.
        app.buttons["dock-chat"].tap()
        let input = app.textFields["chat-input"]
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        input.tap()
        input.typeText("hello from the iOS app")
        app.buttons["chat-send"].tap()
        sleep(2)
        shot("live-3-chat")
        XCTAssertTrue(app.staticTexts["hello from the iOS app"].waitForExistence(timeout: 10))
        app.buttons["drawer-players"].tap()
        XCTAssertTrue(app.otherElements["seat-1"].waitForExistence(timeout: 5) || app.staticTexts["P1"].exists)
        shot("live-4-players")
        app.buttons["drawer-you"].tap()
        XCTAssertTrue(app.buttons["you-sound"].waitForExistence(timeout: 5))
        shot("live-5-you")
        app.buttons["you-sound"].tap()
        XCTAssertTrue(app.buttons["sound-test"].waitForExistence(timeout: 5))
        shot("live-6-sound")
        app.swipeDown(velocity: .fast)
        sleep(1)
        if app.buttons["drawer-close"].exists { app.buttons["drawer-close"].tap() }

        // The microphone: our explanation, then the system's prompt (or straight on when allowed).
        let micOffLabel = app.buttons["dock-mic"].label
        app.buttons["dock-mic"].tap()
        let allow = app.alerts.buttons.element(boundBy: 1)
        if allow.waitForExistence(timeout: 3) {
            shot("live-7-mic-explainer")
            allow.tap()
            let system = springboard.alerts.firstMatch
            if system.waitForExistence(timeout: 5) {
                shot("live-7b-mic-system")
                let ok = system.buttons.allElementsBoundByIndex.last
                ok?.tap()
            }
        }
        let micOn = NSPredicate(format: "label != %@", micOffLabel)
        expectation(for: micOn, evaluatedWith: app.buttons["dock-mic"])
        waitForExpectations(timeout: 10)
        sleep(4)

        XCUIDevice.shared.orientation = .landscapeLeft
        sleep(3)
        shot("live-8-room-landscape")
        app.otherElements["pad-button-2"].press(forDuration: 0.5)
        XCUIDevice.shared.orientation = .portrait
        sleep(2)
        app.buttons["room-leave"].tap()
        XCTAssertTrue(app.buttons["home-scan"].waitForExistence(timeout: 10))
    }

    /**
     * The name step's validation (debug -aliasLab, no room): symbols and
     * emoji turn it red and disable "Enter the room"; a plain name enables it.
     */
    func testAliasValidation() {
        let app = launch(["-aliasLab"])
        let field = app.textFields["alias-field"]
        let enter = app.buttons["alias-enter"]
        let hint = app.staticTexts["alias-hint"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        XCTAssertFalse(enter.isEnabled, "empty name")
        field.tap()
        field.typeText("Ana😀")
        XCTAssertFalse(enter.isEnabled, "emoji accepted")
        XCTAssertTrue(hint.label.contains(lang == "en" ? "no symbols or emoji" : (lang == "es" ? "sin símbolos" : "sem símbolos")), hint.label)
        shot("alias-invalid")
        field.clearAndType("Ana")
        XCTAssertTrue(enter.waitForEnabled(), "a plain name is refused")
        shot("alias-valid")
        field.typeText(" Ñandú 17")
        XCTAssertTrue(enter.isEnabled, "accents and ñ refused")
        enter.tap()
        XCTAssertEqual(app.staticTexts["alias-result"].label, "Ana Ñandú 17")
        field.clearAndType("A")
        XCTAssertFalse(enter.isEnabled, "one letter accepted")
    }

    /** Home opens the offline controller test, in portrait and landscape, and the on-screen pad lights it. */
    func testControllerTestScreen() {
        let app = launch()
        defer { XCUIDevice.shared.orientation = .portrait }
        let open = app.buttons["home-test-controller"]
        XCTAssertTrue(open.waitForExistence(timeout: 10))
        open.tap()
        XCTAssertTrue(app.otherElements["test-controller-screen"].waitForExistence(timeout: 5) || app.buttons["test-close"].exists)
        XCTAssertTrue(app.staticTexts["test-latency"].waitForExistence(timeout: 5))
        app.otherElements["pad-button-1"].press(forDuration: 0.4)
        app.otherElements["pad-dpad"].coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).press(forDuration: 0.4)
        // A press was measured: the last reading is a number, not a dash.
        let measured = NSPredicate(format: "NOT (label BEGINSWITH %@)", app.staticTexts["test-latency"].label.components(separatedBy: " ").prefix(2).joined(separator: " ") + " –")
        XCTAssertEqual(XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: measured, object: app.staticTexts["test-latency"])], timeout: 3), .completed, app.staticTexts["test-latency"].label)
        shot("test-controller-portrait")
        XCUIDevice.shared.orientation = .landscapeLeft
        sleep(2)
        XCTAssertTrue(app.otherElements["pad-button-6"].waitForExistence(timeout: 5))
        app.otherElements["pad-button-6"].press(forDuration: 0.4)
        shot("test-controller-landscape")
        XCUIDevice.shared.orientation = .portrait
        sleep(1)
        app.buttons["test-close"].tap()
        XCTAssertTrue(app.buttons["home-scan"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["app-version"].exists)
    }

    /** Screenshots of the pad lab with the stats overlay and the see-through pad of a controller. */
    func testStatsAndGhostPadLab() {
        let app = launch(["-padLab", "-labStats", "-labGhost"])
        defer { XCUIDevice.shared.orientation = .portrait }
        XCTAssertTrue(app.staticTexts["pad-layout"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.otherElements["room-stats-box"].exists || app.staticTexts["room-stats-box"].exists)
        XCTAssertTrue(app.otherElements["pad-controller-chip"].exists || app.staticTexts["pad-controller-chip"].exists)
        // Display only: a finger on the pad sends nothing.
        app.otherElements["pad-button-2"].press(forDuration: 0.3)
        XCTAssertEqual(app.staticTexts["pad-log"].label, "")
        shot("lab-stats-ghost-portrait")
        XCUIDevice.shared.orientation = .landscapeLeft
        sleep(2)
        shot("lab-stats-ghost-landscape")
    }
}

extension XCUIElement {
    func clearAndType(_ text: String) {
        tap()
        let current = value as? String ?? ""
        typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count + 4) + text)
    }

    func waitForEnabled(timeout: TimeInterval = 3) -> Bool {
        XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "isEnabled == true"), object: self)], timeout: timeout) == .completed
    }
}
