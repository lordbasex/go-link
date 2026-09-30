// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import AVFoundation
import GoLinkCore
import SwiftUI

/**
 * Settings: the player name, the signaling server and the startup sound.
 * The server works like the website's "Signaling server" button: only
 * wss://, tested for a hello before saving, and the way back to the
 * official server. Links and QR codes never change it.
 */
struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var name = ""
    @State private var nameSaved = false
    @State private var server = ""
    @State private var testing = false
    @State private var serverMessage: (String, Bool)?
    @State private var startupSound = true
    @StateObject private var skins = SkinStore()
    @State private var installSkin = false

    var body: some View {
        VStack(spacing: 0) {
            TopBar(title: L("settings_title")) { model.screen = .home }
            ScrollView {
                VStack(spacing: 16) {
                    Card {
                        Text(L("settings_name")).font(.headline).foregroundStyle(Tokens.text)
                        NameField(text: $name, identifier: "settings-name", allowEmpty: true) {
                            if NameField.canSave(name, allowEmpty: true) { saveName() }
                        }
                        .onChange(of: name) { _, _ in nameSaved = false }
                        SecondaryButton(title: L("settings_save"), icon: nameSaved ? "checkmark" : nil, enabled: NameField.canSave(name, allowEmpty: true)) { saveName() }
                            .accessibilityIdentifier("settings-name-save")
                        Text(L("settings_name_hint")).font(.caption).foregroundStyle(Tokens.faint)
                    }
                    Card {
                        Text(L("settings_server")).font(.headline).foregroundStyle(Tokens.text)
                        Text(L("settings_server_explain")).font(.subheadline).foregroundStyle(Tokens.muted)
                        if model.signal.custom {
                            ServerIndicator(url: model.signal.url) {
                                model.setSignal(nil)
                                serverMessage = nil
                            }
                        } else {
                            Label(L("settings_server_official"), systemImage: "checkmark.shield").font(.subheadline).foregroundStyle(Tokens.text2)
                        }
                        Text(L("settings_server_url")).font(.footnote).foregroundStyle(Tokens.muted)
                        TextField("", text: $server, prompt: Text("wss://").foregroundStyle(Tokens.placeholder))
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .submitLabel(.go)
                            .onSubmit { if !testing && !server.isEmpty { testAndSave() } }
                            .goLinkField(mono: true)
                            .accessibilityIdentifier("settings-server")
                        PrimaryButton(title: L(testing ? "settings_server_testing" : "settings_server_test_save"), enabled: !testing && !server.isEmpty) { testAndSave() }
                            .accessibilityIdentifier("settings-server-save")
                        if let (text, ok) = serverMessage { Notice(text: text, danger: !ok) }
                    }
                    Card {
                        Toggle(isOn: $startupSound) {
                            Text(L("settings_startup_sound")).font(.headline).foregroundStyle(Tokens.text)
                        }
                        .tint(Tokens.accent)
                        .frame(minHeight: Tokens.control)
                        .onChange(of: startupSound) { _, on in model.prefs.startupSound = on }
                        .accessibilityIdentifier("settings-startup-sound")
                        Text(L("settings_startup_sound_hint")).font(.caption).foregroundStyle(Tokens.faint)
                    }
                    Card {
                        Text(L("settings_skins")).font(.headline).foregroundStyle(Tokens.text)
                        Text(L("settings_skins_hint")).font(.subheadline).foregroundStyle(Tokens.muted)
                        SecondaryButton(title: L("skin_install"), icon: "square.and.arrow.down") { installSkin = true }
                            .accessibilityIdentifier("settings-install-skin")
                    }
                    Card {
                        Text(L("settings_permissions")).font(.headline).foregroundStyle(Tokens.text)
                        permissionRow(L("settings_perm_camera"), AVCaptureDevice.authorizationStatus(for: .video) == .authorized)
                        permissionRow(L("settings_perm_mic"), AudioRouter.micPermission == .granted)
                        Text(L("settings_permissions_note")).font(.caption).foregroundStyle(Tokens.faint)
                        SecondaryButton(title: L("perm_open_settings"), icon: "gear") {
                            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                        }
                    }
                    Text(L("settings_about_ios", Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""))
                        .font(.footnote).foregroundStyle(Tokens.faint)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    AppVersionText()
                }
                .frame(maxWidth: 520)
                .padding(20)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .fullScreenCover(isPresented: $installSkin) {
            InstallSkinView(skins: skins) { installSkin = false }
        }
        .onAppear {
            name = model.prefs.playerName
            startupSound = model.prefs.startupSound
            server = model.signal.custom ? model.signal.url : ""
        }
    }

    private func saveName() {
        model.setName(name)
        name = model.prefs.playerName
        nameSaved = true
    }

    private func permissionRow(_ title: String, _ on: Bool) -> some View {
        HStack {
            Text(title).foregroundStyle(Tokens.text2)
            Spacer()
            Text(L(on ? "settings_perm_on" : "settings_perm_off")).foregroundStyle(on ? Tokens.accent : Tokens.faint)
        }
        .font(.subheadline)
        .frame(minHeight: 32)
    }

    private func testAndSave() {
        switch SignalUrls.check(server, allowDevHosts: Prefs.allowDevHosts) {
        case .bad(.scheme):
            serverMessage = (L("settings_server_bad_scheme"), false)
        case .bad(.format):
            serverMessage = (L("settings_server_bad_format"), false)
        case let .ok(url):
            testing = true
            serverMessage = nil
            SignalClient.test(url: url, factory: URLSessionSockets(), scheduler: MainScheduler.shared) { problem in
                testing = false
                if problem == nil {
                    model.setSignal(url)
                    serverMessage = (L("settings_server_saved"), true)
                } else {
                    serverMessage = (L("settings_server_no_answer"), false)
                }
            }
        }
    }
}
