// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import Foundation

/**
 * How the device sends a game's picture (docs/protocol.md, Video scale; the
 * website's packages/shared/src/video.ts). Game rooms may send it enlarged
 * 2x with nearest neighbour (every game pixel as a 2x2 block, so each keeps
 * its own color in VP8); the device says so in stream_stats "video", and
 * the picture renderer averages each block back to one game pixel before
 * any style. The Android app keeps the same in :core StreamVideo.kt.
 */
public enum VideoQuality: String, CaseIterable, Sendable {
    case high, normal, saver
}

/** stream_stats "video": the picture being sent. */
public struct StreamVideo: Equatable, Sendable {
    /** 2 when the frames are the game's picture enlarged 2x, else 1. */
    public var scale: Int
    /** The game's own size in pixels (the frames are scale times larger). */
    public var width: Int
    public var height: Int
    /** Game rooms: the quality in use. */
    public var quality: VideoQuality?
    /** "cpu" when the quality in use is lower than the host's choice (this computer could not keep up with 2x). */
    public var fallback: String?

    public init(scale: Int, width: Int, height: Int, quality: VideoQuality? = nil, fallback: String? = nil) {
        self.scale = scale
        self.width = width
        self.height = height
        self.quality = quality
        self.fallback = fallback
    }

    /** The game's size when the frames are 2x (what the renderer averages back to); nil at scale 1. */
    public var native: PictureLayout.Size? { scale == 2 ? PictureLayout.Size(w: width, h: height) : nil }

    /** Reads the "video" of a stream_stats message; nil when absent or broken (older devices: scale 1). */
    public static func parse(_ m: JSONObject) -> StreamVideo? {
        guard m["type"].str(40) == "stream_stats", case let .object(v)? = m["video"] else { return nil }
        func size(_ x: JSON?) -> Int {
            guard x.isNumber else { return 0 }
            let d = x.num
            return d == d.rounded() && d > 0 && d <= 4096 ? Int(d) : 0
        }
        let scale = v["scale"].isNumber ? v["scale"].num : 0
        let w = size(v["width"]), h = size(v["height"])
        guard scale == 1 || scale == 2, w > 0, h > 0 else { return nil }
        return StreamVideo(
            scale: Int(scale), width: w, height: h,
            quality: v["quality"].strOrNil.flatMap(VideoQuality.init(rawValue:)),
            fallback: v["fallback"].strOrNil == "cpu" ? "cpu" : nil
        )
    }
}

public extension PictureLayout {
    struct Size: Equatable, Sendable {
        public var w: Int
        public var h: Int

        public init(w: Int, h: Int) {
            self.w = w
            self.h = h
        }
    }

    /** The texture every style reads, and whether the frame must be averaged down to it first. */
    struct Working: Equatable, Sendable {
        public var w: Int
        public var h: Int
        public var down: Bool

        public init(w: Int, h: Int, down: Bool) {
            self.w = w
            self.h = h
            self.down = down
        }
    }

    /**
     * The website's workingSize (renderer.ts): a frame exactly twice the
     * game's size is averaged back to the game's size; any other frame
     * (scale 1, or an old size during a quality change) is drawn as it is.
     */
    static func workingSize(frameW: Int, frameH: Int, native: Size?) -> Working {
        if let n = native, n.w > 0, n.h > 0, frameW == n.w * 2, frameH == n.h * 2 {
            return Working(w: n.w, h: n.h, down: true)
        }
        return Working(w: frameW, h: frameH, down: false)
    }
}
