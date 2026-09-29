// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

import SwiftUI

/** How to play: seats and queue, the on-screen gamepad, controllers, voice and chat. */
struct HelpSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(L("help_title")).font(.title2.weight(.bold)).foregroundStyle(Tokens.text)
                Text(L("help_intro")).foregroundStyle(Tokens.muted)
                section("person.3", L("help_seats_title"), L("help_seats"))
                section("hand.tap", L("help_touch_title"), L("help_touch"))
                section("gamecontroller", L("help_controller_title"), L("help_controller"))
                section("mic", L("help_voice_title"), L("help_voice"))
                PrimaryButton(title: L("help_close")) { dismiss() }.accessibilityIdentifier("help-close")
            }
            .padding(22)
        }
        .background(Tokens.surface.ignoresSafeArea())
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private func section(_ icon: String, _ title: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(title, systemImage: icon).font(.headline).foregroundStyle(Tokens.accent)
            Text(text).font(.subheadline).foregroundStyle(Tokens.text2)
        }
    }
}
