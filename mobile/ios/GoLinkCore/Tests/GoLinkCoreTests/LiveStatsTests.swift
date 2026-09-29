// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import XCTest
@testable import GoLinkCore

final class LiveStatsTests: XCTestCase {
    func testRatesComeFromTheLastInterval() {
        let m = LiveStatsMeter()
        let first = m.update(RtcSample(
            atMs: 0, framesDecoded: 100, frameWidth: 640, frameHeight: 480, videoMime: "video/VP8",
            packetsReceived: 1000, packetsLost: 10, audioMime: "audio/opus", audioClockRate: 48000,
            rttSeconds: 0.028, localCandidateType: "host", remoteCandidateType: "prflx"
        ))
        XCTAssertNil(first.fps)
        XCTAssertNil(first.lossPercent)
        XCTAssertEqual(28, first.rttMs)
        XCTAssertEqual(.direct, first.path)
        XCTAssertEqual("VP8", first.codec)
        XCTAssertEqual("Opus", first.audioCodec)
        XCTAssertEqual(48, first.audioKhz)

        let next = m.update(RtcSample(atMs: 1000, framesDecoded: 160, packetsReceived: 1198, packetsLost: 12, localCandidateType: "relay"))
        XCTAssertEqual(60, next.fps)
        XCTAssertEqual(1.0, next.lossPercent!, accuracy: 1e-9)
        XCTAssertEqual(.relay, next.path)
        XCTAssertNil(next.width)

        m.reset()
        XCTAssertNil(m.update(RtcSample(atMs: 2000, framesDecoded: 220)).fps)
    }

    func testFormatsLossAndCodecs() {
        XCTAssertEqual("0", LiveStatsMeter.formatLoss(0))
        XCTAssertEqual("0.4", LiveStatsMeter.formatLoss(0.4))
        XCTAssertEqual("2", LiveStatsMeter.formatLoss(2))
        XCTAssertEqual("12", LiveStatsMeter.formatLoss(12.4))
        XCTAssertEqual("H264", LiveStatsMeter.codecName("video/h264"))
        XCTAssertNil(LiveStatsMeter.codecName(nil))
        XCTAssertEqual(.unknown, LiveStatsMeter().update(RtcSample(atMs: 0)).path)
    }

    func testLatencyMeterKeepsAWindow() {
        var l = LatencyMeter(window: 3)
        XCTAssertNil(l.average)
        l.add(10)
        l.add(20)
        l.add(-1)
        l.add(5000)
        l.add(30)
        l.add(40)
        XCTAssertEqual(3, l.count)
        XCTAssertEqual(20, l.min)
        XCTAssertEqual(30, l.average!, accuracy: 1e-9)
        XCTAssertEqual(40, l.last)
    }
}
