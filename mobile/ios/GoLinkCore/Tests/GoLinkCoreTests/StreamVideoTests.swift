// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import XCTest
@testable import GoLinkCore

/** stream_stats "video" and the renderer's working size (the website's video.test.ts and renderer.test.ts). */
final class StreamVideoTests: XCTestCase {
    private let stats = #""type":"stream_stats","fps":59.9,"width":768,"height":448,"aspect":1.3333"#

    func testReadsA2xPictureWithTheGamesSizeAndQuality() {
        let v = StreamVideo.parse(obj(#"{\#(stats),"video":{"scale":2,"width":384,"height":224,"quality":"high"}}"#))
        XCTAssertEqual(StreamVideo(scale: 2, width: 384, height: 224, quality: .high, fallback: nil), v)
        XCTAssertEqual(PictureLayout.Size(w: 384, h: 224), v?.native)
        let saver = StreamVideo.parse(obj(#"{\#(stats),"video":{"scale":1,"width":384,"height":224,"quality":"saver","fallback":"cpu"}}"#))
        XCTAssertEqual(StreamVideo(scale: 1, width: 384, height: 224, quality: .saver, fallback: "cpu"), saver)
        XCTAssertNil(saver?.native)
        // The whole message: stream_stats keeps it next to fps and aspect.
        XCTAssertEqual(v, RoomMessages.parseStreamStats(obj(#"{\#(stats),"video":{"scale":2,"width":384,"height":224,"quality":"high"}}"#))?.video)
    }

    func testIgnoresOlderDevicesAndBrokenValues() {
        XCTAssertNil(StreamVideo.parse(obj("{\(stats)}")))
        XCTAssertNil(RoomMessages.parseStreamStats(obj("{\(stats)}"))?.video)
        XCTAssertNil(StreamVideo.parse(obj(#"{\#(stats),"video":{"scale":3,"width":384,"height":224}}"#)))
        XCTAssertNil(StreamVideo.parse(obj(#"{\#(stats),"video":{"scale":2,"width":0,"height":224}}"#)))
        XCTAssertNil(StreamVideo.parse(obj(#"{\#(stats),"video":{"scale":2,"width":1e9,"height":224}}"#)))
        XCTAssertNil(StreamVideo.parse(obj(#"{\#(stats),"video":{"scale":2,"width":384.5,"height":224}}"#)))
        XCTAssertNil(StreamVideo.parse(obj(#"{\#(stats),"video":{"scale":"2","width":384,"height":224}}"#)))
        XCTAssertNil(StreamVideo.parse(obj(#"{\#(stats),"video":"2x"}"#)))
        XCTAssertNil(StreamVideo.parse(obj(#"{"type":"room_state","video":{"scale":2,"width":384,"height":224}}"#)))
        XCTAssertEqual(
            StreamVideo(scale: 2, width: 384, height: 224),
            StreamVideo.parse(obj(#"{\#(stats),"video":{"scale":2,"width":384,"height":224,"quality":"4k","fallback":"gpu"}}"#))
        )
    }

    func testWorkingSizeAveragesOnlyAnExact2xFrame() {
        let native = PictureLayout.Size(w: 384, h: 224)
        XCTAssertEqual(PictureLayout.Working(w: 384, h: 224, down: true), PictureLayout.workingSize(frameW: 768, frameH: 448, native: native))
        // A frame of the old size while the quality changes, or scale 1.
        XCTAssertEqual(PictureLayout.Working(w: 384, h: 224, down: false), PictureLayout.workingSize(frameW: 384, frameH: 224, native: native))
        XCTAssertEqual(PictureLayout.Working(w: 768, h: 450, down: false), PictureLayout.workingSize(frameW: 768, frameH: 450, native: native))
        XCTAssertEqual(PictureLayout.Working(w: 768, h: 448, down: false), PictureLayout.workingSize(frameW: 768, frameH: 448, native: nil))
        XCTAssertEqual(PictureLayout.Working(w: 640, h: 480, down: false), PictureLayout.workingSize(frameW: 640, frameH: 480, native: PictureLayout.Size(w: 0, h: 0)))
    }
}
