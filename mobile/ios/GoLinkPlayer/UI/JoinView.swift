// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import GoLinkCore
import SwiftUI

/**
 * The PIN form, like the website's JoinForm: the invitation (fixed when it
 * came from a QR code or a link, or typed: the 9-digit code or the link),
 * the 6-digit PIN the host gave this person, and the terms. The PIN is
 * always asked on a new join, and never travels in a link or a QR code.
 */
struct JoinView: View {
    let fixedTarget: InviteTarget?
    @EnvironmentObject private var model: AppModel
    @State private var code = ""
    @State private var pin = ""
    @State private var agreed = false
    @State private var askTerms = false
    @FocusState private var focus: Field?
    /** The code field is a UIKit field (CodeField), outside @FocusState. */
    @State private var codeFocused = false

    enum Field { case pin }

    private var target: InviteTarget? { fixedTarget ?? Invites.parseTyped(code) }
    private var ready: Bool { target != nil && Invites.isPin(pin) }

    var body: some View {
        VStack(spacing: 0) {
            TopBar(title: L("join_title")) { model.screen = .home }
            ScrollView {
                Card {
                    if let fixedTarget {
                        Text(L("join_invitation")).font(.footnote).foregroundStyle(Tokens.muted)
                        HStack(spacing: 8) {
                            Image(systemName: "link").foregroundStyle(Tokens.accent)
                            Text(fixedTarget.display).font(.system(size: 14, design: .monospaced)).foregroundStyle(Tokens.text)
                                .lineLimit(2).minimumScaleFactor(0.7)
                                .accessibilityIdentifier("join-target")
                        }
                    } else {
                        Text(L("join_code_label")).font(.footnote).foregroundStyle(Tokens.muted)
                        CodeField(text: $code, focused: $codeFocused, placeholder: "123 456 789", identifier: "join-code") {
                            codeFocused = false
                            focus = .pin
                        }
                        .goLinkField(mono: true)
                        .overlay(Capsule().stroke(!code.isEmpty && target == nil ? Tokens.dangerBorder : .clear, lineWidth: 1))
                        Text(L("join_code_hint")).font(.caption).foregroundStyle(Tokens.faint)
                    }
                    Text(L("join_pin_label")).font(.footnote).foregroundStyle(Tokens.muted).padding(.top, 4)
                    HStack(spacing: 10) {
                        Image(systemName: "lock.fill").foregroundStyle(Tokens.faint)
                        TextField("", text: $pin, prompt: Text("000000").foregroundStyle(Tokens.placeholder))
                            .keyboardType(.numberPad)
                            .textContentType(.oneTimeCode)
                            .kerning(6)
                            .focused($focus, equals: .pin)
                            .onChange(of: pin) { _, v in
                                let digits = String(v.filter(\.isASCIIDigit).prefix(6))
                                if digits != v { pin = digits }
                            }
                            .accessibilityIdentifier("join-pin")
                    }
                    .goLinkField(mono: true, big: true)
                    Text(L("join_pin_hint")).font(.caption).foregroundStyle(Tokens.faint)
                    TermsCheck(agreed: $agreed, showError: askTerms)
                    PrimaryButton(title: L("join_button"), enabled: ready) { submit() }
                        .accessibilityIdentifier("join-button")
                }
                .frame(maxWidth: 480)
                .padding(20)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .onAppear {
            agreed = model.termsAccepted
            if fixedTarget == nil { codeFocused = true } else { focus = .pin }
        }
    }

    private func submit() {
        guard let target, ready else { return }
        if !agreed {
            askTerms = true
            return
        }
        model.join(target, pin: pin)
    }
}

/** The terms checkbox, with links to the terms of use and the privacy policy. */
struct TermsCheck: View {
    @Binding var agreed: Bool
    var showError: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            SwiftUI.Button { agreed.toggle() } label: {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: agreed ? "checkmark.square.fill" : "square")
                        .font(.system(size: 22))
                        .foregroundStyle(agreed ? Tokens.accent : Tokens.borderStrong)
                    Text(L("join_terms")).font(.subheadline).foregroundStyle(Tokens.text2).multilineTextAlignment(.leading)
                }
                .frame(minHeight: Tokens.control)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(agreed ? .isSelected : [])
            .accessibilityIdentifier("terms-check")
            HStack(spacing: 18) {
                Link(L("join_terms_link"), destination: URL(string: Terms.termsURL)!)
                Link(L("join_privacy_link"), destination: URL(string: Terms.privacyURL)!)
            }
            .font(.subheadline)
            .foregroundStyle(Tokens.accent)
            if showError && !agreed { Notice(text: L("join_terms_required"), danger: true) }
        }
    }
}

extension Character {
    var isASCIIDigit: Bool { ("0"..."9").contains(self) }
}
