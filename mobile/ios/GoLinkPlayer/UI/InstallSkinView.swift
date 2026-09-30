// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import GoLinkCore
import SwiftUI
import UIKit

/**
 * Install skin: paste a skin's JSON (made in the website's skin editor or
 * shared by someone), check it, see it drawn by the real skin painter in
 * portrait and landscape, and install it in the Skins folder, where it
 * shows as "Custom · <name>". Installed skins can be deleted here.
 */
struct InstallSkinView: View {
    @ObservedObject var skins: SkinStore
    let onClose: () -> Void
    @State private var text = ""
    @State private var outcome: SkinCheck.Outcome?
    @State private var landscape = false
    @State private var askReplace = false
    @State private var installed: PadSkin?
    @State private var saveFailed = false
    @State private var deleting: PadSkin?
    @FocusState private var editing: Bool

    var body: some View {
        VStack(spacing: 0) {
            TopBar(title: L("skin_install_title"), back: onClose)
            ScrollViewReader { scroll in
            ScrollView {
                VStack(spacing: 16) {
                    Card {
                        Text(L("skin_install_explain")).font(.subheadline).foregroundStyle(Tokens.muted)
                        editor
                        HStack(spacing: 10) {
                            SecondaryButton(title: L("skin_install_paste"), icon: "doc.on.clipboard") {
                                if let s = UIPasteboard.general.string { text = s; check() }
                            }
                            .accessibilityIdentifier("skin-install-paste")
                            PrimaryButton(title: L("skin_install_check"), enabled: !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) { check() }
                                .accessibilityIdentifier("skin-install-check")
                        }
                        result
                    }
                    if case .ready(let r) = outcome { preview(r).id("preview") }
                    installedList
                }
                .padding(16)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: previewShown) { _, shown in
                guard shown else { return }
                // Once the keyboard is gone, so the preview lands where it can be seen.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                    withAnimation { scroll.scrollTo("preview", anchor: .top) }
                }
            }
            }
        }
        .background(Tokens.bg.ignoresSafeArea())
        .alert(L("skin_install_replace_title", readyName), isPresented: $askReplace) {
            SwiftUI.Button(L("skin_install_replace"), role: .destructive) { doInstall() }
            SwiftUI.Button(L("skin_install_cancel"), role: .cancel) {}
        } message: {
            Text(L("skin_install_replace_body"))
        }
        .alert(L("skin_install_done_title", installed?.displayName ?? ""), isPresented: Binding(get: { installed != nil }, set: { if !$0 { installed = nil } })) {
            SwiftUI.Button(L("skin_install_use_now")) {
                if let id = installed?.id { skins.choose(id) }
                installed = nil
            }
            .accessibilityIdentifier("skin-install-use")
            SwiftUI.Button(L("skin_install_later"), role: .cancel) { installed = nil }
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
        .onChange(of: text) { _, _ in if outcome != nil { outcome = nil } }
    }

    // MARK: - Editor and result

    private var editor: some View {
        TextEditor(text: $text)
            .font(.system(size: 13, design: .monospaced))
            .foregroundStyle(Tokens.text)
            .tint(Tokens.accent)
            .scrollContentBackground(.hidden)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .padding(8)
            .frame(minHeight: 170, maxHeight: 260)
            .background(RoundedRectangle(cornerRadius: 14).fill(Tokens.sunken))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Tokens.borderInput, lineWidth: 1))
            .overlay(alignment: .topLeading) {
                if text.isEmpty {
                    Text("{ \"format\": 1, \"id\": \"my-skin\", … }").font(.system(size: 13, design: .monospaced))
                        .foregroundStyle(Tokens.placeholder).padding(14).allowsHitTesting(false)
                }
            }
            .accessibilityLabel(L("skin_install_text"))
            .accessibilityIdentifier("skin-install-text")
            .focused($editing)
    }

    @ViewBuilder private var result: some View {
        switch outcome {
        case .failed(let f):
            Notice(text: message(f), danger: true).accessibilityIdentifier("skin-install-error")
        case .ready(let r):
            if !r.warnings.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text(L("skin_install_warn_title")).font(.footnote.weight(.semibold)).foregroundStyle(Tokens.text)
                    ForEach(Array(r.warnings.enumerated()), id: \.offset) { _, w in
                        Label(message(w), systemImage: "exclamationmark.triangle").font(.footnote).foregroundStyle(Tokens.text2)
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("skin-install-warnings")
            } else {
                Label(L("skin_install_ok"), systemImage: "checkmark.circle").font(.footnote).foregroundStyle(Tokens.text2)
                    .accessibilityIdentifier("skin-install-ok")
            }
        case nil:
            EmptyView()
        }
    }

    // MARK: - Preview

    private func preview(_ r: SkinCheck.Ready) -> some View {
        Card {
            Text(L("skin_install_preview")).font(.headline).foregroundStyle(Tokens.text)
            Picker("", selection: $landscape) {
                Text(L("skin_orient_portrait")).tag(false)
                Text(L("skin_orient_landscape")).tag(true)
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("skin-install-orientation")
            SkinPreview(skin: r.skin, landscape: landscape)
                .frame(maxWidth: .infinity)
                .frame(height: landscape ? 190 : 420)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(L("skin_install_preview"))
                .accessibilityIdentifier("skin-install-preview")
            VStack(alignment: .leading, spacing: 4) {
                Text(r.skin.displayName).font(.title3.weight(.semibold)).foregroundStyle(Tokens.text)
                    .accessibilityIdentifier("skin-install-name")
                Text("\(L("skin_install_id")): \(r.skin.id)").font(.footnote.monospaced()).foregroundStyle(Tokens.muted)
                if !r.skin.author.isEmpty {
                    Text("\(L("skin_install_author")): \(r.skin.author)").font(.footnote).foregroundStyle(Tokens.muted)
                }
            }
            if r.replaces { Notice(text: L("skin_install_replace_body")) }
            if saveFailed { Notice(text: L("skin_install_save_failed"), danger: true) }
            HStack(spacing: 10) {
                SecondaryButton(title: L("skin_install_cancel")) {
                    outcome = nil
                    text = ""
                }
                .accessibilityIdentifier("skin-install-cancel")
                PrimaryButton(title: L("skin_install_install")) {
                    if r.replaces { askReplace = true } else { doInstall() }
                }
                .accessibilityIdentifier("skin-install-install")
            }
        }
    }

    // MARK: - Installed skins

    @ViewBuilder private var installedList: some View {
        let custom = skins.catalog.skins.filter { skins.isCustom($0.id) }
        if !custom.isEmpty {
            Card {
                Text(L("skin_install_installed")).font(.headline).foregroundStyle(Tokens.text)
                ForEach(custom) { s in
                    HStack(spacing: 12) {
                        Circle().fill(RadialGradient(colors: [Color(hex: s.center), Color(hex: s.edge)], center: .center, startRadius: 0, endRadius: 16))
                            .overlay(Circle().stroke(Color(hex: s.rim), lineWidth: 2))
                            .frame(width: 30, height: 30)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(L("skin_custom", s.displayName)).foregroundStyle(Tokens.text)
                            Text(s.id).font(.caption.monospaced()).foregroundStyle(Tokens.faint)
                        }
                        Spacer()
                        SwiftUI.Button { deleting = s } label: {
                            Image(systemName: "trash").frame(width: Tokens.control, height: Tokens.control)
                        }
                        .foregroundStyle(Tokens.dangerText)
                        .accessibilityLabel(L("skin_delete"))
                        .accessibilityIdentifier("skin-delete-\(s.id)")
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("skin-installed-\(s.id)")
                }
            }
        }
    }

    // MARK: - Actions

    private var readyName: String {
        if case .ready(let r) = outcome { return r.skin.displayName }
        return ""
    }

    private var previewShown: Bool {
        if case .ready = outcome { return true }
        return false
    }

    private func check() {
        editing = false
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        saveFailed = false
        outcome = SkinCheck.check(text, builtIns: skins.builtInIds, installed: skins.customIds)
    }

    private func doInstall() {
        guard case .ready(let r) = outcome else { return }
        if skins.install(r) {
            outcome = nil
            text = ""
            installed = skins.catalog.skin(r.skin.id) ?? r.skin
        } else {
            saveFailed = true
        }
    }

    // MARK: - Messages

    private func message(_ f: SkinCheck.Failure) -> String {
        switch f {
        case .empty: return L("skin_install_error_empty")
        case .tooLarge: return L("skin_install_error_large")
        case .notJson(let line?, let column?): return L("skin_install_error_json_at", line, column)
        case .notJson: return L("skin_install_error_json")
        case .format(let v): return L("skin_install_error_format", v)
        case .missing(let key): return L("skin_install_error_missing", key)
        case .badValue(let key): return L("skin_install_error_bad", key)
        case .builtInId(let id): return L("skin_install_error_builtin", id)
        }
    }

    private func message(_ w: SkinCheck.Warning) -> String {
        switch w {
        case .missingPictures(let names):
            return L("skin_warn_pictures", names.joined(separator: ", "))
        case .layout(let landscape, let part, let problem):
            let where_ = L(landscape ? "skin_orient_landscape" : "skin_orient_portrait")
            switch problem {
            case .offScreen: return L("skin_warn_off", where_, partName(part))
            case .onPicture: return L("skin_warn_picture", where_, partName(part))
            case .tooSmall: return L("skin_warn_small", where_, partName(part))
            case .overlaps(let other): return L("skin_warn_overlap", where_, partName(part), partName(other))
            }
        }
    }

    private func partName(_ p: SkinCheck.Part) -> String {
        switch p {
        case .dpad: return L("skin_part_dpad")
        case .coin: return "Coin"
        case .button(let n): return L("skin_part_button", n)
        case .start(let n): return L("skin_part_start", n)
        case .menu: return L("skin_part_menu")
        }
    }
}

/**
 * A skin drawn by the room's own painter on a virtual phone (an iPhone 17
 * sized screen with its safe area), scaled down to fit, with a simple test
 * card in the screen. It only shows: touches do nothing.
 */
struct SkinPreview: View {
    let skin: PadSkin
    let landscape: Bool
    @StateObject private var pad = PreviewPad()

    var body: some View {
        let size = landscape ? CGSize(width: 874, height: 402) : CGSize(width: 402, height: 874)
        let insets = landscape ? EdgeInsets(top: 0, leading: 62, bottom: 21, trailing: 62) : EdgeInsets(top: 62, leading: 0, bottom: 34, trailing: 0)
        let safe = CGSize(width: size.width - insets.leading - insets.trailing, height: size.height - insets.top - insets.bottom)
        GeometryReader { g in
            let scale = min(g.size.width / size.width, g.size.height / size.height)
            SkinConsoleLayout(
                skin: skin,
                picture: nil,
                landscape: landscape,
                size: safe,
                insets: insets,
                pad: pad.state,
                controls: GameControls(players: 2, buttons: 6, control: "joy8way"),
                starts: 2,
                myPorts: [1],
                aspect: 4.0 / 3.0,
                keepDock: true,
                header: { _ in AnyView(Text(L("skin_install_preview")).font(.footnote).foregroundStyle(.white.opacity(0.7)).frame(height: Tokens.control)) },
                screen: AnyView(PreviewCard()),
                dock: { vertical in AnyView(PreviewDock(vertical: vertical)) }
            )
            .frame(width: size.width, height: size.height)
            .clipShape(RoundedRectangle(cornerRadius: landscape ? 36 : 48))
            .scaleEffect(scale, anchor: .topLeading)
            .frame(width: size.width * scale, height: size.height * scale, alignment: .topLeading)
            .frame(width: g.size.width, height: g.size.height)
            .allowsHitTesting(false)
        }
    }
}

@MainActor
private final class PreviewPad: ObservableObject {
    let state = TouchPadState { _ in }
}

/** A plain test card for the preview: gray grid, color bars and gray steps. */
private struct PreviewCard: View {
    private static let bars: [UInt32] = [0xC0C0C0, 0xC0C000, 0x00C0C0, 0x00C000, 0xC000C0, 0xC00000, 0x0000C0]

    var body: some View {
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            ZStack {
                Color(hex: 0x6E6E6E)
                Path { p in
                    let step = w / 16
                    var x = step
                    while x < w { p.move(to: CGPoint(x: x, y: 0)); p.addLine(to: CGPoint(x: x, y: h)); x += step }
                    var y = step
                    while y < h { p.move(to: CGPoint(x: 0, y: y)); p.addLine(to: CGPoint(x: w, y: y)); y += step }
                }
                .stroke(.white, lineWidth: 1)
                VStack(spacing: 0) {
                    HStack(spacing: 0) {
                        ForEach(Self.bars, id: \.self) { c in Color(hex: c) }
                    }
                    .frame(height: h * 0.24)
                    HStack(spacing: 0) {
                        ForEach(0..<8, id: \.self) { i in Color(white: Double(i) / 7) }
                    }
                    .frame(height: h * 0.1)
                    Text("GO-LINK").font(.system(size: h * 0.1, weight: .bold, design: .monospaced)).foregroundStyle(Tokens.accent)
                        .frame(maxWidth: .infinity, maxHeight: .infinity).background(Color.black)
                }
                .frame(width: w * 0.62, height: h * 0.64)
            }
        }
        .background(Tokens.video)
    }
}

/** Four round buttons standing for the room's menu in the preview. */
private struct PreviewDock: View {
    let vertical: Bool

    var body: some View {
        let layout = vertical ? AnyLayout(VStackLayout(spacing: 8)) : AnyLayout(HStackLayout(spacing: 8))
        layout {
            ForEach(["mic", "speaker.wave.2", "bubble.left", "gearshape"], id: \.self) { icon in
                Image(systemName: icon).font(.system(size: 14, weight: .semibold)).foregroundStyle(.white.opacity(0.8))
                    .frame(width: 36, height: 36).background(Circle().fill(Color.white.opacity(0.1)))
            }
        }
        .padding(6)
    }
}
