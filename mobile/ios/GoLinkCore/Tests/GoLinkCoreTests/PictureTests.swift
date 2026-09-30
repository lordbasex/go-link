// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import XCTest
@testable import GoLinkCore

/** Mirrors the website's picture tests (frontend/apps/web/src/picture/picture.test.tsx). */
final class PictureTests: XCTestCase {
    func testFitsWithoutCroppingAtItsAspect() {
        let sizes: [(Double, Double)] = [(1920, 1080), (3840, 2160), (390, 844), (844, 390), (1200, 900), (333, 777), (2560, 1080), (1, 1)]
        let aspects: [Double] = [4.0 / 3, 3.0 / 4, 16.0 / 9, 384.0 / 224, 1, 2.5]
        let eps = 1e-6
        for (w, h) in sizes {
            for a in aspects {
                for inset in [0.0, 12] {
                    let r = PictureLayout.fitRect(w, h, aspect: a, inset: inset)
                    XCTAssertGreaterThanOrEqual(r.x, -eps)
                    XCTAssertGreaterThanOrEqual(r.y, -eps)
                    XCTAssertLessThanOrEqual(r.x + r.w, w + eps)
                    XCTAssertLessThanOrEqual(r.y + r.h, h + eps)
                    if r.w > 0 {
                        XCTAssertEqual(r.w / r.h, a, accuracy: 1e-6)
                        // As large as possible: it touches the sides or the top and bottom.
                        let aw = w - 2 * inset
                        let ah = h - 2 * inset
                        XCTAssertTrue(abs(r.w - aw) < 1e-6 || abs(r.h - ah) < 1e-6)
                        XCTAssertEqual(r.x + r.w / 2, w / 2, accuracy: 1e-6)
                        XCTAssertEqual(r.y + r.h / 2, h / 2, accuracy: 1e-6)
                    }
                }
            }
        }
    }

    func testLetterboxAndPillarbox() {
        XCTAssertEqual(PictureLayout.fitRect(1920, 1080, aspect: 4.0 / 3), .init(x: 240, y: 0, w: 1440, h: 1080))
        let tall = PictureLayout.fitRect(390, 844, aspect: 4.0 / 3)
        XCTAssertEqual(tall.x, 0)
        XCTAssertEqual(tall.w, 390)
        XCTAssertEqual(tall.h, 292.5, accuracy: 1e-9)
    }

    func testEmptyAreaOrBrokenAspect() {
        XCTAssertEqual(PictureLayout.fitRect(0, 100, aspect: 4.0 / 3).w, 0)
        XCTAssertEqual(PictureLayout.fitRect(100, 100, aspect: 0).w, 0)
        XCTAssertEqual(PictureLayout.fitRect(100, 100, aspect: .nan).w, 0)
        XCTAssertEqual(PictureLayout.fitRect(100, 100, aspect: .infinity).w, 0)
    }

    func testFrameBezelIsThinAndScaled() {
        XCTAssertEqual(PictureLayout.frameInset(1920, 1080, scale: 1), 36)
        XCTAssertEqual(PictureLayout.frameInset(390, 292, scale: 3), 24)
        XCTAssertEqual(PictureLayout.frameInset(300, 200, scale: 1), 8)
    }

    func testScaleAndPrescale() {
        let r = PictureLayout.fitRect(1152, 864, aspect: 4.0 / 3)
        let s = PictureLayout.scaleOf(r, srcW: 384, srcH: 224)
        XCTAssertEqual(s.x, 3, accuracy: 1e-9)
        XCTAssertEqual(s.y, 864.0 / 224, accuracy: 1e-9)
        XCTAssertEqual(PictureLayout.prescale(1152, 384), 3)
        XCTAssertEqual(PictureLayout.prescale(864, 224), 4)
        XCTAssertEqual(PictureLayout.prescale(100, 384), 1)
        XCTAssertEqual(PictureLayout.prescale(10000, 100), 8)
        XCTAssertEqual(PictureLayout.prescale(100, 0), 1)
    }

    func testSplitStaysInside() {
        XCTAssertEqual(PictureLayout.clampSplit(-1), 0.02)
        XCTAssertEqual(PictureLayout.clampSplit(2), 0.98)
        XCTAssertEqual(PictureLayout.clampSplit(0.4), 0.4)
        XCTAssertEqual(PictureLayout.clampSplit(.nan), 0.5)
    }

    func testDefaultsAreSmoothOnAmbient() {
        let s = PictureSettings.read(MemoryStore())
        XCTAssertEqual(s, PictureSettings(style: .smooth, bands: .ambient))
        XCTAssertEqual(s, PictureSettings.defaults)
    }

    func testRemembersTheChoiceAndIgnoresUnknownValues() {
        let store = MemoryStore()
        PictureSettings(style: .crt, bands: .frame).write(store)
        XCTAssertEqual(store.get(PictureSettings.styleKey), "crt")
        XCTAssertEqual(store.get(PictureSettings.bandsKey), "frame")
        XCTAssertEqual(PictureSettings.read(store), PictureSettings(style: .crt, bands: .frame))
        store.set(PictureSettings.styleKey, "vaporwave")
        store.set(PictureSettings.bandsKey, "<script>")
        XCTAssertEqual(PictureSettings.read(store), PictureSettings.defaults)
    }

    func testShaderCodesMatchTheWebsite() {
        XCTAssertEqual(PictureStyle.allCases.map(\.rawValue), ["smooth", "sharp", "crt", "edges"])
        XCTAssertEqual(PictureStyle.allCases.map(\.code), [0, 1, 2, 3])
        XCTAssertEqual(PictureBands.allCases.map(\.rawValue), ["black", "ambient", "frame"])
        XCTAssertEqual(PictureBands.allCases.map(\.code), [0, 1, 2])
    }

    func testTheViewersChoiceWinsThenTheRoomThenTheApp() {
        let room = PictureSettings(style: .crt, bands: .frame)
        XCTAssertEqual(PictureSettings.resolve(.init(), room: nil), .defaults)
        XCTAssertEqual(PictureSettings.resolve(.init(), room: room), room)
        XCTAssertEqual(PictureSettings.resolve(.init(style: .sharp), room: room), PictureSettings(style: .sharp, bands: .frame))
        XCTAssertEqual(PictureSettings.resolve(.init(style: .sharp, bands: .black), room: room), PictureSettings(style: .sharp, bands: .black))
        let store = MemoryStore()
        XCTAssertEqual(PictureSettings.read(store, room: room), room)
        PictureSettings(style: .edges, bands: .ambient).write(store)
        XCTAssertEqual(PictureSettings.read(store, room: room), PictureSettings(style: .edges, bands: .ambient))
        XCTAssertTrue(PictureSettings.offersRoomDefault(PictureSettings.readSaved(store), room: room))
        XCTAssertFalse(PictureSettings.offersRoomDefault(PictureSettings.readSaved(store), room: nil))
        PictureSettings.clear(store)
        XCTAssertTrue(PictureSettings.readSaved(store).isEmpty)
        XCTAssertEqual(PictureSettings.read(store, room: room), room)
        XCTAssertFalse(PictureSettings.offersRoomDefault(.init(), room: room))
        XCTAssertFalse(PictureSettings.offersRoomDefault(.init(style: .crt, bands: .frame), room: room))
    }

    func testParsesTheRoomsDefaultPicture() {
        func state(_ picture: String) -> RoomStateView? {
            RoomMessages.parseRoomState(obj(#"{"type":"room_state","you":{},"picture":\#(picture)}"#))
        }
        XCTAssertEqual(state(#"{"style":"crt","bands":"frame"}"#)?.picture, PictureSettings(style: .crt, bands: .frame))
        XCTAssertNil(state(#"{"style":"vaporwave","bands":"frame"}"#)?.picture)
        XCTAssertNil(state(#"{"style":"crt"}"#)?.picture)
        XCTAssertNil(state(#""crt""#)?.picture)
        XCTAssertNil(state("null")?.picture)
        XCTAssertNil(RoomMessages.parseRoomState(obj(#"{"type":"room_state","you":{}}"#))?.picture)
    }
}
