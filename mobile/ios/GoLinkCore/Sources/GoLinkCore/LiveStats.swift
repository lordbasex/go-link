// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import Foundation

/**
 * One reading of the WebRTC statistics the room's stats overlay needs,
 * taken once a second from libwebrtc's statistics report. Counters are
 * cumulative, as libwebrtc reports them; nil means the report did not
 * have that value. A port of the Android app's LiveStats.kt.
 */
public struct RtcSample: Equatable, Sendable {
    /** When it was read, in milliseconds (any monotonic clock). */
    public var atMs: Double
    /** Inbound video: frames decoded so far and the last frame's size. */
    public var framesDecoded: Int64?
    public var frameWidth: Int?
    public var frameHeight: Int?
    /** The codec's MIME type, like "video/VP8". */
    public var videoMime: String?
    /** Inbound RTP packets (video and game audio together). */
    public var packetsReceived: Int64?
    public var packetsLost: Int64?
    /** The game audio codec: MIME type and clock rate in Hz. */
    public var audioMime: String?
    public var audioClockRate: Int?
    /** The selected candidate pair's round trip, in seconds. */
    public var rttSeconds: Double?
    /** The selected pair's candidate types: host, srflx, prflx or relay. */
    public var localCandidateType: String?
    public var remoteCandidateType: String?

    public init(
        atMs: Double, framesDecoded: Int64? = nil, frameWidth: Int? = nil, frameHeight: Int? = nil, videoMime: String? = nil,
        packetsReceived: Int64? = nil, packetsLost: Int64? = nil, audioMime: String? = nil, audioClockRate: Int? = nil,
        rttSeconds: Double? = nil, localCandidateType: String? = nil, remoteCandidateType: String? = nil
    ) {
        self.atMs = atMs
        self.framesDecoded = framesDecoded
        self.frameWidth = frameWidth
        self.frameHeight = frameHeight
        self.videoMime = videoMime
        self.packetsReceived = packetsReceived
        self.packetsLost = packetsLost
        self.audioMime = audioMime
        self.audioClockRate = audioClockRate
        self.rttSeconds = rttSeconds
        self.localCandidateType = localCandidateType
        self.remoteCandidateType = remoteCandidateType
    }
}

/** How the media reaches this phone: straight from the device, or through the TURN relay. */
public enum NetPath: Equatable, Sendable { case direct, relay, unknown }

/** What the overlay shows. nil values are drawn as a dash. */
public struct LiveStatsView: Equatable, Sendable {
    public var fps: Int?
    public var width: Int?
    public var height: Int?
    /** "VP8", "H264"... */
    public var codec: String?
    public var rttMs: Int?
    public var path: NetPath = .unknown
    /** Packets lost in the last interval, 0 to 100. */
    public var lossPercent: Double?
    /** "Opus", with the rate in kHz below. */
    public var audioCodec: String?
    public var audioKhz: Int?

    public init() {}
}

/**
 * Turns successive RtcSamples into LiveStatsViews: the frame rate and the
 * packet loss come from the change since the previous sample, not from
 * the totals, so they describe the last second.
 */
public final class LiveStatsMeter {
    private var last: RtcSample?

    public init() {}

    public func reset() { last = nil }

    public func update(_ s: RtcSample) -> LiveStatsView {
        let prev = last
        last = s
        var v = LiveStatsView()
        if let prev {
            let dt = (s.atMs - prev.atMs) / 1000
            if dt > 0.05, let f = s.framesDecoded, let pf = prev.framesDecoded, f >= pf {
                v.fps = Int((Double(f - pf) / dt).rounded())
            }
            if let r = s.packetsReceived, let pr = prev.packetsReceived {
                let got = r - pr
                let lost = Swift.max(0, (s.packetsLost ?? 0) - (prev.packetsLost ?? 0))
                if got >= 0, got + lost > 0 { v.lossPercent = Double(lost) * 100 / Double(got + lost) }
            }
        }
        if s.localCandidateType == "relay" || s.remoteCandidateType == "relay" {
            v.path = .relay
        } else if s.localCandidateType != nil || s.remoteCandidateType != nil {
            v.path = .direct
        }
        v.width = s.frameWidth.flatMap { $0 > 0 ? $0 : nil }
        v.height = s.frameHeight.flatMap { $0 > 0 ? $0 : nil }
        v.codec = Self.codecName(s.videoMime)
        if let rtt = s.rttSeconds, rtt.isFinite, rtt >= 0 { v.rttMs = Int((rtt * 1000).rounded()) }
        v.audioCodec = Self.codecName(s.audioMime)
        if let rate = s.audioClockRate, rate > 0 { v.audioKhz = Int((Double(rate) / 1000).rounded()) }
        return v
    }

    /** "video/VP8" -> "VP8", "audio/opus" -> "Opus". */
    public static func codecName(_ mime: String?) -> String? {
        guard let mime else { return nil }
        let after = mime.split(separator: "/", maxSplits: 1).last.map(String.init) ?? mime
        let name = String(after.trimmingCharacters(in: .whitespaces).prefix(16))
        if name.isEmpty { return nil }
        return name.lowercased() == "opus" ? "Opus" : name.uppercased()
    }

    /** Loss as the overlay prints it: "0", "0.4", "12". */
    public static func formatLoss(_ p: Double) -> String {
        if p <= 0 { return "0" }
        if p < 10 {
            let r = (p * 10).rounded() / 10
            return r == r.rounded() ? String(Int(r)) : String(r)
        }
        return String(Int(p.rounded()))
    }
}

/**
 * Input latency on the controller test screen: the time from an input
 * event to the next frame drawn after it. Keeps the last `window`
 * readings for the minimum and the average.
 */
public struct LatencyMeter: Sendable {
    private let window: Int
    private var values: [Double] = []

    public init(window: Int = 60) { self.window = window }

    public var last: Double? { values.last }
    public var min: Double? { values.min() }
    public var average: Double? { values.isEmpty ? nil : values.reduce(0, +) / Double(values.count) }
    public var count: Int { values.count }

    /** Adds one reading in milliseconds; negative or absurd values (over 1 s) are ignored. */
    public mutating func add(_ ms: Double) {
        guard ms.isFinite, ms >= 0, ms <= 1000 else { return }
        values.append(ms)
        if values.count > window { values.removeFirst(values.count - window) }
    }

    public mutating func reset() { values.removeAll() }
}
