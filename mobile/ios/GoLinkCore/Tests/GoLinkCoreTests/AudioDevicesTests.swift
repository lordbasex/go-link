// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import XCTest
@testable import GoLinkCore

final class AudioDevicesTests: XCTestCase {
    private let speaker = AudioDevice(id: 1, kind: .speaker, name: "iPhone")
    private let phoneMic = AudioDevice(id: 2, kind: .builtinMic, name: "iPhone Microphone")
    private let backMic = AudioDevice(id: 3, kind: .builtinMic, name: "iPhone Microphone", address: "back")
    private let btOut = AudioDevice(id: 10, kind: .bluetooth, name: "Buds", address: "AA:BB")
    private let btIn = AudioDevice(id: 11, kind: .bluetooth, name: "Buds", address: "AA:BB")
    private let wiredOut = AudioDevice(id: 20, kind: .wired)
    private let wiredIn = AudioDevice(id: 21, kind: .wired)

    func testOutputsAreAutomaticSpeakerThenHeadsets() {
        let list = AudioChoices.outputs([btOut, speaker, wiredOut, phoneMic])
        XCTAssertEqual([nil, speaker, btOut, wiredOut], list.map(\.device))
        XCTAssertEqual(.automatic, list[0].choice)
    }

    func testInputsHaveOnePhoneMicrophone() {
        let list = AudioChoices.inputs([btIn, phoneMic, backMic, speaker])
        XCTAssertEqual([nil, phoneMic, btIn], list.map(\.device))
    }

    func testTheSameDeviceTwiceIsOneRow() {
        XCTAssertEqual(3, AudioChoices.outputs([speaker, btOut, btOut.with(id: 12)]).count)
    }

    func testASavedChoiceFindsTheDeviceAfterItReconnects() {
        let saved = AudioChoice.decode(AudioChoice.encode(.of(btOut)))
        let back = btOut.with(id: 99)
        XCTAssertEqual(back, AudioChoices.resolve(saved, [speaker, back]))
        XCTAssertNil(AudioChoices.resolve(saved, [speaker]))
        XCTAssertNil(AudioChoices.resolve(.automatic, [speaker]))
    }

    func testBuiltInChoicesDoNotDependOnTheModelName() {
        let saved = AudioChoice.decode(AudioChoice.encode(.of(speaker)))
        XCTAssertEqual(5, AudioChoices.resolve(saved, [AudioDevice(id: 5, kind: .speaker, name: "Other")])?.id)
    }

    func testEncodingRoundTripsAndBadTextIsAutomatic() {
        XCTAssertNil(AudioChoice.encode(.automatic))
        let c = AudioChoice.device(kind: .usb, name: "Cam \"Pro\" | mic", address: "card=1;device=0")
        XCTAssertEqual(c, AudioChoice.decode(AudioChoice.encode(c)))
        XCTAssertEqual(.automatic, AudioChoice.decode(nil))
        XCTAssertEqual(.automatic, AudioChoice.decode("not json"))
        XCTAssertEqual(.automatic, AudioChoice.decode(#"{"kind":"EARPIECE"}"#))
        XCTAssertEqual(.automatic, AudioChoice.decode(#"{"kind":7}"#))
    }

    func testPlanUsesTheChosenOutput() {
        let plan = AudioChoices.plan(output: .of(speaker), input: .automatic, outputs: [speaker, btOut], inputs: [phoneMic, btIn])
        XCTAssertEqual(AudioPlan(communication: speaker, input: nil), plan)
    }

    func testAHeadsetMicrophoneBringsItsHeadsetWhenTheOutputIsAutomatic() {
        let plan = AudioChoices.plan(output: .automatic, input: .of(btIn), outputs: [speaker, wiredOut, btOut], inputs: [phoneMic, wiredIn, btIn])
        XCTAssertEqual(AudioPlan(communication: btOut, input: btIn), plan)
        let wired = AudioChoices.plan(output: .automatic, input: .of(wiredIn), outputs: [speaker, wiredOut, btOut], inputs: [phoneMic, wiredIn, btIn])
        XCTAssertEqual(AudioPlan(communication: wiredOut, input: wiredIn), wired)
    }

    func testThePhoneMicrophoneKeepsTheAutomaticOutput() {
        let plan = AudioChoices.plan(output: .automatic, input: .of(phoneMic), outputs: [speaker, btOut], inputs: [phoneMic, btIn])
        XCTAssertEqual(AudioPlan(communication: nil, input: phoneMic), plan)
    }

    func testCounterpartPrefersTheSameAddress() {
        let other = AudioDevice(id: 30, kind: .bluetooth, name: "Car", address: "CC:DD")
        XCTAssertEqual(btOut, AudioChoices.counterpart(btIn, [other, btOut]))
        XCTAssertNil(AudioChoices.counterpart(btIn, [other]))
        XCTAssertNil(AudioChoices.counterpart(btIn, [speaker]))
    }

    func testAChosenDeviceThatDisconnectsGoesBackToAutomatic() {
        let s = AudioSelection()
        s.update(outputs: [speaker, btOut], inputs: [phoneMic, btIn])
        s.chooseOutput(.of(btOut))
        s.chooseInput(.of(btIn))
        XCTAssertEqual(AudioPlan(communication: btOut, input: btIn), s.plan())
        let lost = s.update(outputs: [speaker], inputs: [phoneMic])
        XCTAssertEqual([LostAudioDevice(input: false, kind: .bluetooth, name: "Buds"), LostAudioDevice(input: true, kind: .bluetooth, name: "Buds")], lost)
        XCTAssertEqual(.automatic, s.output)
        XCTAssertEqual(.automatic, s.input)
        XCTAssertEqual(AudioPlan(communication: nil, input: nil), s.plan())
        // Reported once.
        XCTAssertTrue(s.update(outputs: [speaker], inputs: [phoneMic]).isEmpty)
    }

    func testASavedDeviceMissingAtTheStartWaitsForIt() {
        let s = AudioSelection(output: .of(btOut))
        XCTAssertTrue(s.update(outputs: [speaker], inputs: [phoneMic]).isEmpty)
        XCTAssertEqual(.of(btOut), s.output)
        XCTAssertEqual(.automatic, s.shownOutput())
        XCTAssertEqual(AudioPlan(communication: nil, input: nil), s.plan())
        // It connects: used at once; then it leaves: Automatic, reported.
        s.update(outputs: [speaker, btOut], inputs: [phoneMic])
        XCTAssertEqual(.of(btOut), s.shownOutput())
        XCTAssertEqual(btOut, s.plan().communication)
        XCTAssertEqual(1, s.update(outputs: [speaker], inputs: [phoneMic]).count)
        XCTAssertEqual(.automatic, s.output)
    }

    func testChoosingAMissingDeviceIsNotReportedAsLost() {
        let s = AudioSelection()
        s.update(outputs: [speaker], inputs: [phoneMic])
        s.chooseOutput(.of(btOut))
        XCTAssertTrue(s.update(outputs: [speaker], inputs: [phoneMic]).isEmpty)
    }

    func testOptionsFromTheSelection() {
        let s = AudioSelection()
        s.update(outputs: [speaker, btOut], inputs: [phoneMic, btIn])
        XCTAssertEqual(3, s.outputOptions().count)
        XCTAssertEqual(3, s.inputOptions().count)
        XCTAssertEqual(.automatic, s.shownInput())
    }
}
