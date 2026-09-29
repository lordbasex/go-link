// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import GoLinkCore
import SwiftUI

/**
 * The player-name rules as the screens show them (GoLinkCore.PlayerName,
 * the device's hello.name rules): a hint under the field, a "n/20"
 * counter, and the field's border: red for a symbol or an emoji, orange
 * when the name can be used.
 */
enum NameRules {
    static let maxTyped = 30

    static func hint(_ check: NameCheck) -> String {
        switch check {
        case .invalid: return L("name_hint_invalid")
        case .empty, .tooShort: return L("name_hint_short")
        case .tooLong: return L("name_hint_long")
        case .ok: return L("name_hint_ok")
        }
    }

    static func border(_ check: NameCheck) -> Color {
        switch check {
        case .invalid, .tooLong: return Tokens.rec
        case .ok: return Tokens.accent
        default: return Tokens.borderInput
        }
    }
}

/** A name field with the rules' hint and counter. allowEmpty: Settings and the room may clear the name. */
struct NameField: View {
    @Binding var text: String
    var identifier: String
    var allowEmpty = false
    var big = false
    var onSubmit: () -> Void = {}

    var body: some View {
        let check = PlayerName.check(text)
        let showHint = !(allowEmpty && check == .empty)
        VStack(alignment: .leading, spacing: 6) {
            TextField("", text: $text, prompt: Text(L("settings_name_placeholder")).foregroundStyle(Tokens.placeholder))
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .submitLabel(.done)
                .onSubmit(onSubmit)
                .onChange(of: text) { _, v in
                    if v.count > NameRules.maxTyped { text = String(v.prefix(NameRules.maxTyped)) }
                }
                .font(big ? .system(size: 18, weight: .medium) : .body)
                .foregroundStyle(Tokens.text)
                .tint(Tokens.accent)
                .padding(.horizontal, 20)
                .frame(minHeight: big ? 54 : Tokens.control)
                .background(Capsule().fill(Tokens.sunken))
                .overlay(Capsule().stroke(text.isEmpty ? Tokens.borderInput : NameRules.border(check), lineWidth: 1.5))
                .accessibilityLabel(L("you_name"))
                .accessibilityIdentifier(identifier)
            HStack(alignment: .firstTextBaseline) {
                Text(showHint ? NameRules.hint(check) : L("name_hint_empty_ok"))
                    .font(.footnote)
                    .foregroundStyle(check == .invalid || check == .tooLong ? Tokens.dangerText : Tokens.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier(identifier.replacingOccurrences(of: "-field", with: "") + "-hint")
                Spacer(minLength: 8)
                Text("\(PlayerName.length(text))/\(PlayerName.max)")
                    .font(.footnote.monospacedDigit()).foregroundStyle(Tokens.faint)
                    .accessibilityLabel(L("name_counter", PlayerName.length(text), PlayerName.max))
            }
            .padding(.horizontal, 4)
        }
    }

    /** Whether Save may be pressed with this text. */
    static func canSave(_ text: String, allowEmpty: Bool) -> Bool {
        let c = PlayerName.check(text)
        return c == .ok || (allowEmpty && c == .empty)
    }
}

/**
 * "What's your name?": after the invitation and the PIN were accepted,
 * before the room, once per visit (the approved design). Prefilled with
 * the saved name; the name is saved for the next game.
 */
struct AliasView: View {
    let initial: String
    let onEnter: (String) -> Void
    let onBack: () -> Void
    @State private var name = ""
    @FocusState private var focused: Bool

    var body: some View {
        let ok = PlayerName.isValid(name)
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                SwiftUI.Button(action: onBack) {
                    HStack(spacing: 6) {
                        Image(systemName: "chevron.backward")
                        Text(L("back"))
                    }
                    .font(.system(size: 15)).foregroundStyle(Tokens.muted)
                    .frame(minHeight: Tokens.control)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("alias-back")
                Image(systemName: "person")
                    .font(.system(size: 28, weight: .semibold)).foregroundStyle(Tokens.accent)
                    .frame(width: 64, height: 64)
                    .background(RoundedRectangle(cornerRadius: 18).fill(Tokens.surface2))
                    .overlay(RoundedRectangle(cornerRadius: 18).stroke(Tokens.borderStrong, lineWidth: 1))
                    .accessibilityHidden(true)
                    .padding(.top, 8)
                Text(L("alias_title")).font(.system(size: 32, weight: .bold)).foregroundStyle(Tokens.text)
                    .accessibilityAddTraits(.isHeader)
                Text(L("alias_text")).font(.body).foregroundStyle(Tokens.text2).fixedSize(horizontal: false, vertical: true)
                Text(L("alias_label")).font(.subheadline).foregroundStyle(Tokens.text2).padding(.top, 6)
                NameField(text: $name, identifier: "alias-field", big: true) { if ok { onEnter(name) } }
                    .focused($focused)
                Spacer(minLength: 24)
                Text(L("alias_remember")).font(.footnote).foregroundStyle(Tokens.faint).frame(maxWidth: .infinity)
                SwiftUI.Button { onEnter(name) } label: {
                    Text(L("alias_enter")).font(.system(size: 17, weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: 54)
                        .foregroundStyle(ok ? Tokens.onAccent : Tokens.faint)
                        .background(Capsule().fill(ok ? Tokens.accent : Tokens.borderStrong))
                }
                .buttonStyle(.plain)
                .disabled(!ok)
                .accessibilityIdentifier("alias-enter")
            }
            .frame(maxWidth: 480)
            .padding(.horizontal, 24).padding(.vertical, 16)
            .frame(maxWidth: .infinity)
        }
        .scrollBounceBehavior(.basedOnSize)
        .background(Tokens.bg.ignoresSafeArea())
        .onAppear { name = initial }
    }
}
