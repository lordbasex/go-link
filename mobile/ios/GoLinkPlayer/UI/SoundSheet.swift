// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import AVKit
import GoLinkCore
import SwiftUI

/**
 * Volume and voice: the game and voices volumes (0-300 %, like the
 * website), the microphone (Automatic, the iPhone's, or a headset's), the
 * output through the system's route picker (speaker, headphones, AirPods;
 * never the earpiece) and a test chime.
 */
struct SoundSheet: View {
    @ObservedObject var session: RoomSession
    @ObservedObject var router: AudioRouter
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text(L("you_volume_voice")).font(.title3.weight(.semibold)).foregroundStyle(Tokens.text)
                    Spacer()
                    SwiftUI.Button { dismiss() } label: {
                        Image(systemName: "xmark").frame(width: Tokens.control, height: Tokens.control)
                    }
                    .foregroundStyle(Tokens.text2)
                    .accessibilityLabel(L("drawer_close"))
                }
                slider(L("sound_game"), value: Binding(get: { session.sound.gameVolume }, set: { session.setGameVolume($0) }), tag: "sound-game")
                slider(L("sound_voices"), value: Binding(get: { session.sound.voiceVolume }, set: { session.setVoiceVolume($0) }), tag: "sound-voices")
                HStack(spacing: 10) {
                    Rectangle().fill(Tokens.border).frame(height: 1)
                    Text(L("sound_devices").uppercased()).font(.system(size: 12, weight: .semibold, design: .monospaced)).foregroundStyle(Tokens.faint)
                    Rectangle().fill(Tokens.border).frame(height: 1)
                }
                .padding(.top, 6)
                Text(L("sound_microphone")).font(.footnote).foregroundStyle(Tokens.muted)
                Menu {
                    ForEach(Array(router.inputOptions.enumerated()), id: \.offset) { _, option in
                        SwiftUI.Button {
                            router.chooseInput(option.choice)
                        } label: {
                            if option.choice == router.shownInput {
                                Label(optionLabel(option), systemImage: "checkmark")
                            } else {
                                Text(optionLabel(option))
                            }
                        }
                    }
                } label: {
                    HStack {
                        Text(router.inputOptions.first { $0.choice == router.shownInput }.map(optionLabel) ?? L("sound_automatic"))
                            .foregroundStyle(Tokens.text)
                        Spacer()
                        Image(systemName: "chevron.up.chevron.down").foregroundStyle(Tokens.faint)
                    }
                    .goLinkField()
                }
                .accessibilityIdentifier("sound-mic")
                Text(L("sound_mic_hint")).font(.caption).foregroundStyle(Tokens.faint)
                Text(L("sound_output")).font(.footnote).foregroundStyle(Tokens.muted).padding(.top, 4)
                HStack(spacing: 12) {
                    RoutePicker()
                        .frame(width: Tokens.control, height: Tokens.control)
                        .background(Circle().fill(Tokens.surface2))
                        .accessibilityIdentifier("sound-output")
                    VStack(alignment: .leading, spacing: 2) {
                        Text(router.output == .speaker ? L("sound_speaker") : router.outputName)
                            .foregroundStyle(Tokens.text)
                        Text(L("sound_output_hint")).font(.caption).foregroundStyle(Tokens.faint)
                    }
                }
                PrimaryButton(title: L("sound_test"), icon: "speaker.wave.2.fill") { session.testSound() }
                    .accessibilityIdentifier("sound-test")
                    .padding(.top, 6)
            }
            .padding(22)
        }
        .background(Tokens.surface.ignoresSafeArea())
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .onAppear { router.refresh() }
    }

    private func slider(_ title: String, value: Binding<Double>, tag: String) -> some View {
        HStack(spacing: 12) {
            Text(title).font(.subheadline).foregroundStyle(Tokens.text2).frame(width: 70, alignment: .leading)
            Slider(value: value, in: 0...3, step: 0.05).tint(Tokens.accent).accessibilityIdentifier(tag)
            Text("\(Int((value.wrappedValue * 100).rounded())) %").font(.system(size: 13, design: .monospaced))
                .foregroundStyle(Tokens.muted).frame(width: 52, alignment: .trailing)
        }
    }

    private func optionLabel(_ option: AudioOption) -> String {
        guard let d = option.device else { return L("sound_automatic") }
        return deviceName(d.kind, d.name)
    }
}

/** A device's name: the phone's own by its role, a headset by its product name (or its kind). */
func deviceName(_ kind: AudioKind, _ name: String) -> String {
    switch kind {
    case .speaker: return L("sound_speaker")
    case .builtinMic: return L(UIDevice.current.userInterfaceIdiom == .pad ? "sound_ipad_mic" : "sound_iphone_mic")
    default:
        if !name.trimmingCharacters(in: .whitespaces).isEmpty { return name }
        switch kind {
        case .bluetooth: return L("sound_bluetooth")
        case .usb: return L("sound_usb")
        case .hearingAid: return L("sound_hearing_aid")
        default: return L("sound_wired")
        }
    }
}

/** The system's output picker (speaker, headphones, AirPods, AirPlay). */
struct RoutePicker: UIViewRepresentable {
    func makeUIView(context: Context) -> AVRoutePickerView {
        let v = AVRoutePickerView()
        v.tintColor = UIColor(Tokens.text2)
        v.activeTintColor = UIColor(Tokens.accent)
        v.prioritizesVideoDevices = false
        return v
    }

    func updateUIView(_ view: AVRoutePickerView, context: Context) {}
}
