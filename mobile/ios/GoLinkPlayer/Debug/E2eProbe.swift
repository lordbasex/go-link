// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import Combine
import AVFoundation
import Foundation
import GoLinkCore
import os
@preconcurrency import WebRTC

/**
 * Debug builds only: the room's events and the WebRTC counters as one JSON
 * object per log line (subsystem org.golink.player, category e2e), like
 * the Android app's GoLinkE2E probe, so a test on the Mac can check what
 * the app receives and sends:
 *
 *     xcrun simctl spawn booted log stream --level info \
 *       --predicate 'subsystem == "org.golink.player" AND category == "e2e"'
 *
 * It never logs a PIN or a token. Release builds attach nothing.
 */
@MainActor
enum E2eProbe {
    static func attach(_ session: RoomSession) -> () -> Void {
        #if DEBUG
        let log = Logger(subsystem: "org.golink.player", category: "e2e")
        func emit(_ o: JSON) { log.info("\(o.text, privacy: .public)") }
        var seenChat = 0
        var last = ""
        let sub = session.$ui.combineLatest(session.$sound).sink { ui, sound in
            let line = summary(ui, sound)
            if line.text != last {
                last = line.text
                emit(line)
            }
            if ui.chat.count < seenChat { seenChat = 0 }
            for case let .user(name, port, _, text, _) in ui.chat.dropFirst(seenChat) {
                emit(.obj(("ev", "chat"), ("name", .string(name)), ("text", .string(text)), ("port", port.map { .int($0) })))
            }
            seenChat = ui.chat.count
        }
        let timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            MainActor.assumeIsolated {
                guard let peer = session.peer else { return }
                peer.stats { report in emit(statsLine(report, labels: peer.trackLabels)) }
            }
        }
        return {
            sub.cancel()
            timer.invalidate()
        }
        #else
        return {}
        #endif
    }

    /** Debug builds: the on-screen pad's held buttons, one line each time they change. */
    static func touch(_ bits: Int) {
        #if DEBUG
        Logger(subsystem: "org.golink.player", category: "e2e").info("\(JSON.obj(("ev", "touch"), ("bits", .int(bits))).text, privacy: .public)")
        #endif
    }

    #if DEBUG
    private static func summary(_ ui: RoomUi, _ sound: SoundState) -> JSON {
        var me = ""
        switch ui.room?.me {
        case let .player(ports)?: me = ports.map { "P\($0)" }.joined(separator: ",")
        case let .queue(p)?: me = "queue:\(p)"
        case .spectator?: me = "spectator"
        case nil: me = ""
        }
        let seats = ui.room.map { r in r.seats.enumerated().map { "P\($0.offset + 1)=\($0.element?.name ?? "-")" }.joined(separator: " ") }
        return .obj(
            ("ev", "ui"),
            ("phase", .string(ui.phase.rawValue)),
            ("room", .string(ui.roomId)),
            ("reconnecting", .bool(ui.reconnecting)),
            ("pin_needed", .bool(ui.pin.needed)),
            ("pin_busy", .bool(ui.pin.busy)),
            ("pin_reason", ui.pin.last.map { .string($0.reason) }),
            ("control", .bool(ui.controlOpen)),
            ("me", .string(me)),
            ("seats", seats.map { .string($0) }),
            ("aspect", ui.stats.aspect.map { .number($0) }),
            ("mic", .bool(sound.micOn)),
            ("voices", .array(sound.voices.sorted().map { .int($0) }))
        )
    }

    /** One line: inbound RTP per track label, the microphone's outbound RTP, the path in use and the played level. */
    private static func statsLine(_ report: RTCStatisticsReport, labels: [String: String]) -> JSON {
        let all = report.statistics
        func num(_ v: NSObject?) -> JSON? { (v as? NSNumber).map { .number($0.doubleValue) } }
        var inbound = JSONObject()
        for s in all.values where s.type == "inbound-rtp" {
            let m = s.values
            let kind = (m["kind"] as? String) ?? "?"
            let track = (m["trackIdentifier"] as? String) ?? ""
            let name = labels[track] ?? kind
            inbound[name] = .obj(
                ("packets", num(m["packetsReceived"])),
                ("bytes", num(m["bytesReceived"])),
                ("lost", num(m["packetsLost"])),
                ("level", num(m["audioLevel"])),
                ("energy", num(m["totalAudioEnergy"])),
                ("samples", num(m["totalSamplesReceived"])),
                ("frames", num(m["framesDecoded"])),
                ("width", num(m["frameWidth"])),
                ("fps", num(m["framesPerSecond"]))
            )
        }
        var out = JSONObject()
        for s in all.values where s.type == "outbound-rtp" && (s.values["kind"] as? String) == "audio" {
            out["mic"] = .obj(("packets", num(s.values["packetsSent"])), ("bytes", num(s.values["bytesSent"])))
        }
        for s in all.values where s.type == "data-channel" {
            if let label = s.values["label"] as? String {
                out["dc_\(label)"] = .obj(("sent", num(s.values["messagesSent"])), ("received", num(s.values["messagesReceived"])))
            }
        }
        var path: JSON?
        if let pair = all.values.first(where: { $0.type == "candidate-pair" && ($0.values["nominated"] as? NSNumber)?.boolValue == true && ($0.values["state"] as? String) == "succeeded" }) {
            let local = (pair.values["localCandidateId"] as? String).flatMap { all[$0]?.values["candidateType"] as? String } ?? "?"
            let remote = (pair.values["remoteCandidateId"] as? String).flatMap { all[$0]?.values["candidateType"] as? String } ?? "?"
            path = .string("\(local)->\(remote)")
        }
        return .obj(
            ("ev", "stats"),
            ("in", .object(inbound)),
            ("out", .object(out)),
            ("path", path),
            ("played_level", .number((WebRtcEngine.shared.audioDevice.outputLevel * 1000).rounded() / 1000)),
            ("mic_open", .bool(WebRtcEngine.shared.audioDevice.micEnabled && WebRtcEngine.shared.audioDevice.isRecording)),
            ("session", .string(AVAudioSession.sharedInstance().category.rawValue))
        )
    }
    #endif
}
