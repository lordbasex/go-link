// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import AVKit
import GoLinkCore
import SwiftUI

/** The sound part of Game settings: the volumes and, in a room, the devices. */
struct GameSound {
    /** 0 to 1 (0-100 %). */
    var game: Binding<Double>
    var voices: Binding<Double>
    /** nil in the debug lab (no audio session). */
    var router: AudioRouter?
    var test: () -> Void = {}
}

/**
 * "Game settings", opened from the dock's gear without leaving the room: a
 * side sheet in landscape, a bottom sheet in portrait, so the picture stays
 * in sight while its style changes. Your name, the game and voices volumes,
 * the microphone and output, the picture (style, sides, Compare) and the
 * stats overlay.
 */
struct GameSettingsPanel: View {
    let landscape: Bool
    @ObservedObject var picture: PictureModel
    /** The gamepad's skins; nil where there is no pad (the picture lab). */
    var skins: SkinStore?
    let sound: GameSound
    let initialName: String
    let onSaveName: (String) -> Void
    @Binding var statsOn: Bool
    let onClose: () -> Void
    @StateObject private var keyboard = KeyboardHeight()
    @State private var name = ""
    @State private var saved = false

    var body: some View {
        GeometryReader { g in
            let full = g.size.height + g.safeAreaInsets.bottom
            let free = max(220, full - keyboard.height)
            ZStack(alignment: landscape ? .trailing : .bottom) {
                // Light, so the picture shows through while the style changes.
                Color.black.opacity(0.18).ignoresSafeArea().onTapGesture(perform: onClose)
                    .accessibilityHidden(true)
                panel
                    .frame(width: landscape ? min(400, g.size.width * 0.46) : g.size.width,
                           height: landscape ? min(g.size.height, free) : min(g.size.height * 0.56, free - 40))
                    .background(Tokens.surface.opacity(0.97))
                    .overlay(alignment: landscape ? .leading : .top) {
                        Rectangle().fill(Tokens.borderStrong).frame(width: landscape ? 1 : nil, height: landscape ? nil : 1)
                    }
                    .padding(.bottom, keyboard.height > 0 ? max(0, keyboard.height - g.safeAreaInsets.bottom) : 0)
                    .frame(maxHeight: .infinity, alignment: landscape && keyboard.height == 0 ? .center : .bottom)
            }
            .animation(.easeOut(duration: 0.2), value: keyboard.height)
        }
        .ignoresSafeArea(.keyboard)
        .onAppear {
            name = initialName
            sound.router?.refresh()
            skins?.reload()
        }
    }

    private var panel: some View {
        VStack(spacing: 0) {
            HStack {
                Text(L("game_settings_title")).font(.title3.weight(.semibold)).foregroundStyle(Tokens.text)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                SwiftUI.Button(action: onClose) {
                    Image(systemName: "xmark").font(.system(size: 15, weight: .semibold))
                        .frame(width: 36, height: 36)
                        .overlay(Circle().stroke(Tokens.borderStrong, lineWidth: 1))
                        .frame(width: Tokens.control, height: Tokens.control)
                }
                .foregroundStyle(Tokens.text)
                .accessibilityLabel(L("drawer_close"))
                .accessibilityIdentifier("game-settings-close")
            }
            .padding(.leading, 18).padding(.trailing, 8).padding(.top, 8)
            Rectangle().fill(Tokens.border).frame(height: 1)
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    pictureSection
                    if let skins { SkinSection(skins: skins) }
                    section(L("game_settings_sound"))
                    slider(L("sound_game"), value: sound.game, tag: "sound-game")
                    slider(L("sound_voices"), value: sound.voices, tag: "sound-voices")
                    if let router = sound.router { SoundDevices(router: router, test: sound.test) }
                    section(L("game_settings_name"))
                    NameField(text: $name, identifier: "game-name", allowEmpty: true) {
                        if NameField.canSave(name, allowEmpty: true) { saveName() }
                    }
                    .onChange(of: name) { _, _ in saved = false }
                    SecondaryButton(title: L("settings_save"), icon: saved ? "checkmark" : nil, enabled: NameField.canSave(name, allowEmpty: true), action: saveName)
                        .accessibilityIdentifier("game-name-save")
                    Toggle(isOn: $statsOn) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(L("game_settings_stats")).foregroundStyle(Tokens.text)
                            Text(L("game_settings_stats_hint")).font(.caption).foregroundStyle(Tokens.faint)
                        }
                    }
                    .tint(Tokens.accent)
                    .padding(.top, 6)
                    .accessibilityIdentifier("settings-stats")
                }
                .padding(.horizontal, 18).padding(.vertical, 14)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("game-settings")
    }

    // MARK: Picture

    @ViewBuilder private var pictureSection: some View {
        section(L("picture_title"))
        if picture.available {
            Text(L("picture_note")).font(.caption).foregroundStyle(Tokens.faint)
            Text(L("picture_style")).font(.footnote).foregroundStyle(Tokens.muted)
            VStack(spacing: 6) {
                ForEach(PictureStyle.allCases, id: \.self) { s in
                    choice(s.title, s.detail, selected: picture.settings.style == s, tag: "picture-style-\(s.rawValue)") {
                        picture.style = s
                    }
                }
            }
            Text(L("picture_bands")).font(.footnote).foregroundStyle(Tokens.muted).padding(.top, 4)
            VStack(spacing: 6) {
                ForEach(PictureBands.allCases, id: \.self) { b in
                    choice(b.title, b.detail, selected: picture.settings.bands == b, tag: "picture-bands-\(b.rawValue)") {
                        picture.bands = b
                    }
                }
            }
            if let room = picture.room {
                HStack(spacing: 8) {
                    Text(L("picture_room_default", room.style.title, room.bands.title))
                        .font(.caption).foregroundStyle(Tokens.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("picture-room-default")
                    Spacer(minLength: 0)
                    if picture.offersRoomDefault {
                        SwiftUI.Button(L("picture_use_room_default")) { picture.useRoomDefault() }
                            .font(.caption.weight(.semibold)).foregroundStyle(Tokens.accent)
                            .frame(minHeight: Tokens.control)
                            .accessibilityIdentifier("picture-use-room-default")
                    }
                }
            }
            Toggle(isOn: $picture.compare) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(L("picture_compare")).foregroundStyle(Tokens.text)
                    Text(L("picture_compare_hint")).font(.caption).foregroundStyle(Tokens.faint)
                }
            }
            .tint(Tokens.accent)
            .accessibilityIdentifier("picture-compare")
        } else {
            Notice(text: L("picture_unavailable"))
        }
    }

    /** One option of a list: a radio mark, its name and what it does. */
    private func choice(_ title: String, _ detail: String, selected: Bool, tag: String, action: @escaping () -> Void) -> some View {
        SwiftUI.Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                    .font(.system(size: 18)).foregroundStyle(selected ? Tokens.accent : Tokens.faint)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Tokens.text)
                    Text(detail).font(.caption).foregroundStyle(Tokens.muted).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12).padding(.vertical, 7)
            .frame(minHeight: Tokens.control)
            .background(RoundedRectangle(cornerRadius: 14).fill(selected ? Tokens.accentTint : Tokens.surface2))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(selected ? Tokens.accentTintBorder : .clear, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier(tag)
    }

    // MARK: Pieces

    private func section(_ title: String) -> some View {
        HStack(spacing: 10) {
            Text(title.uppercased()).font(.system(size: 12, weight: .semibold, design: .monospaced)).foregroundStyle(Tokens.faint)
                .fixedSize()
            Rectangle().fill(Tokens.border).frame(height: 1)
        }
        .padding(.top, 8)
        .accessibilityAddTraits(.isHeader)
    }

    private func slider(_ title: String, value: Binding<Double>, tag: String) -> some View {
        HStack(spacing: 12) {
            Text(title).font(.subheadline).foregroundStyle(Tokens.text2).frame(width: 70, alignment: .leading)
            Slider(value: value, in: 0...1, step: 0.05).tint(Tokens.accent).accessibilityIdentifier(tag)
            Text("\(Int((value.wrappedValue * 100).rounded())) %").font(.system(size: 13, design: .monospaced))
                .foregroundStyle(Tokens.muted).frame(width: 52, alignment: .trailing)
        }
    }

    private func saveName() {
        onSaveName(name)
        saved = true
    }
}

/**
 * Skin: the console shell around the picture and its controls. Every skin
 * is a file; the list shows the built-in ones and those added to the
 * app's Skins folder in the Files app.
 */
private struct SkinSection: View {
    @ObservedObject var skins: SkinStore
    @State private var installing = false
    @State private var deleting: PadSkin?

    var body: some View {
        HStack(spacing: 10) {
            Text(L("skin_title").uppercased()).font(.system(size: 12, weight: .semibold, design: .monospaced)).foregroundStyle(Tokens.faint)
                .fixedSize()
            Rectangle().fill(Tokens.border).frame(height: 1)
        }
        .padding(.top, 8)
        .accessibilityAddTraits(.isHeader)
        Text(L("skin_note")).font(.caption).foregroundStyle(Tokens.faint)
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 8)], spacing: 8) {
            ForEach(skins.catalog.skins) { s in
                let custom = skins.isCustom(s.id)
                tile(id: s.id, name: s.displayName, author: custom ? L("skin_custom_badge") : s.author, custom: custom, swatch: AnyView(
                    Circle()
                        .fill(RadialGradient(colors: [Color(hex: s.center), Color(hex: s.edge)], center: .center, startRadius: 0, endRadius: 20))
                        .overlay(Circle().stroke(Color(hex: s.rim), lineWidth: 2))
                        .overlay(Circle().fill(s.controls == .light ? Color(hex: 0xE5EEF0) : Color(hex: 0x222229)).frame(width: 12, height: 12))
                ))
                .contextMenu {
                    // Only installed skins can go; the app's own stay.
                    if custom {
                        SwiftUI.Button(role: .destructive) { deleting = s } label: { Label(L("skin_delete"), systemImage: "trash") }
                    }
                }
            }
        }
        SecondaryButton(title: L("skin_install"), icon: "square.and.arrow.down") { installing = true }
            .accessibilityIdentifier("skin-install")
        Text(L("skin_folder_hint")).font(.caption).foregroundStyle(Tokens.faint)
            .fullScreenCover(isPresented: $installing) {
                InstallSkinView(skins: skins) { installing = false }
            }
            .alert(L("skin_delete_title", deleting?.displayName ?? ""), isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
                SwiftUI.Button(L("skin_delete"), role: .destructive) {
                    if let id = deleting?.id { skins.remove(id) }
                    deleting = nil
                }
                SwiftUI.Button(L("skin_install_cancel"), role: .cancel) { deleting = nil }
            } message: {
                Text(L("skin_delete_body"))
            }
    }

    private func tile(id: String, name: String, author: String, custom: Bool = false, swatch: AnyView) -> some View {
        let selected = skins.selectedId == id
        return SwiftUI.Button { skins.choose(id) } label: {
            VStack(spacing: 6) {
                swatch.frame(width: 36, height: 36)
                Text(name).font(.footnote.weight(.semibold)).foregroundStyle(Tokens.text).lineLimit(1)
                if !author.isEmpty && author != "go-link" {
                    Text(author).font(.caption2).foregroundStyle(custom ? Tokens.accent : Tokens.muted).lineLimit(1)
                }
            }
            .padding(.vertical, 10).padding(.horizontal, 6)
            .frame(maxWidth: .infinity, minHeight: 84)
            .background(RoundedRectangle(cornerRadius: 14).fill(selected ? Tokens.accentTint : Tokens.surface2))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(selected ? Tokens.accentTintBorder : .clear, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityLabel(custom ? L("skin_custom", name) : name)
        .accessibilityIdentifier("skin-\(id)")
    }
}

/**
 * The microphone (Automatic, the iPhone's, or a headset's), the output
 * through the system's route picker (speaker, headphones, AirPods; never
 * the earpiece) and a test chime.
 */
private struct SoundDevices: View {
    @ObservedObject var router: AudioRouter
    let test: () -> Void

    var body: some View {
        Text(L("sound_microphone")).font(.footnote).foregroundStyle(Tokens.muted).padding(.top, 4)
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
            Spacer(minLength: 0)
        }
        SecondaryButton(title: L("sound_test"), icon: "speaker.wave.2.fill", action: test)
            .accessibilityIdentifier("sound-test")
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
