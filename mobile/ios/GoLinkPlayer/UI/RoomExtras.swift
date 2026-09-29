// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import GoLinkCore
import SwiftUI

/**
 * The stats button (top left over the picture) and its compact box: the
 * decoded frame rate, the picture's size and codec, the round trip to the
 * device, whether the path is direct or through the relay, the packet
 * loss and the game sound's codec. Semi-transparent, never over the
 * middle of the picture.
 */
struct StatsCorner: View {
    let on: Bool
    let stats: LiveStatsView?
    let toggle: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            SwiftUI.Button(action: toggle) {
                Image(systemName: "chart.bar.xaxis")
                    .font(.system(size: 15, weight: .semibold)).foregroundStyle(Tokens.voice)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Tokens.video.opacity(0.55)))
                    .overlay(Circle().stroke(Tokens.voice.opacity(on ? 1 : 0.6), lineWidth: 2))
                    .frame(width: Tokens.control, height: Tokens.control)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L(on ? "stats_hide" : "stats_show"))
            .accessibilityIdentifier("room-stats")
            if on { StatsBox(stats: stats).padding(.top, 4) }
        }
    }
}

struct StatsBox: View {
    let stats: LiveStatsView?

    var body: some View {
        let s = stats ?? LiveStatsView()
        let dash = "–"
        let size = s.width.flatMap { w in s.height.map { "\(w)×\($0)" } } ?? dash
        let path: String = {
            switch s.path {
            case .direct: return L("stats_direct")
            case .relay: return L("stats_relay")
            case .unknown: return dash
            }
        }()
        let audio = s.audioCodec.map { c in s.audioKhz.map { "\(c) \($0) kHz" } ?? c } ?? dash
        VStack(alignment: .leading, spacing: 1) {
            line(value: s.fps.map(String.init) ?? dash, rest: L("stats_fps_rest", size, s.codec ?? ""))
            line(prefix: L("stats_ping"), value: s.rttMs.map { "\($0) ms" } ?? dash, rest: " · " + path)
            Text(L("stats_loss_audio", s.lossPercent.map(LiveStatsMeter.formatLoss) ?? dash, audio))
        }
        .font(.system(size: 12, weight: .medium, design: .monospaced))
        .foregroundStyle(Tokens.text)
        .lineLimit(1)
        .padding(.horizontal, 10).padding(.vertical, 7)
        .background(RoundedRectangle(cornerRadius: 12).fill(Tokens.video.opacity(0.62)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Tokens.voice.opacity(0.35), lineWidth: 1))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("room-stats-box")
    }

    private func line(prefix: String = "", value: String, rest: String) -> some View {
        (Text(prefix) + Text(value).foregroundColor(Tokens.voice) + Text(rest))
    }
}

/** "DualSense Wireless Controller · display only": the see-through pad follows a real controller. */
struct ControllerChip: View {
    let name: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "gamecontroller").foregroundStyle(Tokens.accent)
            Text(name).lineLimit(1)
            Text("· " + L("pad_display_only_tail")).lineLimit(1).fixedSize()
        }
        .font(.system(size: 13)).foregroundStyle(Tokens.text)
        .padding(.horizontal, 12).padding(.vertical, 6)
        .background(Capsule().fill(Tokens.video.opacity(0.7)))
        .overlay(Capsule().stroke(Tokens.borderStrong, lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L("pad_display_only", name))
        .accessibilityIdentifier("pad-controller-chip")
    }
}

/** "You asked the host for a pause…  Cancel", over the top of the picture while the request waits. */
struct PauseBanner: View {
    let cancel: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Circle().fill(Tokens.accent).frame(width: 10, height: 10).accessibilityHidden(true)
            Text(L("pause_asked_banner")).font(.subheadline).foregroundStyle(Tokens.text).lineLimit(2)
            SwiftUI.Button(L("pause_cancel"), action: cancel)
                .font(.subheadline.weight(.semibold)).foregroundStyle(Tokens.accent)
                .frame(minHeight: Tokens.control)
                .accessibilityIdentifier("pause-cancel")
        }
        .padding(.leading, 16).padding(.trailing, 10)
        .background(Capsule().fill(Tokens.surface2))
        .overlay(Capsule().stroke(Tokens.borderStrong, lineWidth: 1))
        .shadow(color: .black.opacity(0.5), radius: 20, y: 10)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("pause-banner")
    }
}

/** The pad lights for a real controller: its Start is this player's own start button (1P, 2P...). */
func controllerDisplayBits(_ bits: Int, myPort: Int?) -> Int {
    var out = bits & ~PadButton.start
    if bits & PadButton.start != 0 { out |= startOf(myPort ?? 1) }
    return out
}
